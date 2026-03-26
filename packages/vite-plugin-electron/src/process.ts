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
  mainOutputPath: string
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
 * @param options 起動設定
 * @returns 起動した child process
 */
export function launchElectronProcess(
  options: LaunchElectronProcessOptions,
): ChildProcess {
  const electronArgs = getElectronSpawnArgs(
    options.debug,
    options.mainOutputPath,
  )

  if (options.debug.enabled) {
    console.log(
      `[vite-plugin-electron] Electron inspector listening on ${options.debug.host}:${options.debug.port}`,
    )
  }

  return spawn(electronBinary, electronArgs, {
    stdio: 'inherit',
    env: getElectronSpawnEnv(options.devServerUrl, options.devServerUrlEnvVar),
  })
}

/**
 * Electron child process を安全に停止する。
 *
 * 停止不要な process は早期 return し、Windows では process tree ごと taskkill、
 * それ以外では SIGTERM → タイムアウト → SIGKILL のエスカレーション戦略を使う。
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

  childProcess.kill('SIGTERM')

  const exitedGracefully = await waitForProcessExit(
    childProcess,
    SIGTERM_TIMEOUT_MS,
  )

  if (exitedGracefully) {
    return
  }

  // SIGTERM でタイムアウトした場合は SIGKILL へ昇格する。
  childProcess.kill('SIGKILL')

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
