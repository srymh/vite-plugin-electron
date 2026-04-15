# VS Code デバッグ

このリポジトリには `.vscode/launch.json` を用意しています。

## 構成一覧

### Compound（まとめて起動）

| 構成名 | 対象 |
|---|---|
| Launch Electron + Renderer Debug (Single Package Example) | example-single |
| Launch Monorepo Electron + Renderer Debug (Multiple Package Example) | example-multiple |

### 個別構成

| 構成名 | 内容 |
|---|---|
| Launch Vite Dev (Single) | `pnpm dev:single` を起動 |
| Launch Vite Dev (Monorepo) | `pnpm dev:multiple` を起動 |
| Attach Electron Main (Single / Monorepo) | Node inspector port 9229 に attach |
| Attach Electron Renderer (Single / Monorepo) | Chromium remote debugging port 9222 に attach |

## 使い方

### 前提

example 側の `vite.config.ts` で debug オプションを有効にしておく必要があります。

```ts
electron({
  main: { entry: 'electron/main.ts' },
  preload: { entry: 'electron/preload.ts' },
  debug: {
    enabled: true,
    port: 9229,
    rendererPort: 9222,
  },
})
```

### Compound 構成での起動

1. VS Code の「実行とデバッグ」パネルを開く
2. ドロップダウンから Compound 構成を選択
3. ▶ で起動

Compound 構成は以下を順に実行します:

1. `pnpm dev` で Vite dev server + Electron を起動
2. Electron main process に Node inspector で attach
3. Electron renderer に Chrome DevTools で attach

### 個別に attach

dev server を別途起動済みの場合、Attach 構成だけを選んで attach できます。

## ポートの対応

| 対象 | 既定ポート | Electron CLI 引数 |
|---|---|---|
| main (Node inspector) | 9229 | `--inspect=localhost:9229` |
| renderer (Chrome DevTools) | 9222 | `--remote-debugging-port=9222` |

これらのポートは `debug.port` と `debug.rendererPort` で変更できます。launch.json 側のポートも合わせて変更してください。

## トラブルシューティング

### 初回 attach がタイムアウトする

Compound 構成では、Vite dev server の起動と attach が同時に開始されます。main / preload のビルドが完了して Electron が起動するまで、デバッグポートは開きません。

ビルド時間が長い場合（依存が多い、マシンスペックが低い等）、既定の `timeout: 60000`（60 秒）では不足することがあります。`launch.json` の各 Attach 構成で `timeout` を増やしてください。

```jsonc
// 例: 120 秒に変更
"timeout": 120000
```

### ファイル変更後にデバッガが切断される

このプラグインでは、**main と preload どちらのファイルを変更しても Electron プロセス全体が再起動**されます（preload 変更時も renderer reload ではなく full restart）。再起動すると Node inspector port (9229) と Chrome DevTools port (9222) の両方が一度切断されます。

各 Attach 構成に `"restart": true` を設定しておくと、切断後に自動で再アタッチを試みます。

```jsonc
// Main attach
{
  "type": "node",
  "request": "attach",
  "restart": true,  // Electron 再起動時に自動で再アタッチ
  // ...
}

// Renderer attach
{
  "type": "chrome",
  "request": "attach",
  "restart": true,  // Electron 再起動時に自動で再アタッチ
  // ...
}
```

!!! note "preload 変更時の挙動"
    preload のみを変更した場合でも、main + preload の両方がリビルドされ、Electron プロセスが再起動します。これは現在のプラグインの設計によるもので、renderer の HMR reload ではありません。そのため、Main・Renderer 両方の Attach 構成で `restart: true` が必要です。
