# 内部アーキテクチャ

このページではプラグインの内部構造を説明します。プラグインの利用者は通常意識する必要はありません。

## モジュール構成

各ファイルは明確な責務を持ちます。

| ファイル | 役割 | 副作用 |
|---|---|---|
| `index.ts` | 公開 barrel。値と型の re-export | なし |
| `electron.ts` | Vite plugin factory。plugin hook の実装 | なし（hook は Vite が呼ぶ） |
| `types.ts` | 共有型定義と定数 | なし |
| `options.ts` | option 正規化、preload 検証、debug 解決、spawn 用 helper | なし |
| `environment.ts` | custom environment の定義と environment build 設定 | なし |
| `dev-state.ts` | build coordinator と restart scheduler（pure state machine） | なし |
| `dev.ts` | dev orchestration。Vite watch build と restart 実行の接着 | あり |
| `process.ts` | Electron process lifecycle。起動、停止、Windows の taskkill | あり |

## 設計方針

判定ロジックを pure function と state machine に寄せて、副作用のある部分を小さく保つ構造にしています。

- `options.ts`、`environment.ts`、`dev-state.ts` は副作用なし → 単体テストしやすい
- `dev.ts`、`process.ts` は副作用あり → 薄い orchestration に留める

## 処理フロー

### 起動からビルドまで

1. `electron.ts` の `electron()` factory がユーザーオプションを受け取る
2. `config()` hook で watch ignore パターンと environment 定義を注入
3. `configResolved()` hook で最終的な Vite config をもとに option を再解決
4. `configEnvironment()` hook で `electron_main` / `electron_preload` の build 設定を生成

### dev server の起動

1. `configureServer()` hook が `registerElectronDevServer()` を呼ぶ
2. HTTP server の `listening` イベントを待って dev session を開始
3. 各 environment の build watcher を作成
4. build 完了イベントを coordinator に渡して restart 判定

### build 完了と restart

1. build watcher が `BuildWatcherEvent` を emit
2. `resolveElectronBuildEventOutcome()` がイベントを評価して `ElectronBuildEventOutcome` を返す
   - `'ignore'`: ログ不要の無視イベント
   - `'error'`: build エラー → ログ出力して待機
   - `'restart'`: Electron 再起動が必要
3. `createRestartScheduler()` が rapid な restart 要求を coalesce
4. `restartElectronProcess()` が旧プロセスを停止し、新プロセスを起動

## custom environment

プラグインは Vite の Environment API を使って 2 つの custom environment を登録します。

| environment 名 | 用途 | 出力形式 |
|---|---|---|
| `electron_main` | main process | ESM (`.js`) |
| `electron_preload` | preload scripts | CJS (`.cjs`) |

environment の登録は `config()` hook 内の `environments` フィールドで行います。preload がない場合は `electron_preload` は登録されません。

## state machine

### build coordinator

`createElectronBuildCoordinator()` が作る coordinator は `mainReady` と `preloadReady` の 2 つの状態を追跡します。

- main の build 完了 → `mainReady = true`
- preload の build 完了 → `preloadReady = true`
- 両方が ready → `'restart'` を返し、状態をリセット

preload がない構成では `preloadReady` は初期状態で `true` です。

### restart scheduler

`createRestartScheduler()` は concurrent な restart を防ぎます。

- restart 中に新たな要求が来た場合、pending フラグを立てる
- 現在の restart 完了後に pending restart を実行
- 1 回のサイクルで最大 1 回の再起動

## 定数

| 定数 | 値 | 用途 |
|---|---|---|
| `ELECTRON_MAIN_ENVIRONMENT_NAME` | `'electron_main'` | main environment 名 |
| `ELECTRON_PRELOAD_ENVIRONMENT_NAME` | `'electron_preload'` | preload environment 名 |
| `ELECTRON_OUT_DIR` | `'dist-electron'` | 既定の出力ディレクトリ |
| `DEFAULT_RENDERER_DEV_SERVER_URL_ENV_VAR` | `'VITE_DEV_SERVER_URL'` | 既定の dev URL 環境変数名 |
| `SIGTERM_TIMEOUT_MS` | `5_000` | Unix SIGTERM 待機時間 |
| `SIGKILL_TIMEOUT_MS` | `3_000` | Unix SIGKILL 待機時間 |
| `TASKKILL_TIMEOUT_MS` | `10_000` | Windows taskkill 待機時間 |

## リポジトリ上のソース配置

```text
packages/vite-plugin-electron/
  src/
    index.ts          # 公開 barrel
    electron.ts       # plugin factory
    types.ts          # 型定義・定数
    options.ts        # option 正規化
    environment.ts    # environment 設定
    dev-state.ts      # state machine
    dev.ts            # dev orchestration
    process.ts        # process lifecycle
  tests/
    electron.test.ts  # テスト
```
