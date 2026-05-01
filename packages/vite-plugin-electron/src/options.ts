import { readFileSync } from 'node:fs'
import { basename, extname, relative, resolve } from 'node:path'
import process from 'node:process'

import {
  DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR,
  ELECTRON_OUT_DIR,
  type ElectronPluginOptions,
  type ElectronPreloadEntryMap,
  type ElectronPreloadInput,
  type ElectronRendererOptions,
  type ElectronRendererMode,
  type ElectronRendererWaitForReadyMode,
  type ResolvedElectronDebugOptions,
  type ResolvedElectronPluginOptions,
  type ResolvedElectronRendererOptions,
  type ResolvedElectronRendererWaitForReadyOptions,
} from './types'

const DEFAULT_RENDERER_WAIT_FOR_READY_TIMEOUT_MS = 30_000
const DEFAULT_RENDERER_WAIT_FOR_READY_INTERVAL_MS = 500
const DEFAULT_RENDERER_WAIT_FOR_READY_REQUEST_TIMEOUT_MS = 5_000

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
  options: ElectronPluginOptions,
  cwd: string = process.cwd(),
): ResolvedElectronPluginOptions {
  const preloadEntries = options.preload
    ? Object.fromEntries(
        Object.entries(normalizePreloadEntries(options.preload.entry)).map(
          ([name, source]) => [name, resolve(cwd, source)],
        ),
      )
    : {}

  const outDir = ELECTRON_OUT_DIR
  const mainOutDir = resolveEffectiveOutDir(options.main.vite, outDir)
  const preloadOutDir = resolveEffectiveOutDir(options.preload?.vite, outDir)
  const mainEntryName = inferEntryName(options.main.entry)
  const mainEntryFileNames = resolveEffectiveMainEntryFileNames(
    options.main.vite,
  )

  return {
    rootDir: cwd,
    mainEntry: resolve(cwd, options.main.entry),
    mainEntryName,
    mainViteOverrides: options.main.vite ?? {},
    preloadEntries,
    preloadViteOverrides: options.preload?.vite ?? {},
    debugOptions: resolveDebugOptions(options.debug),
    rendererOptions: resolveRendererOptions(options.renderer),
    outDir,
    mainOutDir,
    preloadOutDir,
    mainOutputPath: resolve(
      cwd,
      mainOutDir,
      mainEntryFileNames.replace('[name]', mainEntryName),
    ),
  }
}

/**
 * ユーザーの vite override から実効 outDir を決定する。
 *
 * vite.build.outDir が指定されていればそれを、なければデフォルトの outDir を返す。
 *
 * @param viteOverrides ユーザーが指定した vite 設定
 * @param defaultOutDir デフォルトの outDir
 * @returns 実効 outDir
 */
function resolveEffectiveOutDir(
  viteOverrides: ElectronPluginOptions['main']['vite'],
  defaultOutDir: string,
): string {
  return viteOverrides?.build?.outDir ?? defaultOutDir
}

/**
 * ユーザーの vite override から main 用 entryFileNames を決定する。
 *
 * rolldownOptions.output.entryFileNames が指定されていればそれを、
 * なければ既定の '[name].js' を返す。
 *
 * @param viteOverrides ユーザーが指定した vite 設定
 * @returns 実効 entryFileNames
 */
function resolveEffectiveMainEntryFileNames(
  viteOverrides: ElectronPluginOptions['main']['vite'],
): string {
  const output = viteOverrides?.build?.rolldownOptions?.output
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const entryFileNames = output.entryFileNames
    if (typeof entryFileNames === 'string') {
      return entryFileNames
    }
  }
  return '[name].js'
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
    waitForReady: resolveRendererWaitForReadyOptions(renderer?.waitForReady),
  }
}

/**
 * renderer dev server の到達待ち設定へ既定値を適用する。
 *
 * @param waitForReady 利用者が指定した待機設定
 * @returns すべてのフィールドが具体化された待機設定
 */
