# はじめに

## 前提条件

- Node.js >= 20.0.0
- pnpm（推奨）
- Vite 8

## インストール

```bash
pnpm add -D @srymh/vite-plugin-electron
```

## Quick Start

最小構成の `vite.config.ts` は次のようになります。

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { electron } from '@srymh/vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { entry: 'electron/preload.ts' },
    }),
  ],
})
```

この構成では次が行われます。

- `electron/main.ts` を `electron_main` environment でビルド
- `electron/preload.ts` を `electron_preload` environment でビルド（CJS 出力 `.cjs`）
- 開発時は renderer dev server を起動し、build 完了ごとに Electron を再起動

## デバッグ付き構成

VS Code からの attach を有効にする場合:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  electron,
  type ElectronPluginOptions,
} from '@srymh/vite-plugin-electron'

const electronOptions: ElectronPluginOptions = {
  main: { entry: 'electron/main.ts' },
  preload: { entry: 'electron/preload.ts' },
  debug: {
    enabled: true,
    port: 9229,
    rendererPort: 9222,
  },
}

export default defineConfig({
  plugins: [react(), electron(electronOptions)],
})
```

debug が有効な場合、Electron 起動時に `--inspect` と `--remote-debugging-port` が付与されます。

## External Renderer 構成

renderer を別の Vite app として分離するモノレポ構成の場合:

```ts
electron({
  main: { entry: 'src/main.ts' },
  preload: { entry: 'src/preload.ts' },
  renderer: {
    mode: 'external',
    devUrl: 'http://localhost:5173',
  },
})
```

この場合、desktop package 側に `index.html` を置かなくてもビルドが成立します。プラグインが仮想 client entry を使って `vite build` を通します。

## 開発コマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# テスト
pnpm test
```

## 出力構成

既定では Electron 側のビルド出力は `dist-electron/` に入ります。

```text
dist-electron/
  main.js         # main process (ESM)
  preload.cjs     # preload script (CJS)
```

renderer の出力は Vite 標準の `dist/` です。

## 次のステップ

- [オプション詳細](options.md) — 全オプションのリファレンス
- [ビルド・開発ガイド](guide.md) — dev / build の詳細な動作
- [VS Code デバッグ](vscode-debug.md) — デバッグ設定の使い方
