import { type ChildProcess } from 'node:child_process'
import process from 'node:process'

import { createBuilder, type ViteDevServer } from 'vite'

import {
  createElectronBuildCoordinator,
  createRestartScheduler,
  resolveElectronBuildEventOutcome,
  type ElectronBuildCoordinator,
} from './dev-state'
import { getElectronWatchEnvironmentNames } from './environment'
import { restartElectronProcess, stopElectronProcess } from './process'
import {
  type BuildWatcherEvent,
  type ElectronEnvironmentName,
  type ElectronPreloadEntryMap,
  type ResolvedElectronDebugOptions,
} from './types'

/**
 * Rollup watch builder が返す watcher のうち、この plugin が利用する最小インターフェース。
 *
 * Vite 側の具体型に強く依存しすぎないよう、必要な `on` と `close` だけに絞っている。
 */
type BuildWatcher = {
  on(eventName: 'event', listener: (event: BuildWatcherEvent) => void): void
  close(): void | Promise<void>
}

/**
 * dev 時に保持する Electron watch session の終了インターフェース。
 */
type ElectronDevSession = {
  close(): Promise<void>
}

/**
 * dev orchestration が必要とする解決済み入力。
 *
 * plugin 公開 API の option ではなく、watch build と Electron 起動に必要な値だけへ
 * 正規化した内部用の引数である。
 */
type ElectronDevOptions = {
  preloadEntries: ElectronPreloadEntryMap
  debug: ResolvedElectronDebugOptions
  mainOutputPath: string
  rendererDevUrl?: string
  rendererDevUrlEnvVar: string
  onRestart: (childProcess: ChildProcess) => void
}

/**
 * Vite dev server の lifecycle に Electron 側の watch build と process lifecycle を接続する。
 *
 * この関数は次の接着だけを担当する。
 * - HTTP server の `listening` / `close` へのフック
 * - process exit 時の後始末登録
 * - dev session の開始と終了
 *
 * 実際の build 判定は internals、プロセス起動停止は process module に委譲する。
 *
 * @param server Vite dev server
 * @param options Electron dev 実行に必要な解決済みオプション
 */
export function registerElectronDevServer(
  server: ViteDevServer,
  options: ElectronDevOptions,
): void {
  const httpServer = server.httpServer

  if (!httpServer) {
    return
  }

  let activeSession: ElectronDevSession | undefined
  let activeElectronProcess: ChildProcess | undefined
  let isClosed = false

  /**
   * 現在起動中の Electron process を停止し、参照を破棄する。
   *
   * close path が複数回呼ばれても安全に扱えるよう、停止対象をローカル変数へ退避してから
   * state を初期化している。
   */
  const closeElectron = () => {
    const currentElectronProcess = activeElectronProcess
    activeElectronProcess = undefined

    void stopElectronProcess(currentElectronProcess).catch((error: unknown) => {
      console.error('[vite-plugin-electron] Failed to stop Electron process')
      console.error(error)
    })
  }

  /**
   * dev session 全体を閉じる。
   *
   * HTTP server close と startup failure の両方から呼ばれるため、二重 close を防ぐための
   * ガードを先頭に置く。session close より先に process exit listener を解除し、以後の
   * cleanup が重複しないようにしている。
   */
  const closeSession = () => {
    if (isClosed) {
      return
    }

    isClosed = true
    process.off('exit', closeElectron)

    const currentSession = activeSession
    activeSession = undefined

    closeElectron()

    if (!currentSession) {
      return
    }

    void currentSession.close()
  }

  process.once('exit', closeElectron)
  httpServer.once('close', closeSession)

  httpServer.once('listening', async () => {
    try {
      const session = await startElectronDevSession(server, {
        ...options,
        onRestart(childProcess) {
          activeElectronProcess = childProcess

          // Electron がユーザー操作（ウィンドウを閉じるなど）で自発的に終了した場合、
          // Vite dev server ごとプロセスを停止する。
          // restart による意図的な停止では closeElectron() が先に
          // activeElectronProcess を undefined にするため、
          // このガード条件で誤って exit しない。
          childProcess.once('exit', () => {
            if (activeElectronProcess === childProcess) {
              // Vite dev server を graceful に閉じてからプロセスを終了する。
              //
              // exit code を 0 ではなく 1 にしている理由:
              // pnpm --parallel は子プロセスが非ゼロで終了した場合のみ、
              // 残りの兄弟プロセスを停止する。exit(0) だと external renderer
              // 構成（dev:multiple）で web dev server が残り続けてしまう。
              // dev server の中断終了なので exit code 1 は意味的にも妥当。
              void server.close().finally(() => {
                process.exit(1)
              })
            }
          })

          options.onRestart(childProcess)
        },
      })

      if (isClosed) {
        await session.close()
        return
      }

      activeSession = session
    } catch (error: unknown) {
      server.config.logger.error(String(error))
      closeSession()
    }
  })
}

/**
 * Electron 側の watch build を開始し、build 完了イベントに応じて再起動する session を作る。
 *
 * ここで作る session は dev server の 1 ライフサイクルに対応し、close 時には生成した
 * すべての watcher を停止する。
 *
 * @param server Vite dev server
 * @param options Electron dev 実行に必要な解決済みオプション
 * @returns close 可能な session
 */