export function resolveRendererWaitForReadyOptions(
  waitForReady: ElectronRendererOptions['waitForReady'],
): ResolvedElectronRendererWaitForReadyOptions {
  return {
    mode: waitForReady?.mode ?? 'auto',
    timeoutMs:
      waitForReady?.timeoutMs ?? DEFAULT_RENDERER_WAIT_FOR_READY_TIMEOUT_MS,
    intervalMs:
      waitForReady?.intervalMs ?? DEFAULT_RENDERER_WAIT_FOR_READY_INTERVAL_MS,
    requestTimeoutMs:
      waitForReady?.requestTimeoutMs ??
      DEFAULT_RENDERER_WAIT_FOR_READY_REQUEST_TIMEOUT_MS,
  }
}

/**
 * 与えられた renderer URL に対して起動待機を挟むべきか判定する。
 *
 * `always` は external + http/https URL なら常に待機する。`auto` は loopback
 * host のときだけ待機し、`off` は常に待機しない。
 *
 * @param rendererMode renderer の配置方式
 * @param devServerUrl 判定対象の renderer dev server URL
 * @param waitMode 解決済みの待機モード
 * @returns spawn 前に待機すべきなら `true`
 */
export function shouldWaitForRendererReady(
  rendererMode: ElectronRendererMode,
  devServerUrl: string,
  waitMode: ElectronRendererWaitForReadyMode,
): boolean {
  if (rendererMode !== 'external' || waitMode === 'off') {
    return false
  }

  const rendererUrl = safeParseUrl(devServerUrl)

  if (!rendererUrl || !isHttpRendererUrl(rendererUrl)) {
    return false
  }

  if (waitMode === 'always') {
    return true
  }

  return isLoopbackHostname(rendererUrl.hostname)
}

/**
 * renderer dev server URL を安全に parse する。
 *
 * @param devServerUrl parse 対象の URL 文字列
 * @returns parse 成功時は URL、失敗時は `undefined`
 */
function safeParseUrl(devServerUrl: string): URL | undefined {
  try {
    return new URL(devServerUrl)
  } catch {
    return undefined
  }
}

/**
 * renderer URL が HTTP(S) か判定する。
 *
 * @param rendererUrl 判定対象の URL
 * @returns `http:` または `https:` なら `true`
 */
function isHttpRendererUrl(rendererUrl: URL): boolean {
  return rendererUrl.protocol === 'http:' || rendererUrl.protocol === 'https:'
}

/**
 * hostname が loopback 宛てか判定する。
 *
 * @param hostname 判定対象の hostname
 * @returns localhost、127.0.0.1、::1 のいずれかなら `true`
 */
function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

/**
 * preload 設定の多様な入力形式を、name => source path の map に正規化する。
 *
 * 文字列、配列、名前付き map のいずれも受け入れ、最終的には重複と予約語を検証済みの
 * map へ変換する。
 *
 * @param preload 利用者が与えた preload entry 入力
 * @returns 正規化済み preload entry map
 */
