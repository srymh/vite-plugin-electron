import type { UserConfig } from 'vite'

/**
 * Rolldown watcher から受け取るイベントのうち、この plugin が参照する最小形。
 */
export type BuildWatcherEvent = {
  code: string
  error?: unknown
}

/** Electron main process 用 custom environment 名。 */
export const ELECTRON_MAIN_ENVIRONMENT_NAME = 'electron_main'
/** Electron preload script 用 custom environment 名。 */
export const ELECTRON_PRELOAD_ENVIRONMENT_NAME = 'electron_preload'
/** Electron 生成物の既定出力先。 */
export const ELECTRON_OUT_DIR = 'dist-electron'
/** renderer dev server URL を Electron へ渡す既定の環境変数名。 */
export const DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR = 'VITE_DEV_SERVER_URL'

/** plugin 内で扱う Electron custom environment 名の union。 */
export type ElectronEnvironmentName =
  | typeof ELECTRON_MAIN_ENVIRONMENT_NAME
  | typeof ELECTRON_PRELOAD_ENVIRONMENT_NAME

/** dev 中の Electron debugger 接続を制御する公開設定。 */
export type ElectronDebugOptions = {
  enabled?: boolean
  host?: string
  port?: number
  break?: boolean
  rendererPort?: number
}

/** renderer の配置方式を表す公開設定。 */
export type ElectronRendererMode = 'internal' | 'external'

/** renderer dev server の到達待ち方式を表す公開設定。 */
export type ElectronRendererWaitForReadyMode = 'auto' | 'always' | 'off'

/** external renderer の起動待ちを制御する公開設定。 */
export type ElectronRendererWaitForReadyOptions = {
  mode?: ElectronRendererWaitForReadyMode
  timeoutMs?: number
  intervalMs?: number
  requestTimeoutMs?: number
}

/** Electron main が参照する renderer の場所を制御する公開設定。 */
export type ElectronRendererOptions = {
  mode?: ElectronRendererMode
  devUrl?: string
  devUrlEnvVar?: string
  waitForReady?: ElectronRendererWaitForReadyOptions
}

/** preload entry 名から source path を引く正規化済み map。 */
export type ElectronPreloadEntryMap = Record<string, string>

/** preload entry の 1 件分を表す入力型。 */
export type ElectronPreloadEntry =
  | string
  | {
      name?: string
      entry: string
    }

/**
 * preload entry として受け取れる入力形式の union。
 *
 * 文字列、配列、名前付き map のいずれも受け入れる。
 */
export type ElectronPreloadInput =
  | ElectronPreloadEntry
  | ElectronPreloadEntry[]
  | ElectronPreloadEntryMap

/**
 * Electron main process の設定。
 *
 * entry に main process の source path を指定し、vite で Vite 設定を個別に上書きできる。
 */
export type ElectronMainOptions = {
  entry: string
  vite?: UserConfig
}

/**
 * Electron preload script の設定。
 *
 * entry に preload source を指定し、vite で Vite 設定を個別に上書きできる。
 */
export type ElectronPreloadOptions = {
  entry: ElectronPreloadInput
  vite?: UserConfig
}

/** plugin 利用者へ公開する最上位オプション。 */
export type ElectronPluginOptions = {
  main: ElectronMainOptions
  preload?: ElectronPreloadOptions
  debug?: boolean | ElectronDebugOptions
  renderer?: ElectronRendererOptions
}

/** 内部で常に具体値へ解決した debug 設定。 */
export type ResolvedElectronDebugOptions = {
  enabled: boolean
  host: string
  port: number
  break: boolean
  rendererPort: number
}

/** 内部で常に具体値へ解決した renderer 設定。 */
export type ResolvedElectronRendererWaitForReadyOptions = {
  mode: ElectronRendererWaitForReadyMode
  timeoutMs: number
  intervalMs: number
  requestTimeoutMs: number
}

/** 内部で常に具体値へ解決した renderer 設定。 */
export type ResolvedElectronRendererOptions = {
  mode: ElectronRendererMode
  devUrl?: string
  devUrlEnvVar: string
  waitForReady: ResolvedElectronRendererWaitForReadyOptions
}

/**
 * plugin 内部で利用する完全解決済みオプション。
 *
 * 公開 API の option を path 解決・default 適用した結果を保持し、以降の module は
 * できるだけこの型だけを受け取る。
 */
export type ResolvedElectronPluginOptions = {
  rootDir: string
  mainEntry: string
  mainEntryName: string
  mainViteOverrides: UserConfig
  preloadEntries: ElectronPreloadEntryMap
  preloadViteOverrides: UserConfig
  debugOptions: ResolvedElectronDebugOptions
  rendererOptions: ResolvedElectronRendererOptions
  outDir: string
  mainOutDir: string
  preloadOutDir: string
  mainOutputPath: string
}
