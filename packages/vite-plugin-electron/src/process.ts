import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

import {
  getElectronSpawnArgs,
  getElectronSpawnEnv,
  isProcessStopRequired,
  isSuccessfulWindowsTaskkillExitCode,
} from './options'
import { type ResolvedElectronDebugOptions } from './types'

/**
 * Electron child process の起動に必要な入力。
 *
 * dev orchestration からは process 制御に必要な値だけを受け取り、Vite server 本体や
 * plugin 全体の option 構造はここへ持ち込まない。
 */
type LaunchElectronProcessOptions = {
  debug: ResolvedElectronDebugOptions
  rootDir: string
  devServerUrl: string
  devServerUrlEnvVar: string
}

/** SIGTERM 送信後に SIGKILL へ昇格するまでの待ち時間 (ms)。 */
const SIGTERM_TIMEOUT_MS = 5_000

/** SIGKILL 送信後に停止を諦めるまでの最終タイムアウト (ms)。 */
const SIGKILL_TIMEOUT_MS = 3_000

/** taskkill 応答待ちの最大時間 (ms)。 */
const TASKKILL_TIMEOUT_MS = 10_000

const require = createRequire(import.meta.url)
const electronBinary = require('electron')

/**
 * 既存の Electron process を停止し、新しい process を起動する。
 *
 * restart というユースケースを 1 関数に閉じ込めることで、呼び出し側は stop と launch の
 * 順序や platform 差異を意識せずに済む。
 *
 * @param currentElectronProcess 現在動作中の process
 * @param options 新しく起動する process の設定
 * @returns 新しく起動した Electron process
 */
export async function restartElectronProcess(
  currentElectronProcess: ChildProcess | undefined,
  options: LaunchElectronProcessOptions,
): Promise<ChildProcess> {
  await stopElectronProcess(currentElectronProcess)
  return launchElectronProcess(options)
}

/**
 * Electron binary を起動する。
 *
 * debug 有効時は main process inspector の待受情報を標準出力へ出し、VS Code からの attach
 * を追いやすくしている。
 *
 * macOS / Linux では `detached: true` で起動し、Electron を独自のプロセスグループリーダーに
 * する。停止時に `process.kill(-pid)` でグループ全体を落とせるようにするためである。
 * Windows では `detached` は新しいコンソールウィンドウを生むため使わず、代わりに
 * `taskkill /t` でプロセスツリーごと停止する。
 *
 * @param options 起動設定
 * @returns 起動した child process
 */
export function launchElectronProcess(
  options: LaunchElectronProcessOptions,
): ChildProcess {
  const electronArgs = getElectronSpawnArgs(options.debug, options.rootDir)

  if (options.debug.enabled) {
    console.log(
      `[vite-plugin-electron] Electron inspector listening on ${options.debug.host}:${options.debug.port}`,
    )
  }

  const isWindows = process.platform === 'win32'

  return spawn(electronBinary, electronArgs, {
    stdio: 'inherit',
    env: getElectronSpawnEnv(options.devServerUrl, options.devServerUrlEnvVar),
    detached: !isWindows,
  })
}

/**
 * Electron child process を安全に停止する。
 *
 * 停止不要な process は早期 return し、プラットフォームに応じた手段でプロセスツリー
 * 全体を停止する。
 *
 * - **Windows**: `taskkill /t /f` でプロセスツリーを強制終了する。
 * - **macOS / Linux**: `process.kill(-pid)` でプロセスグループ全体へ signal を送る。
 *   `launchElectronProcess` が `detached: true` で起動しているため、Electron が
 *   プロセスグループリーダーとなり、negative PID で GPU プロセスなどの子も含めて
 *   一括停止できる。SIGTERM → タイムアウト → SIGKILL のエスカレーション戦略を使う。
 *
 * @param childProcess 停止対象の process
 */
export async function stopElectronProcess(
  childProcess: ChildProcess | undefined,
): Promise<void> {
  if (!isProcessStopRequired(childProcess)) {
    return
  }

  if (process.platform === 'win32') {
    await stopWindowsProcessTree(childProcess.pid)
    return
  }

  await stopProcessGroup(childProcess)
}

