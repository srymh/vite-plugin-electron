import {
  ELECTRON_MAIN_ENVIRONMENT_NAME,
  ELECTRON_PRELOAD_ENVIRONMENT_NAME,
  type BuildWatcherEvent,
  type ElectronEnvironmentName,
} from './types'

export type ElectronBuildEventOutcome =
  | { type: 'ignore' }
  | { type: 'error'; error?: unknown }
  | { type: 'restart' }

/** restart scheduler が返す、次のアクション判定結果。 */
export type RestartSchedulerOutcome = {
  shouldStart: boolean
}

/** restart scheduler の公開インターフェース。 */
export type RestartScheduler = {
  requestRestart(): RestartSchedulerOutcome
  finishRestart(): RestartSchedulerOutcome
}

/** build event を受けて restart 可否を判定する coordinator の契約。 */
export type ElectronBuildCoordinator = {
  handleEvent(
    environmentName: ElectronEnvironmentName,
    event: BuildWatcherEvent,
  ): ElectronBuildEventOutcome
}

/**
 * main/preload の build 完了状態を追跡し、Electron 再起動のタイミングを決める coordinator を作る。
 *
 * preload を持たない構成では main 完了だけで restart 可能、preload を持つ構成では
 * 両方が END を迎えたあとで restart 可能になる。
 *
 * @param hasPreloadEntries preload environment を待つ必要があるか
 * @returns build event coordinator
 */
export function createElectronBuildCoordinator(
  hasPreloadEntries: boolean,
): ElectronBuildCoordinator {
  let mainReady = false
  let preloadReady = !hasPreloadEntries

  return {
    handleEvent(
      environmentName: ElectronEnvironmentName,
      event: BuildWatcherEvent,
    ): ElectronBuildEventOutcome {
      if (event.code === 'ERROR') {
        return { type: 'error', error: event.error }
      }

      // watch cycle の開始を示す BUNDLE_START で、該当 environment の ready を戻す。
      // これにより、前回 cycle の ready 状態が次の cycle へ持ち越されない。
      if (event.code === 'BUNDLE_START') {
        if (environmentName === ELECTRON_MAIN_ENVIRONMENT_NAME) {
          mainReady = false
        }

        if (environmentName === ELECTRON_PRELOAD_ENVIRONMENT_NAME) {
          preloadReady = false
        }

        return { type: 'ignore' }
      }

      if (event.code !== 'END') {
        return { type: 'ignore' }
      }

      if (environmentName === ELECTRON_MAIN_ENVIRONMENT_NAME) {
        mainReady = true
      }

      if (environmentName === ELECTRON_PRELOAD_ENVIRONMENT_NAME) {
        preloadReady = true
      }

      if (mainReady && preloadReady) {
        // restart を返した直後にリセットし、次の watch cycle に備える。
        // BUNDLE_START による個別リセットと合わせて二重に保護する。
        mainReady = false
        // preload なし構成では待機不要なので true に戻し、main 完了だけで
        // restart できる状態を維持する。preload あり構成では false にして
        // 次の cycle で両方の END を待たせる。
        preloadReady = !hasPreloadEntries
        return { type: 'restart' }
      }

      return { type: 'ignore' }
    },
  } satisfies ElectronBuildCoordinator
}

/**
 * build watcher event を coordinator に渡し、標準化された outcome を返す。
 *
 * event 判定の入口をこの関数にそろえることで、dev orchestration 側は event の意味を
 * 直接知らずに済む。
 *
 * @param buildCoordinator build 状態を保持する coordinator
 * @param environmentName event の発生元 environment
 * @param event watcher event
 * @returns ignore / error / restart のいずれか
 */
export function resolveElectronBuildEventOutcome(
  buildCoordinator: ElectronBuildCoordinator,
  environmentName: ElectronEnvironmentName,
  event: BuildWatcherEvent,
): ElectronBuildEventOutcome {
  return buildCoordinator.handleEvent(environmentName, event)
}

/**
 * restart 要求を逐次処理に畳み込む scheduler を作る。
 *
 * 再起動が実行中に追加要求が来た場合は pending として保持し、現在の restart が終わった
 * 直後に 1 回だけ追加実行する。
 *
 * @returns restart request を coalesce する scheduler
 */
export function createRestartScheduler(): RestartScheduler {
  let isRunning = false
  let hasPendingRestart = false

  return {
    requestRestart(): RestartSchedulerOutcome {
      if (isRunning) {
        hasPendingRestart = true
        return { shouldStart: false }
      }

      isRunning = true
      return { shouldStart: true }
    },
    finishRestart(): RestartSchedulerOutcome {
      if (hasPendingRestart) {
        hasPendingRestart = false
        isRunning = true
        return { shouldStart: true }
      }

      isRunning = false
      return { shouldStart: false }
    },
  }
}
