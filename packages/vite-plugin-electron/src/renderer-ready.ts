import { setTimeout as delay } from 'node:timers/promises'

import { type ResolvedElectronRendererWaitForReadyOptions } from './types'

type WaitForRendererReadyDependencies = {
  fetchImpl?: typeof globalThis.fetch
  now?: () => number
  sleep?: (delayMs: number) => Promise<void>
}

/**
 * renderer dev server が HTTP 応答可能になるまで一定間隔で待機する。
 *
 * `HEAD` が 405 / 501 を返すサーバーには `GET` へフォールバックし、ネットワーク的に
 * 応答が返れば ready とみなす。接続拒否やタイムアウトが続き、指定時間を超えた場合は
 * Electron を起動せずエラーにする。
 *
 * @param devServerUrl 待機対象の renderer dev server URL
 * @param options 解決済みの待機設定
 * @param dependencies テスト用に差し替え可能な依存関係
 * @returns 到達確認できたら解決する Promise
 * @throws renderer がタイムアウトまで応答しない場合
 */
export async function waitForRendererReady(
  devServerUrl: string,
  options: ResolvedElectronRendererWaitForReadyOptions,
  dependencies: WaitForRendererReadyDependencies = {},
): Promise<void> {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch
  const now = dependencies.now ?? Date.now
  const sleep = dependencies.sleep ?? defaultSleep
  const startedAt = now()

  while (true) {
    if (
      await probeRendererReady(
        fetchImpl,
        devServerUrl,
        options.requestTimeoutMs,
      )
    ) {
      return
    }

    if (now() - startedAt >= options.timeoutMs) {
      throw new Error(
        `[vite-plugin-electron] Renderer URL "${devServerUrl}" did not respond within ${options.timeoutMs}ms. Electron launch was skipped.`,
      )
    }

    await sleep(options.intervalMs)
  }
}

/**
 * renderer dev server へ到達確認用の HTTP リクエストを送る。
 *
 * @param fetchImpl 実際に HTTP リクエストを行う関数
 * @param devServerUrl 待機対象の URL
 * @param requestTimeoutMs 個別リクエストのタイムアウト
 * @returns 応答が返れば `true`、接続失敗なら `false`
 */
async function probeRendererReady(
  fetchImpl: typeof globalThis.fetch,
  devServerUrl: string,
  requestTimeoutMs: number,
): Promise<boolean> {
  const headResponse = await requestRendererReady(
    fetchImpl,
    devServerUrl,
    'HEAD',
    requestTimeoutMs,
  )

  if (headResponse === 'ready') {
    return true
  }

  if (headResponse === 'fallback') {
    return (
      (await requestRendererReady(
        fetchImpl,
        devServerUrl,
        'GET',
        requestTimeoutMs,
      )) === 'ready'
    )
  }

  return false
}

/**
 * 単一の HTTP リクエストを送って ready 判定を返す。
 *
 * @param fetchImpl 実際に HTTP リクエストを行う関数
 * @param devServerUrl 待機対象の URL
 * @param method 使用する HTTP メソッド
 * @param requestTimeoutMs 個別リクエストのタイムアウト
 * @returns ready / fallback / false の判定結果
 */
async function requestRendererReady(
  fetchImpl: typeof globalThis.fetch,
  devServerUrl: string,
  method: 'GET' | 'HEAD',
  requestTimeoutMs: number,
): Promise<'ready' | 'fallback' | false> {
  try {
    const response = await fetchImpl(devServerUrl, {
      method,
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    if (
      method === 'HEAD' &&
      (response.status === 405 || response.status === 501)
    ) {
      return 'fallback'
    }

    return 'ready'
  } catch {
    return false
  }
}

/**
 * 次の polling まで非同期待機する。
 *
 * @param delayMs 待機時間
 * @returns 指定時間経過後に解決する Promise
 */
async function defaultSleep(delayMs: number): Promise<void> {
  await delay(delayMs)
}