/**
 * macOS / Linux でプロセスグループ全体を SIGTERM → SIGKILL で停止する。
 *
 * `process.kill(-pid, signal)` は negative PID を使って対象のプロセスグループ全体に
 * signal を送る POSIX の仕組みである。`launchElectronProcess` が `detached: true` で
 * 起動した Electron がグループリーダーとなっているため、GPU プロセスなどの子プロセスも
 * まとめて停止できる。
 *
 * negative PID への signal 送信が失敗した場合（既に終了済みなど）は、フォールバック
 * として child process 単体へ直接 signal を送る。
 *
 * @param childProcess 停止対象の process（PID 確定済み）
 */
async function stopProcessGroup(
  childProcess: ChildProcess & { pid: number },
): Promise<void> {
  killProcessGroup(childProcess, 'SIGTERM')

  const exitedGracefully = await waitForProcessExit(
    childProcess,
    SIGTERM_TIMEOUT_MS,
  )

  if (exitedGracefully) {
    return
  }

  // SIGTERM でタイムアウトした場合は SIGKILL へ昇格する。
  killProcessGroup(childProcess, 'SIGKILL')

  const exitedAfterKill = await waitForProcessExit(
    childProcess,
    SIGKILL_TIMEOUT_MS,
  )

  if (!exitedAfterKill) {
    console.warn(
      `[vite-plugin-electron] Electron process (pid ${childProcess.pid}) did not exit after SIGKILL`,
    )
  }
}

/**
 * プロセスグループ全体へ signal を送り、失敗時は child process 単体にフォールバックする。
 *
 * negative PID への `process.kill` は、対象プロセスが既に終了していると ESRCH を投げる
 * ため、try/catch で吸収する。
 *
 * @param childProcess signal 送信先の process
 * @param signal 送信する signal
 */
function killProcessGroup(
  childProcess: ChildProcess & { pid: number },
  signal: NodeJS.Signals,
): void {
  try {
    process.kill(-childProcess.pid, signal)
  } catch {
    // プロセスグループが既に存在しない場合は child process 単体に試みる。
    childProcess.kill(signal)
  }
}

/**
 * child process の終了を一定時間待つ。
 *
 * すでに終了済みなら即座に解決する。タイムアウトを指定した場合、制限時間内に
 * 終了しなければ false を返す。
 *
 * @param childProcess 終了待ち対象の process
 * @param timeoutMs 最大待ち時間。0 以下で無制限
 * @returns 正常に終了した場合 true、タイムアウトした場合 false
 */
function waitForProcessExit(
  childProcess: ChildProcess,
  timeoutMs: number = 0,
): Promise<boolean> {
  return new Promise((resolveExit) => {
    if (childProcess.exitCode !== null) {
      resolveExit(true)
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    const onExit = () => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }

      resolveExit(true)
    }

    childProcess.once('exit', onExit)

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        childProcess.off('exit', onExit)
        resolveExit(false)
      }, timeoutMs)
    }
  })
}

/**
 * Windows 上で child process tree を強制終了する。
 *
 * Electron は子プロセスをぶら下げることがあるため、単一 PID への signal ではなく
 * `taskkill /t /f` を使って tree 全体を止める。
 *
 * 一定時間内に taskkill が完了しない場合はエラーとして reject する。
 *
 * @param pid 停止対象の親 process ID
 * @returns 停止完了後に解決する Promise
 */
async function stopWindowsProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolveTaskkill, rejectTaskkill) => {
    const taskkill = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      taskkill.kill()
      rejectTaskkill(
        new Error(
          `taskkill timed out after ${TASKKILL_TIMEOUT_MS}ms for pid ${pid}`,
        ),
      )
    }, TASKKILL_TIMEOUT_MS)

    taskkill.once('error', (error) => {
      clearTimeout(timer)
      rejectTaskkill(error)
    })

    taskkill.once('exit', (code) => {
      clearTimeout(timer)

      if (isSuccessfulWindowsTaskkillExitCode(code)) {
        resolveTaskkill()
        return
      }

      rejectTaskkill(
        new Error(`taskkill exited with code ${code} for pid ${pid}`),
      )
    })
  })
}
