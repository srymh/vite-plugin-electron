import { resolve } from 'node:path'
import process from 'node:process'

import { type Plugin } from 'vite'

import { registerElectronDevServer } from './dev'
import {
  EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
  RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
  createElectronEnvironmentBuildConfig,
  createElectronEnvironmentDefinitions,
  createExternalRendererClientBuildConfig,
  removeExternalRendererClientBuildOutputs,
} from './environment'
import {
  createOutDirIgnorePatterns,
  resolveElectronPluginOptions,
  validatePackageJsonMainField,
} from './options'
import {
  ELECTRON_MAIN_ENVIRONMENT_NAME,
  ELECTRON_PRELOAD_ENVIRONMENT_NAME,
  type ElectronPluginOptions,
} from './types'

export type {
  ElectronDebugOptions,
  ElectronMainOptions,
  ElectronPluginOptions,
  ElectronPreloadEntry,
  ElectronPreloadEntryMap,
  ElectronPreloadInput,
  ElectronPreloadOptions,
  ElectronRendererMode,
  ElectronRendererOptions,
} from './types'

/**
 * Vite 8 の Environment API を使って Electron 向けの custom environment を登録する。
 *
 * この plugin 自体は公開入口に徹し、次の責務だけを持つ。
 * - 利用者オプションの解決
 * - Electron 用 environment 定義の登録
 * - Electron 用 build 設定の差し込み
 * - dev server 起動時の Electron orchestration 開始
 *
 * 実際の判定ロジックやプロセス制御は、可読性と保守性のために
 * options.ts、environment.ts、dev-state.ts、dev.ts へ分離している。
 *
 * @param options plugin 利用者が指定する Electron 向け設定
 * @returns Vite plugin 定義
 */
export function electron(options: ElectronPluginOptions): Plugin {
  const defaultRootDir = process.cwd()
  let resolvedOptions = resolveElectronPluginOptions(options, defaultRootDir)

  /**
   * plugin option を Vite root 基準で再解決する。
   *
   * monorepo では process.cwd と各 app の root が一致しないことがあるため、Vite が
   * 現在扱っている app root を基準に常に再解決する。
   *
   * @param rootDir 解決基準にする Vite root
   * @returns 最新の解決済み option
   */
  const applyResolvedOptions = (rootDir: string) => {
    resolvedOptions = resolveElectronPluginOptions(options, rootDir)
    return resolvedOptions
  }

  return {
    name: 'vite-plugin-electron',
    /**
     * Vite 全体設定へ Electron 用の監視除外パターンと custom environments を注入する。
     *
     * dev 中は Electron の自己生成物を Vite 自身が監視すると再ビルドと再起動の
     * ループを引き起こしやすいため、resolved outDir を watch ignore へ追加する。
     * さらに preload の有無に応じて、必要な custom environment だけを登録する。
     *
     * @returns Vite の部分設定
     */
    config(config) {
      const currentRootDir = config.root
        ? resolve(defaultRootDir, config.root)
        : defaultRootDir
      const currentOptions = applyResolvedOptions(currentRootDir)

      return {
        builder: {},
        ...(currentOptions.rendererOptions.mode === 'external'
          ? {
              appType: 'custom' as const,
            }
          : {}),
        server: {
          watch: {
            ignored: createOutDirIgnorePatterns(
              currentOptions,
              currentOptions.rootDir,
            ),
          },
        },
        environments: createElectronEnvironmentDefinitions(
          currentOptions.preloadEntries,
        ),
      }
    },
    /**
     * external renderer mode 用の仮想 client entry を解決する。
     *
     * `vite build --app` では client environment が必ず build 対象になるため、HTML を
     * 持たない desktop package でも build できるよう、空 module へ解決する。
     *
     * @param id 解決対象の module ID
     * @returns plugin が扱う仮想 module なら解決済み ID
     */
    resolveId(id) {
      if (
        resolvedOptions.rendererOptions.mode === 'external' &&
        id === EXTERNAL_RENDERER_CLIENT_ENTRY_ID
      ) {
        return RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID
      }
    },
    /**
     * external renderer mode 用の仮想 client entry 本体を返す。
     *
     * client build 自体は維持しつつ、実際の renderer 資産は外部 app 側に任せるため、
     * 内容は空 module にする。
     *
     * @param id 読み込み対象の module ID
     * @returns 仮想 entry の source code
     */
    load(id) {
      if (
        resolvedOptions.rendererOptions.mode === 'external' &&
        id === RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID
      ) {
        return 'export {}\n'
      }
    },
    /**
     * external renderer mode の placeholder client build 出力を最終 bundle から落とす。
     *
     * client environment 自体は Vite app build 成立のために必要だが、desktop package 側へ
     * 空 JS を残す必要はないため、書き出し直前に削除する。
     */
    generateBundle(_, bundle) {
      if (
        resolvedOptions.rendererOptions.mode !== 'external' ||
        this.environment.name !== 'client'
      ) {
        return
      }

      removeExternalRendererClientBuildOutputs(
        bundle as Record<string, unknown>,
      )
    },
    /**
     * Vite が確定させた root を基準に option を再解決する。
     *
     * `config()` 時点では利用者設定の `root` しか見えないため、最終的な解決値はここで
     * 確定させる。
     *
     * @param config Vite の解決済み設定
     */
    configResolved(config) {
      applyResolvedOptions(config.root)
    },
    /**
     * renderer dev server が起動したあとに Electron 側の watch build と再起動制御を接続する。
     *
     * ここでは orchestration の開始だけを行い、実際の watcher 管理や Electron
     * プロセス制御は dev.ts 側へ委譲する。
     *
     * @param server Vite dev server
     */
    async configureServer(server) {
      validatePackageJsonMainField(
        resolvedOptions.rootDir,
        resolvedOptions.mainOutputPath,
      )

      registerElectronDevServer(server, {
        preloadEntries: resolvedOptions.preloadEntries,
        debug: resolvedOptions.debugOptions,
        rootDir: resolvedOptions.rootDir,
        rendererDevUrl: resolvedOptions.rendererOptions.devUrl,
        rendererDevUrlEnvVar: resolvedOptions.rendererOptions.devUrlEnvVar,
        onRestart() {},
      })
    },
    /**
     * Electron 用 custom environment に対してのみ専用 build 設定を返す。
     *
     * client 環境や他 plugin の environment には影響を与えないよう、対象外の名前では
     * `undefined` を返す。対象環境では main/preload それぞれに適した出力形式と entry を与える。
     *
     * @param name Vite が解決中の environment 名
     * @returns 対象環境なら Electron 用 build 設定、対象外なら `undefined`
     */
    configEnvironment(name) {
      if (
        name === 'client' &&
        resolvedOptions.rendererOptions.mode === 'external'
      ) {
        return createExternalRendererClientBuildConfig() as never
      }

      if (
        name !== ELECTRON_MAIN_ENVIRONMENT_NAME &&
        name !== ELECTRON_PRELOAD_ENVIRONMENT_NAME
      ) {
        return
      }

      return createElectronEnvironmentBuildConfig(
        name,
        resolvedOptions,
      ) as never
    },
  }
}
