import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createElectronBuildCoordinator,
  createRestartScheduler,
  resolveElectronBuildEventOutcome,
} from '../src/dev-state'
import {
  EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
  RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
  createExternalRendererClientBuildConfig,
  createElectronEnvironmentBuildConfig,
  createElectronEnvironmentDefinitions,
  getElectronWatchEnvironmentNames,
  removeExternalRendererClientBuildOutputs,
} from '../src/environment'
import {
  createOutDirIgnorePatterns,
  getElectronDebugArgs,
  getElectronSpawnArgs,
  getElectronSpawnEnv,
  isProcessStopRequired,
  isSuccessfulWindowsTaskkillExitCode,
  resolveDebugOptions,
  resolveElectronPluginOptions,
  resolveRendererOptions,
} from '../src/options'

/** OS 間でパス区切りを揃える正規化ヘルパー */
function p(s: string): string {
  return s.replaceAll('\\', '/')
}

/** テスト用のクロスプラットフォームな絶対 cwd */
const TEST_CWD = resolve('/test-repo')
const TEST_CWD_DEEP = resolve('/test-repo/apps/desktop')

describe('electron plugin', () => {
  it('preload 未設定なら main environment だけを登録する', () => {
    // Arrange
    const config = createElectronEnvironmentDefinitions({})

    // Assert
    expect(config).toEqual({
      electron_main: {
        consumer: 'server',
        keepProcessEnv: true,
      },
    })
  })

  it('preload entry があれば preload environment も登録する', () => {
    // Arrange
    const config = createElectronEnvironmentDefinitions({
      preload: resolve(TEST_CWD, 'electron/preload.ts'),
    })

    // Assert
    expect(config).toMatchObject({
      electron_main: {
        consumer: 'server',
        keepProcessEnv: true,
      },
      electron_preload: {
        consumer: 'server',
        keepProcessEnv: true,
      },
    })
  })

  it('watch ignore pattern に custom outDir を反映する', () => {
    // Act
    expect(createOutDirIgnorePatterns('build-electron', TEST_CWD)).toEqual([
      '**/build-electron/**',
    ])
  })

  it('preload の有無に応じて watch 対象 environment を切り替える', () => {
    // Act
    expect(getElectronWatchEnvironmentNames(false)).toEqual(['electron_main'])
    expect(getElectronWatchEnvironmentNames(true)).toEqual([
      'electron_main',
      'electron_preload',
    ])
  })

  it('main environment を固定の main.js な ES module 出力として組み立てる', () => {
    // Arrange
    const config = createElectronEnvironmentBuildConfig(
      'electron_main',
      resolveElectronPluginOptions({}, TEST_CWD),
    )

    // Assert
    const mainInput = config.build?.rolldownOptions?.input as Record<
      string,
      string
    >
    expect(p(mainInput?.main ?? '')).toContain('electron/main.ts')
    expect(config.build?.rolldownOptions?.output).toMatchObject({
      entryFileNames: '[name].js',
      format: 'es',
    })
    expect(config.build?.emptyOutDir).toBe(true)
  })

  it('preload entry を CommonJS 出力として組み立てる', () => {
    // Arrange
    const config = createElectronEnvironmentBuildConfig(
      'electron_preload',
      resolveElectronPluginOptions(
        {
          preload: [
            'electron/preload.ts',
            {
              name: 'settings',
              entry: 'electron/settings-preload.ts',
            },
          ],
        },
        TEST_CWD,
      ),
    )

    // Assert
    const preloadInput = config.build?.rolldownOptions?.input as Record<
      string,
      string
    >
    expect(preloadInput).toMatchObject({
      preload: expect.any(String),
      settings: expect.any(String),
    })
    expect(p(String(preloadInput?.preload))).toContain('electron/preload.ts')
    expect(p(String(preloadInput?.settings))).toContain(
      'electron/settings-preload.ts',
    )
    expect(config.build?.rolldownOptions?.output).toMatchObject({
      entryFileNames: '[name].cjs',
      format: 'cjs',
    })
    expect(config.build?.emptyOutDir).toBe(false)
  })

  it('preload environment は利用者設定に関わらず outDir を掃除しない', () => {
    // Arrange
    const config = createElectronEnvironmentBuildConfig(
      'electron_preload',
      resolveElectronPluginOptions(
        {
          preload: 'electron/preload.ts',
          build: {
            emptyOutDir: true,
          },
        },
        TEST_CWD,
      ),
    )

    // Assert
    expect(config.build?.emptyOutDir).toBe(false)
  })

  it('debug 設定から既定値と引数を解決する', () => {
    // Arrange
    const debug = resolveDebugOptions({
      enabled: true,
      host: '0.0.0.0',
      port: 9333,
      rendererPort: 9444,
      break: true,
    })

    // Act / Assert
    expect(getElectronDebugArgs(resolveDebugOptions(false))).toEqual([])

    expect(getElectronDebugArgs(debug)).toEqual([
      '--inspect-brk=0.0.0.0:9333',
      '--remote-debugging-port=9444',
    ])
  })

  it('debug 設定から Electron 起動引数と環境変数を組み立てる', () => {
    // Arrange
    const debug = resolveDebugOptions({
      enabled: true,
      host: 'localhost',
      port: 9333,
      rendererPort: 9444,
    })

    // Act / Assert
    expect(
      getElectronSpawnArgs(debug, 'D:/repo/dist-electron/main.js'),
    ).toEqual([
      '--inspect=localhost:9333',
      '--remote-debugging-port=9444',
      'D:/repo/dist-electron/main.js',
    ])
    expect(
      getElectronSpawnEnv('http://localhost:5173', 'VITE_DEV_SERVER_URL', {
        NODE_ENV: 'development',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    })
  })

  it('外部 renderer 向けに dev URL と環境変数名を解決する', () => {
    // Arrange
    const renderer = resolveRendererOptions({
      mode: 'external',
      devUrl: 'http://localhost:4173',
      devUrlEnvVar: 'ELECTRON_RENDERER_URL',
    })

    // Act / Assert
    expect(renderer).toEqual({
      mode: 'external',
      devUrl: 'http://localhost:4173',
      devUrlEnvVar: 'ELECTRON_RENDERER_URL',
    })
    expect(
      getElectronSpawnEnv('http://localhost:4173', 'ELECTRON_RENDERER_URL', {
        NODE_ENV: 'development',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      ELECTRON_RENDERER_URL: 'http://localhost:4173',
    })
  })

  it('renderer の mode を未指定なら入力内容から推論する', () => {
    // Arrange / Act / Assert
    expect(resolveRendererOptions(undefined)).toEqual({
      mode: 'internal',
      devUrl: undefined,
      devUrlEnvVar: 'VITE_DEV_SERVER_URL',
    })
    expect(
      resolveRendererOptions({
        devUrl: 'http://localhost:4173',
      }),
    ).toEqual({
      mode: 'external',
      devUrl: 'http://localhost:4173',
      devUrlEnvVar: 'VITE_DEV_SERVER_URL',
    })
  })

  it('external renderer mode 用に client build を空 entry へ差し替える', () => {
    // Arrange
    const config = createExternalRendererClientBuildConfig()

    // Assert
    expect(EXTERNAL_RENDERER_CLIENT_ENTRY_ID).toContain(
      'external-renderer-client-entry',
    )
    expect(RESOLVED_EXTERNAL_RENDERER_CLIENT_ENTRY_ID).toContain(
      'external-renderer-client-entry',
    )
    expect(config).toEqual({
      build: {
        copyPublicDir: false,
        rolldownOptions: {
          input: EXTERNAL_RENDERER_CLIENT_ENTRY_ID,
        },
      },
    })
  })

  it('external renderer mode の placeholder client 出力を bundle から削除する', () => {
    // Arrange
    const bundle = {
      'assets/external-renderer-client-entry.js': {
        type: 'chunk',
      },
      'assets/external-renderer-client-entry.js.map': {
        type: 'asset',
      },
    }

    // Act
    removeExternalRendererClientBuildOutputs(bundle)

    // Assert
    expect(bundle).toEqual({})
  })

  it('process 停止条件と taskkill の成功コードを判定する', () => {
    // Act / Assert
    expect(isProcessStopRequired(undefined)).toBe(false)
    expect(isProcessStopRequired({ pid: 100, exitCode: 0 })).toBe(false)
    expect(isProcessStopRequired({ pid: 100, exitCode: null })).toBe(true)

    expect(isSuccessfulWindowsTaskkillExitCode(0)).toBe(true)
    expect(isSuccessfulWindowsTaskkillExitCode(128)).toBe(true)
    expect(isSuccessfulWindowsTaskkillExitCode(255)).toBe(true)
    expect(isSuccessfulWindowsTaskkillExitCode(1)).toBe(false)
  })

  it('main と preload の両方が ready になったあとで再起動する', () => {
    // Arrange
    const coordinator = createElectronBuildCoordinator(true)

    // Act / Assert
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })
  })

  it('main だけを watch する構成なら main 完了だけで再起動する', () => {
    // Arrange
    const coordinator = createElectronBuildCoordinator(false)

    // Act / Assert
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })
  })

  it('preload あり構成で 2 周目以降も main と preload の両方を待つ', () => {
    const coordinator = createElectronBuildCoordinator(true)

    // --- 1 周目: main → preload の順で END ---
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })

    // --- 2 周目: main の END だけでは restart しない ---
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })

    // preload も完了して初めて restart
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })

    // --- 3 周目: preload → main の逆順でも同様に動作する ---
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })
  })

  it('main のみ構成でも 2 周目以降で restart がリセットされる', () => {
    const coordinator = createElectronBuildCoordinator(false)

    // 1 周目
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })

    // 2 周目: BUNDLE_START なしでも restart 後にリセットされている
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })
  })

  it('BUNDLE_START が来ると該当 environment の ready がリセットされる', () => {
    const coordinator = createElectronBuildCoordinator(true)

    // 初回: main を ready にする
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })

    // main 側だけ BUNDLE_START が来て ready が取り消される
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'BUNDLE_START',
      }),
    ).toEqual({ type: 'ignore' })

    // preload が END しても main が未完了なので restart しない
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_preload', {
        code: 'END',
      }),
    ).toEqual({ type: 'ignore' })

    // main が再度 END になれば restart する
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'END',
      }),
    ).toEqual({ type: 'restart' })
  })

  it('build error を event outcome として表に出す', () => {
    // Arrange
    const coordinator = createElectronBuildCoordinator(false)

    // Act / Assert
    expect(
      resolveElectronBuildEventOutcome(coordinator, 'electron_main', {
        code: 'ERROR',
        error: new Error('boom'),
      }),
    ).toMatchObject({ type: 'error' })
  })

  it('再起動中に追加された restart 要求を 1 回に畳み込む', () => {
    // Arrange
    const scheduler = createRestartScheduler()

    // Act / Assert
    expect(scheduler.requestRestart()).toEqual({ shouldStart: true })
    expect(scheduler.requestRestart()).toEqual({ shouldStart: false })
    expect(scheduler.requestRestart()).toEqual({ shouldStart: false })
    expect(scheduler.finishRestart()).toEqual({ shouldStart: true })
    expect(scheduler.finishRestart()).toEqual({ shouldStart: false })
    expect(scheduler.requestRestart()).toEqual({ shouldStart: true })
  })

  it('Vite root 基準で custom main と outDir を内部 option に解決する', () => {
    // Arrange
    const resolved = resolveElectronPluginOptions(
      {
        main: 'electron/custom-main.ts',
        build: {
          outDir: 'build-electron',
        },
      },
      TEST_CWD_DEEP,
    )

    // Assert
    expect(resolved.mainEntry).toBe(
      resolve(TEST_CWD_DEEP, 'electron/custom-main.ts'),
    )
    expect(resolved.mainOutputPath).toBe(
      resolve(TEST_CWD_DEEP, 'build-electron/main.js'),
    )
    expect(resolved.rootDir).toBe(TEST_CWD_DEEP)
    expect(resolved.outDir).toBe('build-electron')
  })

  it('preload の不正設定を option 解決時に検出する', () => {
    // Act / Assert
    expect(() =>
      resolveElectronPluginOptions(
        {
          preload: {
            main: 'electron/preload.ts',
          },
        },
        TEST_CWD,
      ),
    ).toThrow(/reserved/)

    expect(() =>
      resolveElectronPluginOptions(
        {
          preload: ['electron/preload.ts', 'src/preload.ts'],
        },
        TEST_CWD,
      ),
    ).toThrow(/Duplicate preload entry name/)
  })
})
