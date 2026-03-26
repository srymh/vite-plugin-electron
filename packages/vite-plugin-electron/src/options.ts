import { basename, extname, relative, resolve } from 'node:path'
import process from 'node:process'

import {
  DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR,
  DEFAULT_MAIN_ENTRY,
  ELECTRON_OUT_DIR,
  MAIN_ENTRY_NAME,
  type ElectronPluginOptions,
  type ElectronPreloadEntryMap,
  type ElectronPreloadOptions,
  type ResolvedElectronDebugOptions,
  type ResolvedElectronPluginOptions,
  type ResolvedElectronRendererOptions,
} from './types'

/**
 * 利用者オプションを plugin 実行に必要な内部表現へ正規化する。
 *
 * ここでは default 値の適用、entry path の絶対パス化、preload 設定の正規化、
 * debug 設定の具体化を行う。
 *
 * @param options plugin 利用者が与えたオプション
 * @param cwd path 解決の基準ディレクトリ
 * @returns 内部利用向けに解決済みのオプション
 */
export function resolveElectronPluginOptions(
  options: ElectronPluginOptions = {},
  cwd: string = process.cwd(),
): ResolvedElectronPluginOptions {
  const buildOptions = options.build ?? {}
  const preloadEntries = Object.fromEntries(
    Object.entries(normalizePreloadEntries(options.preload)).map(
      ([name, source]) => [name, resolve(cwd, source)],
    ),
  )
  const outDir = buildOptions.outDir ?? ELECTRON_OUT_DIR

  return {
    rootDir: cwd,
    mainEntry: resolve(cwd, options.main ?? DEFAULT_MAIN_ENTRY),
    preloadEntries,
    buildOptions,
    debugOptions: resolveDebugOptions(options.debug),
    rendererOptions: resolveRendererOptions(options.renderer),
    outDir,
    mainOutputPath: resolve(cwd, outDir, `${MAIN_ENTRY_NAME}.js`),
  }
}

/**
 * renderer の参照先設定を内部利用向けの具体値へ解決する。
 *
 * renderer を同居させる既定ユースケースでは `devUrl` は未指定のままとし、plugin が
 * 自身の Vite dev server URL を使う。外部 renderer を使う構成では `devUrl` を指定し、
 * Electron main へ渡す環境変数名だけを必要に応じて上書きする。
 *
 * @param renderer 利用者が指定した renderer 設定
 * @returns すべてのフィールドが具体化された renderer 設定
 */
export function resolveRendererOptions(
  renderer: ElectronPluginOptions['renderer'],
): ResolvedElectronRendererOptions {
  const mode = renderer?.mode ?? (renderer?.devUrl ? 'external' : 'internal')

  return {
    mode,
    devUrl: renderer?.devUrl,
    devUrlEnvVar:
      renderer?.devUrlEnvVar ?? DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR,
  }
}

/**
 * preload 設定の多様な入力形式を、name => source path の map に正規化する。
 *
 * 文字列、配列、名前付き map のいずれも受け入れ、最終的には重複と予約語を検証済みの
 * map へ変換する。
 *
 * @param preload 利用者が与えた preload 設定
 * @returns 正規化済み preload entry map
 */
export function normalizePreloadEntries(
  preload: ElectronPreloadOptions | undefined,
): ElectronPreloadEntryMap {
  if (!preload) {
    return {}
  }

  if (typeof preload === 'string') {
    return createValidatedPreloadEntryMap([
      [inferPreloadEntryName(preload), preload],
    ])
  }

  if (Array.isArray(preload)) {
    return createValidatedPreloadEntryMap(
      preload.map((entry) => {
        if (typeof entry === 'string') {
          return [inferPreloadEntryName(entry), entry] as const
        }

        return [
          entry.name ?? inferPreloadEntryName(entry.entry),
          entry.entry,
        ] as const
      }),
    )
  }

  return createValidatedPreloadEntryMap(Object.entries(preload))
}

/**
 * preload entry の配列から検証済み map を構築する。
 *
 * @param entries preload entry 名と source path の組
 * @returns 重複と不正名を排除した preload entry map
 * @throws entry 名や source path が不正な場合
 */
export function createValidatedPreloadEntryMap(
  entries: ReadonlyArray<readonly [string, string]>,
): ElectronPreloadEntryMap {
  const preloadEntryMap: ElectronPreloadEntryMap = {}

  for (const [name, source] of entries) {
    validatePreloadEntry(name, source)

    if (name in preloadEntryMap) {
      throw new Error(`Duplicate preload entry name "${name}" is not allowed`)
    }

    preloadEntryMap[name] = source
  }

  return preloadEntryMap
}

/**
 * preload entry 名と source path が plugin の制約を満たしているか検証する。
 *
 * @param name preload entry 名
 * @param source source path
 * @throws 予約語、空文字、パス区切りを含む名前などが見つかった場合
 */
export function validatePreloadEntry(name: string, source: string): void {
  if (!name) {
    throw new Error('Preload entry names must not be empty')
  }

  if (name === MAIN_ENTRY_NAME) {
    throw new Error(
      `The preload entry name "${MAIN_ENTRY_NAME}" is reserved for the Electron main entry`,
    )
  }

  if (name.includes('/') || name.includes('\\')) {
    throw new Error(
      `Invalid preload entry name "${name}": use a plain entry name without path separators`,
    )
  }

  if (!source) {
    throw new Error(`Preload entry "${name}" must have a source path`)
  }
}