async function startElectronDevSession(
  server: ViteDevServer,
  options: ElectronDevOptions,
): Promise<ElectronDevSession> {
  const devServerUrl = resolveDevServerUrl(server, options.rendererDevUrl)
  const hasPreloadEntries = Object.keys(options.preloadEntries).length > 0
  const environmentNames = getElectronWatchEnvironmentNames(hasPreloadEntries)

  // 起動済み dev server の resolved config から必要な設定を引き継ぐ。
  // createBuilder は InlineConfig を受け取り、内部で config ファイルを再読み込みするため、
  // root / configFile / mode を合わせれば plugin 解決や alias/define も一致する。
  const { root, configFile, mode } = server.config

  const builder = await createBuilder({
    root,
    configFile,
    mode,
    build: {
      watch: {},
    },
  })
  const watchers = await createElectronBuildWatchers(builder, environmentNames)
  let currentElectronProcess: ChildProcess | undefined
  const buildCoordinator = createElectronBuildCoordinator(hasPreloadEntries)
  const restartScheduler = createRestartScheduler()

  /**
   * 再起動要求を scheduler へ渡し、実行権を得られたときだけ restart loop を起動する。
   *
   * 複数の build 完了が短時間に重なっても、実際の再起動は scheduler により畳み込まれる。
   */
  const scheduleRestart = () => {
    const outcome = restartScheduler.requestRestart()

    if (!outcome.shouldStart) {
      return
    }

    void runScheduledRestarts()
  }

  /**
   * pending restart がなくなるまで Electron 再起動を逐次実行する。
   *
   * 各 restart の成否にかかわらず scheduler を進めることで、次の pending restart があれば
   * そのまま継続し、なければ loop を抜ける。
   */
  const runScheduledRestarts = async () => {
    let shouldContinue = true

    while (shouldContinue) {
      try {
        const childProcess = await restartElectronProcess(
          currentElectronProcess,
          {
            debug: options.debug,
            mainOutputPath: options.mainOutputPath,
            devServerUrl,
            devServerUrlEnvVar: options.rendererDevUrlEnvVar,
          },
        )

        currentElectronProcess = childProcess
        options.onRestart(childProcess)
      } catch (error: unknown) {
        server.config.logger.error(String(error))
      }

      shouldContinue = restartScheduler.finishRestart().shouldStart
    }
  }

  for (const { environmentName, watcher } of watchers) {
    watcher.on('event', (event) => {
      handleBuildEvent(
        server,
        buildCoordinator,
        environmentName,
        event,
        scheduleRestart,
      )
    })
  }

  return {
    async close() {
      await Promise.all(watchers.map(({ watcher }) => watcher.close()))
    },
  }
}

/**
 * Vite dev server から renderer URL を解決する。
 *
 * Electron main process はこの URL を環境変数経由で受け取り、renderer を
 * `loadURL` するため、dev 起動前に必ず解決できる必要がある。
 *
 * @param server Vite dev server
 * @returns 利用可能な dev server URL
 * @throws URL を解決できない場合
 */
function resolveDevServerUrl(
  server: ViteDevServer,
  rendererDevUrl?: string,
): string {
  if (rendererDevUrl) {
    return rendererDevUrl
  }

  const devServerUrl =
    server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]

  if (!devServerUrl) {
    throw new Error('Could not resolve the Vite dev server URL')
  }

  return devServerUrl
}

/**
 * 指定された Electron environment 群に対する watcher を順番に作成する。
 *
 * preload の有無によって対象 environment は変わるが、この関数は渡された配列をそのまま
 * 処理するため、main/preload の分岐は呼び出し側へ漏れない。
 *
 * @param builder Vite builder
 * @param environmentNames watch build の対象 environment 一覧
 * @returns environment 名と watcher の組の配列
 * @throws 必要な environment が builder 上に見つからない場合
 */
async function createElectronBuildWatchers(
  builder: Awaited<ReturnType<typeof createBuilder>>,
  environmentNames: ElectronEnvironmentName[],
): Promise<
  Array<{ environmentName: ElectronEnvironmentName; watcher: BuildWatcher }>
> {
  const watchers: Array<{
    environmentName: ElectronEnvironmentName
    watcher: BuildWatcher
  }> = []

  for (const environmentName of environmentNames) {
    const environment = builder.environments[environmentName]

    if (!environment) {
      throw new Error(`Missing ${environmentName} environment`)
    }

    watchers.push({
      environmentName,
      watcher: asBuildWatcher(await builder.build(environment)),
    })
  }

  return watchers
}

/**
 * 単一の build watcher event を評価し、必要なら logger 出力または restart を実行する。
 *
 * event 自体の意味づけは internals 側の pure helper に委譲し、この関数は結果に応じて
 * 副作用を発生させるだけに保っている。
 *
 * @param server Vite dev server
 * @param buildCoordinator build 完了状態を管理する coordinator
 * @param environmentName event を発生させた environment 名
 * @param event watcher event
 * @param scheduleRestart restart 実行を要求する callback
 */
function handleBuildEvent(
  server: ViteDevServer,
  buildCoordinator: ElectronBuildCoordinator,
  environmentName: ElectronEnvironmentName,
  event: BuildWatcherEvent,
  scheduleRestart: () => void,
) {
  const outcome = resolveElectronBuildEventOutcome(
    buildCoordinator,
    environmentName,
    event,
  )

  if (outcome.type === 'error') {
    server.config.logger.error(String(outcome.error))
    return
  }

  if (outcome.type === 'restart') {
    scheduleRestart()
  }
}

/**
 * 不透明な builder 戻り値を、この plugin が期待する watcher 形へ絞り込む。
 *
 * Vite 側の戻り値は型上広いため、実行時チェックを 1 箇所にまとめて以降の処理を単純化する。
 *
 * @param value builder.build の戻り値
 * @returns `on` と `close` を備えた watcher
 * @throws watcher を生成できなかった場合
 */
function asBuildWatcher(value: unknown): BuildWatcher {
  if (
    !value ||
    typeof value !== 'object' ||
    !('on' in value) ||
    !('close' in value)
  ) {
    throw new Error('Electron build watcher was not created')
  }

  return value as BuildWatcher
}
