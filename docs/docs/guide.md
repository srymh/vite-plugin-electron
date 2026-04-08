# ビルド・開発ガイド

## `vite dev` の動作

開発時の処理フロー:

1. renderer dev server を起動
2. プラグインが renderer dev server URL を解決
3. preload の有無に応じて `electron_main` と `electron_preload` を watch build
4. build 完了イベントを内部 coordinator に渡す
5. 必要なタイミングでのみ Electron を再起動

### 再起動の仕組み

再起動は単純な都度実行ではなく、内部 scheduler によって coalesce されます。短時間に複数回 build 完了が発生しても、不要な再起動が増えにくい構成です。

preload のみの build 完了では Electron は再起動されません。main と preload の両方が ready になったタイミングで初めて再起動が発生します（preload がない構成では main のみで判定）。

### renderer dev server URL の注入

- **internal mode**: プラグインが起動した Vite dev server の URL を環境変数（既定: `VITE_DEV_SERVER_URL`）に注入
- **external mode**: `renderer.devUrl` で指定した URL を同様に環境変数に注入

Electron main process 側では `process.env.VITE_DEV_SERVER_URL` から URL を取得できます。

## `vite build` の動作

ビルド時の処理フロー:

1. client environment をビルド
2. `electron_main` environment をビルド
3. preload があれば `electron_preload` environment もビルド

プラグインは `builder: {}` を自動で有効化するため、利用側のスクリプトで `vite build --app` を明示する必要はありません。

### external mode でのビルド

external renderer mode では、client environment 側に空の仮想 entry を差し込みます。これにより HTML を持たない desktop package でも Vite app build 自体を成立させ、最終 bundle 出力は `generateBundle` フックで削除します。

### 出力先

| 対象 | 既定の出力先 | 形式 |
|---|---|---|
| renderer (client) | `dist/` | Vite 標準 |
| main | `dist-electron/main.js` | ESM |
| preload | `dist-electron/preload.cjs` | CJS |

`outDir` を変更しても dev 監視が壊れにくいように、watch ignore パターンが自動で追加されます。

## External Renderer 構成

モノレポで renderer を別の Vite app として分離する構成です。

### 基本的な使い方

desktop 側の `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import { electron } from '@srymh/vite-plugin-electron'

export default defineConfig({
  plugins: [
    electron({
      main: { entry: 'src/main.ts' },
      preload: { entry: 'src/preload.ts' },
      renderer: {
        mode: 'external',
        devUrl: 'http://localhost:5173',
      },
    }),
  ],
})
```

### ポイント

- desktop package 側に `index.html` を置く必要はない
- `appType: 'custom'` が自動で設定される
- 空の仮想 client entry でビルドが成立する
- renderer app は独立した Vite app として別途 dev / build する

### devUrlEnvVar のカスタマイズ

```ts
renderer: {
  mode: 'external',
  devUrl: 'http://localhost:5173',
  devUrlEnvVar: 'ELECTRON_RENDERER_URL',
}
```

Electron main 側では `process.env.ELECTRON_RENDERER_URL` で URL を取得します。

## Electron プロセスの管理

### 起動

プラグインは `electron` パッケージのバイナリを `createRequire` で解決し、`child_process.spawn` で起動します。

Unix/macOS では `detached: true` で起動し、プロセスグループとして管理します。

### 停止

- **Unix/macOS**: SIGTERM → 5 秒待機 → SIGKILL → 3 秒待機（プロセスグループに対して送信）
- **Windows**: `taskkill /pid /t /f` でプロセスツリーごと停止（10 秒タイムアウト）

### Electron 終了時の挙動

Electron プロセスが終了すると、Vite dev server も終了します（exit code 1）。これは `pnpm --parallel` との互換性のためです。