/**
 * source path の basename から preload entry 名を推論する。
 *
 * @param entryPath preload source path
 * @returns 拡張子を除いた entry 名
 * @throws 名前を推論できない場合
 */
export function inferPreloadEntryName(entryPath: string): string {
  const fileName = basename(entryPath)
  const extension = extname(fileName)
  const inferredName = extension
    ? fileName.slice(0, -extension.length)
    : fileName

  if (!inferredName) {
    throw new Error(`Could not infer a preload entry name from "${entryPath}"`)
  }

  return inferredName
}

/**
 * 公開 debug 設定を内部利用向けの具体値へ解決する。
 *
 * `false` なら完全無効、`true` なら既定値で有効、object なら個別 override を適用する。
 *
 * @param debug 利用者が指定した debug 設定
 * @returns すべてのフィールドが具体化された debug 設定
 */
export function resolveDebugOptions(
  debug: ElectronPluginOptions['debug'],
): ResolvedElectronDebugOptions {
  if (!debug) {
    return {
      enabled: false,
      host: 'localhost',
      port: 9229,
      break: false,
      rendererPort: 9222,
    }
  }

  if (debug === true) {
    return {
      enabled: true,
      host: 'localhost',
      port: 9229,
      break: false,
      rendererPort: 9222,
    }
  }

  return {
    enabled: debug.enabled ?? true,
    host: debug.host ?? 'localhost',
    port: debug.port ?? 9229,
    break: debug.break ?? false,
    rendererPort: debug.rendererPort ?? 9222,
  }
}

/**
 * Electron main / renderer の debugger 接続に必要な CLI 引数を生成する。
 *
 * @param debug 解決済み debug 設定
 * @returns `electron` 実行時に付与する debug 用引数
 */
export function getElectronDebugArgs(
  debug: ResolvedElectronDebugOptions,
): string[] {
  if (!debug.enabled) {
    return []
  }

  const flag = debug.break ? '--inspect-brk' : '--inspect'
  return [
    `${flag}=${debug.host}:${debug.port}`,
    `--remote-debugging-port=${debug.rendererPort}`,
  ]
}

/**
 * debug 引数と main 出力パスを結合し、Electron 起動用の argv を返す。
 *
 * @param debug 解決済み debug 設定
 * @param mainOutputPath 実行対象の Electron main 出力ファイル
 * @returns `spawn(electron, args)` に渡す配列
 */
export function getElectronSpawnArgs(
  debug: ResolvedElectronDebugOptions,
  mainOutputPath: string,
): string[] {
  return [...getElectronDebugArgs(debug), mainOutputPath]
}

/**
 * Electron child process に渡す環境変数を構築する。
 *
 * renderer dev server URL は Electron main が renderer を読み込むための唯一の手掛かりなので、
 * 指定された環境変数名で child process へ注入する。
 *
 * @param devServerUrl renderer dev server URL
 * @param devServerUrlEnvVar dev server URL を格納する環境変数名
 * @param env ベースにする環境変数
 * @returns child process 用の環境変数オブジェクト
 */
export function getElectronSpawnEnv(
  devServerUrl: string,
  devServerUrlEnvVar: string = DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    [devServerUrlEnvVar]: devServerUrl,
  }
}

/**
 * child process を停止対象として扱う必要があるか判定する型ガード。
 *
 * PID が存在し、かつ exitCode がまだ `null` のときだけ停止処理を行う。
 *
 * @param childProcess 停止候補の process
 * @returns 停止処理を進めてよい場合は `true`
 */
export function isProcessStopRequired(
  childProcess: { pid?: number; exitCode: number | null } | undefined,
): childProcess is { pid: number; exitCode: null } {
  if (!childProcess?.pid) {
    return false
  }

  return childProcess.exitCode === null
}

/**
 * Windows の `taskkill` が成功扱いとみなせる終了コードか判定する。
 *
 * 環境によっては対象プロセスが既に終了済みでも 128 や 255 を返すことがあるため、
 * plugin ではこれらも許容して停止処理の冪等性を保つ。
 *
 * @param code taskkill の終了コード
 * @returns 成功扱いにしてよい場合は `true`
 */
export function isSuccessfulWindowsTaskkillExitCode(
  code: number | null,
): boolean {
  return code === 0 || code === 128 || code === 255
}

/**
 * Vite dev server が無視すべき Electron 出力ディレクトリの glob を返す。
 *
 * @param outDir Electron 出力ディレクトリ
 * @param cwd 相対化の基準ディレクトリ
 * @returns watch ignore へ渡す glob 配列
 */
export function createOutDirIgnorePatterns(
  outDir: string,
  cwd: string = process.cwd(),
): string[] {
  const normalizedOutDir = normalizeGlobPath(
    relative(cwd, resolve(cwd, outDir)),
  )

  if (!normalizedOutDir) {
    return []
  }

  return [`**/${normalizedOutDir}/**`]
}

/**
 * glob 比較用にパス区切りや先頭末尾の余分な記号を正規化する。
 *
 * @param filePath 正規化対象の path
 * @returns glob 比較しやすい path 文字列
 */
export function normalizeGlobPath(filePath: string): string {
  return filePath
    .replaceAll('\\', '/')
    .replace(/^\.?\//, '')
    .replace(/\/$/, '')
}
