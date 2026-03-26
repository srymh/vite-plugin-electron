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
 * それ以外では SIGTERM と exit 待機を使う。
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
  await waitForProcessExit(childProcess)
}

/**
 * child process の終了を待つ。
 *
 * すでに終了済みなら即座に解決し、まだ動作中なら `exit` を待機する。
 *
 * @param childProcess 終了待ち対象の process
 * @returns process が終了したら解決する Promise
 */
function waitForProcessExit(childProcess: ChildProcess): Promise<void> {
  return new Promise((resolveExit) => {
    if (childProcess.exitCode !== null) {
      resolveExit()
      return
    }

    childProcess.once('exit', () => {
      resolveExit()
    })
  })
}

/**
 * Windows 上で child process tree を強制終了する。
 *
 * Electron は子プロセスをぶら下げることがあるため、単一 PID への signal ではなく
 * `taskkill /t /f` を使って tree 全体を止める。
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

    taskkill.once('error', rejectTaskkill)
    taskkill.once('exit', (code) => {
      if (isSuccessfulWindowsTaskkillExitCode(code)) {
        resolveTaskkill()
        return
      }

      rejectTaskkill(new Error(`taskkill exited with code ${code}`))
    })
  })
}
