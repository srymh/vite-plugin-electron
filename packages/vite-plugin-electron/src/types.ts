/**
 * Rollup watcher から受け取るイベントのうち、この plugin が参照する最小形。
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
/** Electron main entry の論理名。 */
export const MAIN_ENTRY_NAME = 'main'
/** Electron main entry の既定パス。 */
export const DEFAULT_MAIN_ENTRY = 'electron/main.ts'

/** plugin 内で扱う Electron custom environment 名の union。 */
export type ElectronEnvironmentName =
  | typeof ELECTRON_MAIN_ENVIRONMENT_NAME
  | typeof ELECTRON_PRELOAD_ENVIRONMENT_NAME

/**
 * Electron build に対して利用者へ公開する設定項目。
 *
 * entry 解決や出力ファイル名のように plugin 側で責務を持つ値はここへ含めない。
 */
export type ElectronBuildOptions = {
  outDir?: string
  emptyOutDir?: boolean
  copyPublicDir?: boolean
  emitAssets?: boolean
  minify?: boolean | 'esbuild' | 'terser'
  reportCompressedSize?: boolean
  sourcemap?: boolean | 'inline' | 'hidden'
  target?: string | string[]
  external?: string[]
  chunkFileNames?: string
}

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

/** Electron main が参照する renderer の場所を制御する公開設定。 */
export type ElectronRendererOptions = {
  mode?: ElectronRendererMode
  devUrl?: string
  devUrlEnvVar?: string
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

/** preload 設定として受け取れる入力形式の union。 */
export type ElectronPreloadOptions =
  | ElectronPreloadEntry
  | ElectronPreloadEntry[]
  | ElectronPreloadEntryMap

/** plugin 利用者へ公開する最上位オプション。 */
export type ElectronPluginOptions = {
  main?: string
  preload?: ElectronPreloadOptions
  build?: ElectronBuildOptions
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
export type ResolvedElectronRendererOptions = {
  mode: ElectronRendererMode
  devUrl?: string
  devUrlEnvVar: string
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
  preloadEntries: ElectronPreloadEntryMap
  buildOptions: ElectronBuildOptions
  debugOptions: ResolvedElectronDebugOptions
  rendererOptions: ResolvedElectronRendererOptions
  outDir: string
  mainOutputPath: string
}
