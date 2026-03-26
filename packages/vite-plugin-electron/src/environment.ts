import {
  ELECTRON_MAIN_ENVIRONMENT_NAME,
  ELECTRON_PRELOAD_ENVIRONMENT_NAME,
  MAIN_ENTRY_NAME,
  type ElectronEnvironmentName,
  type ElectronPreloadEntryMap,
  type ResolvedElectronPluginOptions,
} from './types'

/** external renderer mode で client build に差し込む仮想 entry の公開 ID。 */
export const EXTERNAL_RENDERER_CLIENT_ENTRY_ID =
  'virtual:vite-plugin-electron/external-renderer-client-entry'
/** plugin 内部で扱う仮想 client entry の解決済み ID。 */
export const RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID =
  '\0vite-plugin-electron/external-renderer-client-entry'

/** Vite の environments 設定へ注入する Electron environment 定義。 */
type ElectronEnvironmentDefinition = {
  consumer: 'server'
  keepProcessEnv: true
}

/**
 * preload の有無に応じて必要な Electron environments 定義を返す。
 *
 * preload がなければ main だけ、あれば main と preload の両方を登録する。
 *
 * @param preloadEntries 正規化済み preload entry 一覧
 * @returns Vite 設定へ注入する custom environment 定義
 */
export function createElectronEnvironmentDefinitions(
  preloadEntries: ElectronPreloadEntryMap,
): Record<string, ElectronEnvironmentDefinition> {
  return {
    [ELECTRON_MAIN_ENVIRONMENT_NAME]: {
      consumer: 'server',
      keepProcessEnv: true,
    },
    ...(Object.keys(preloadEntries).length > 0
      ? {
          [ELECTRON_PRELOAD_ENVIRONMENT_NAME]: {
            consumer: 'server',
            keepProcessEnv: true,
          },
        }
      : {}),
  }
}

/**
 * 指定された Electron environment 用の build 設定を組み立てる。
 *
 * main と preload では entry source と出力フォーマットが異なるため、environment 名に応じて
 * `rolldownOptions.input` と `output` を切り替える。
 *
 * @param name build 設定を生成する environment 名
 * @param resolvedOptions 解決済み plugin オプション
 * @returns Electron 用 build 設定
 */
export function createElectronEnvironmentBuildConfig(
  name: ElectronEnvironmentName,
  resolvedOptions: ResolvedElectronPluginOptions,
) {
  const { buildOptions, outDir, mainEntry, preloadEntries } = resolvedOptions
  const shouldEmptyOutDir =
    name === ELECTRON_MAIN_ENVIRONMENT_NAME
      ? (buildOptions.emptyOutDir ?? true)
      : false

  return {
    build: {
      outDir,
      emptyOutDir: shouldEmptyOutDir,
      copyPublicDir: buildOptions.copyPublicDir ?? false,
      emitAssets: buildOptions.emitAssets ?? false,
      minify: buildOptions.minify ?? false,
      reportCompressedSize: buildOptions.reportCompressedSize ?? false,
      sourcemap: buildOptions.sourcemap ?? true,
      target: buildOptions.target ?? 'node22',
      rolldownOptions: {
        input:
          name === ELECTRON_MAIN_ENVIRONMENT_NAME
            ? { [MAIN_ENTRY_NAME]: mainEntry }
            : preloadEntries,
        external: [...new Set(['electron', ...(buildOptions.external ?? [])])],
        output: {
          entryFileNames:
            name === ELECTRON_MAIN_ENVIRONMENT_NAME
              ? '[name].js'
              : '[name].cjs',
          format: name === ELECTRON_MAIN_ENVIRONMENT_NAME ? 'es' : 'cjs',
          chunkFileNames:
            buildOptions.chunkFileNames ?? 'chunks/[name]-[hash].js',
        },
      },
    },
  }
}

/**
 * external renderer mode 用に、client environment へ空の仮想 entry を差し込む。
 *
 * `vite build --app` は client environment も同時に build するため、desktop package が
 * HTML を持たない構成でも build を成立させるには `index.html` 以外の入口が必要になる。
 *
 * @returns client environment 用の最小 build 設定
 */
export function createExternalRendererClientBuildConfig() {
  return {
    build: {
      copyPublicDir: false,
      rolldownOptions: {
        input: EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
      },
    },
  }
}

/**
 * external renderer mode の placeholder client build が生成した bundle 出力を取り除く。
 *
 * build 成立のために client environment 自体は走らせるが、desktop package 側には
 * renderer 資産を残したくないため、最終出力だけを空にする。
 *
 * @param bundle Rollup が書き出し直前に持つ bundle
 */
export function removeExternalRendererClientBuildOutputs(
  bundle: Record<string, unknown>,
) {
  for (const fileName of Object.keys(bundle)) {
    delete bundle[fileName]
  }
}

/**
 * preload の有無から、watch build が必要な environment 名の一覧を返す。
 *
 * @param hasPreloadEntries preload build が必要か
 * @returns watch 対象 environment 名の配列
 */
export function getElectronWatchEnvironmentNames(
  hasPreloadEntries: boolean,
): ElectronEnvironmentName[] {
  return hasPreloadEntries
    ? [ELECTRON_MAIN_ENVIRONMENT_NAME, ELECTRON_PRELOAD_ENVIRONMENT_NAME]
    : [ELECTRON_MAIN_ENVIRONMENT_NAME]
}
