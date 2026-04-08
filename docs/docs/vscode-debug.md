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
