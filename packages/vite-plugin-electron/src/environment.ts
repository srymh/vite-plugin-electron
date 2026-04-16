import { mergeConfig, type UserConfig } from 'vite'

import {
  ELECTRON_MAIN_ENVIRONMENT_NAME,
  ELECTRON_PRELOAD_ENVIRONMENT_NAME,
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
 * まず plugin のベースデフォルトを構築し、ユーザーの vite override を Vite の
 * `mergeConfig` で deep merge したあと、plugin が管理すべき不変の制約を再適用する。
 *
 * @param name build 設定を生成する environment 名
 * @param resolvedOptions 解決済み plugin オプション
 * @returns Electron 用 build 設定
 */
export function createElectronEnvironmentBuildConfig(
  name: ElectronEnvironmentName,
  resolvedOptions: ResolvedElectronPluginOptions,
): UserConfig {
  const isMain = name === ELECTRON_MAIN_ENVIRONMENT_NAME
  const hasSharedOutDir =
    Object.keys(resolvedOptions.preloadEntries).length > 0 &&
    resolvedOptions.mainOutDir === resolvedOptions.preloadOutDir

  const baseConfig: UserConfig = {
    build: {
      outDir: isMain
        ? resolvedOptions.mainOutDir
        : resolvedOptions.preloadOutDir,
      emptyOutDir: isMain && !hasSharedOutDir,
      copyPublicDir: false,
      emitAssets: false,
      minify: false,
      reportCompressedSize: false,
      sourcemap: true,
      target: 'node22',
      rolldownOptions: {
        external: ['electron'],
        output: {
          entryFileNames: isMain ? '[name].js' : '[name].cjs',
          format: isMain ? 'es' : 'cjs',
          chunkFileNames: 'chunks/[name]-[hash].js',
        },
      },
    },
  }

  const userOverrides = isMain
    ? resolvedOptions.mainViteOverrides
    : resolvedOptions.preloadViteOverrides

  const merged = mergeConfig(baseConfig, userOverrides)

  // --- 不変の制約を再適用 ---

  // rolldownOptions.input は常に plugin が管理する。ユーザーの上書きは無視する。
  merged.build.rolldownOptions.input = isMain
    ? { [resolvedOptions.mainEntryName]: resolvedOptions.mainEntry }
    : resolvedOptions.preloadEntries

  // electron は常に外部化する。mergeConfig が配列を concat するため、
  // ユーザーが external を指定した場合でも electron が含まれることは保証されるが、
  // 念のため重複排除を行う。
  const currentExternal = merged.build.rolldownOptions.external
  if (Array.isArray(currentExternal)) {
    merged.build.rolldownOptions.external = [
      ...new Set(currentExternal as string[]),
    ]
  }

  // preload は main が先にクリーンするため、常に emptyOutDir を無効にする。
  // main でも preload と同じ outDir を共有する場合は無効にする（watch リビルド時に
  // main のクリーンが preload の成果物を巻き添えに削除するのを防ぐ）。
  if (!isMain || hasSharedOutDir) {
    merged.build.emptyOutDir = false
  }

  return merged
}

/**
 * external renderer mode 用に、client environment へ空の仮想 entry を差し込む。
 *
 * `vite build --app` は client environment も同時に build するため、desktop package が
 * HTML を持たない構成でも build を成立させるには `index.html` 以外の入口が必要になる。
 *
 * @returns client environment 用の最小 build 設定
 */
export function createExternalRendererClientBuildConfig(): UserConfig {
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
 * @param bundle Rolldown が書き出し直前に持つ bundle
 */
export function removeExternalRendererClientBuildOutputs(
  bundle: Record<string, unknown>,
): void {
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