export function normalizePreloadEntries(
  preload: ElectronPreloadInput | undefined,
): ElectronPreloadEntryMap {
  if (!preload) {
    return {}
  }

  if (typeof preload === 'string') {
    return createValidatedPreloadEntryMap([[inferEntryName(preload), preload]])
  }

  if (Array.isArray(preload)) {
    return createValidatedPreloadEntryMap(
      preload.map((entry) => {
        if (typeof entry === 'string') {
          return [inferEntryName(entry), entry] as const
        }

        return [entry.name ?? inferEntryName(entry.entry), entry.entry] as const
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
 * @throws 空文字、パス区切りを含む名前などが見つかった場合
 */
export function validatePreloadEntry(name: string, source: string): void {
  if (!name) {
    throw new Error('Preload entry names must not be empty')
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
 * source path の basename から entry 名を推論する。
 *
 * main / preload 両方で共通に使用する。
 *
 * @param entryPath source path
 * @returns 拡張子を除いた entry 名
 * @throws 名前を推論できない場合
 */
export function inferEntryName(entryPath: string): string {
  const fileName = basename(entryPath)
  const extension = extname(fileName)
  const inferredName = extension
    ? fileName.slice(0, -extension.length)
    : fileName

  if (!inferredName) {
    throw new Error(`Could not infer an entry name from "${entryPath}"`)
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
 * debug 引数とプロジェクトルートを結合し、Electron 起動用の argv を返す。
 *
 * ルートディレクトリを渡すことで、Electron がプロジェクトの package.json を読み取り、
 * `app.getName()` や `app.getPath('userData')` を正しく解決できるようにする。
 *
 * @param debug 解決済み debug 設定
 * @param rootDir Electron に渡すプロジェクトルートディレクトリ
 * @returns `spawn(electron, args)` に渡す配列
 */
export function getElectronSpawnArgs(
  debug: ResolvedElectronDebugOptions,
  rootDir: string,
): string[] {
  return [...getElectronDebugArgs(debug), rootDir]
}

/**
 * プロジェクトの package.json の `main` フィールドが Electron main の出力パスと一致するか検証する。
 *
 * Electron はプロジェクトルートを引数として受け取ると、package.json の `main` フィールドから
 * エントリーポイントを解決する。`main` が正しく設定されていない場合、Electron は起動に失敗するか
 * 予期しないファイルを実行してしまう。
 *
 * @param rootDir プロジェクトルートディレクトリ
 * @param mainOutputPath plugin が算出した Electron main の出力パス
 * @throws package.json が存在しない、`main` フィールドが未設定、または出力パスと不一致の場合
 */
export function validatePackageJsonMainField(
  rootDir: string,
  mainOutputPath: string,
): void {
  const packageJsonPath = resolve(rootDir, 'package.json')

  let content: string
  try {
    content = readFileSync(packageJsonPath, 'utf-8')
  } catch {
    throw new Error(
      `[vite-plugin-electron] ${packageJsonPath} が見つかりません。` +
        ' Electron はプロジェクトルートの package.json からアプリ名とエントリーポイントを解決します。',
    )
  }

  const packageJson = JSON.parse(content) as { main?: string }
  const mainField = packageJson.main

  if (!mainField) {
    throw new Error(
      '[vite-plugin-electron] package.json に "main" フィールドがありません。' +
        ` Electron のエントリーポイントとして "main": "${relative(rootDir, mainOutputPath)}" を追加してください。`,
    )
  }

  const resolvedMainField = resolve(rootDir, mainField)
  const resolvedExpected = resolve(mainOutputPath)

  if (resolvedMainField !== resolvedExpected) {
    throw new Error(
      `[vite-plugin-electron] package.json の "main" フィールド ("${mainField}") が` +
        ` Electron main の出力パス ("${relative(rootDir, mainOutputPath)}") と一致しません。` +
        ` "main": "${relative(rootDir, mainOutputPath)}" に修正してください。`,
    )
  }
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
 * main / preload が個別の outDir を持つ場合はすべてを ignore 対象に含める。
 *
 * @param resolvedOptions 解決済みの plugin オプション
 * @param cwd 相対化の基準ディレクトリ
 * @returns watch ignore へ渡す glob 配列
 */
export function createOutDirIgnorePatterns(
  resolvedOptions: Pick<
    ResolvedElectronPluginOptions,
    'outDir' | 'mainOutDir' | 'preloadOutDir'
  >,
  cwd: string = process.cwd(),
): string[] {
  const dirs = new Set([
    resolvedOptions.outDir,
    resolvedOptions.mainOutDir,
    resolvedOptions.preloadOutDir,
  ])

  return [...dirs].flatMap((dir) => createIgnorePatternsForDir(dir, cwd))
}

/**
 * 単一のディレクトリに対する watch ignore glob を返す。
 *
 * @param outDir 無視対象のディレクトリ
 * @param cwd 相対化の基準ディレクトリ
 * @returns glob 配列
 */
function createIgnorePatternsForDir(outDir: string, cwd: string): string[] {
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

/**
 * dev session 開始時にクリーンすべき出力ディレクトリの一覧を返す。
 *
 * main と preload の outDir が同一なら 1 要素、異なれば 2 要素になる。
 *
 * @param resolvedOptions 解決済みの plugin オプション
 * @returns 重複を排除した outDir の配列
 */
export function getUniqueOutDirs(
  resolvedOptions: Pick<
    ResolvedElectronPluginOptions,
    'mainOutDir' | 'preloadOutDir'
  >,
): string[] {
  return [
    ...new Set([resolvedOptions.mainOutDir, resolvedOptions.preloadOutDir]),
  ]
}
