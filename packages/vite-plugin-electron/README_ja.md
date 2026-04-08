# vite-plugin-electron

[![npm version](https://img.shields.io/npm/v/@srymh/vite-plugin-electron.svg)](https://npmjs.com/package/@srymh/vite-plugin-electron)

> [English README](README.md)

Vite 8 の Environment API を使って Electron main/preload プロセスのビルドを統合する、小さな実験的プラグインです。

Electron main/preload 用の custom environment を追加し、次をまとめて扱います。

- `vite dev` で renderer dev server を起動する
- Electron main を watch build する
- build 完了ごとに Electron を再起動する
- `vite build` で client と Electron 側をまとめてビルドする
- VS Code から main / renderer の両方へ attach しやすくする
- renderer 同居構成（internal）と外部 renderer 構成（external）の両方を扱う

詳細なドキュメントは [docs サイト](../../docs/docs/index.md) を参照してください。

## Quick Start

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
      debug: {
        enabled: true,
        port: 9229,
        rendererPort: 9222,
      },
    }),
  ],
})
```

## オプション

`electron(options)` は `ElectronPluginOptions` オブジェクトを受け取ります。

| オプション | 必須 | 説明 |
|---|---|---|
| `main` | はい | main process の entry と Vite 設定オーバーライド |
| `preload` | いいえ | preload script の entry（文字列、配列、名前付き map）と Vite 設定オーバーライド |
| `debug` | いいえ | dev 時のデバッガ設定。`true` で既定値有効化 |
| `renderer` | いいえ | renderer の参照方式（`'internal'` or `'external'`） |

### `main`

| フィールド | 型 | 説明 |
|---|---|---|
| `entry` | `string` | main process の entry ファイル。Vite root 基準で解決 |
| `vite` | `UserConfig` | この environment への Vite 設定オーバーライド |

### `preload`

| フィールド | 型 | 説明 |
|---|---|---|
| `entry` | `ElectronPreloadInput` | preload entry — 文字列、配列、`Record<name, path>` |
| `vite` | `UserConfig` | この environment への Vite 設定オーバーライド |

preload は CJS（`.cjs`）で出力されます。main は ESM（`.js`）。

### `debug`

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `enabled` | `boolean` | `false` | debug フラグの有効化 |
| `host` | `string` | `'localhost'` | Node inspector の bind host |
| `port` | `number` | `9229` | main 用 Node inspector port |
| `break` | `boolean` | `false` | `--inspect-brk` を使うかどうか |
| `rendererPort` | `number` | `9222` | Chromium remote debugging port |

### `renderer`

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `mode` | `'internal' \| 'external'` | 自動推論 | renderer の配置方式 |
| `devUrl` | `string` | — | 外部 renderer dev server の URL |
| `devUrlEnvVar` | `string` | `'VITE_DEV_SERVER_URL'` | renderer URL を渡す環境変数名 |

preload entry の書式、制約、ビルド既定値の詳細は [オプション詳細](../../docs/docs/options.md) を参照してください。

## Exported Types

```ts
import {
  electron,
  type ElectronPluginOptions,
  type ElectronMainOptions,
  type ElectronPreloadOptions,
  type ElectronPreloadEntry,
  type ElectronPreloadEntryMap,
  type ElectronPreloadInput,
  type ElectronDebugOptions,
  type ElectronRendererMode,
  type ElectronRendererOptions,
} from '@srymh/vite-plugin-electron'
```

## ビルド / 開発の動作

**`vite dev`**: renderer dev server の起動、`electron_main`（と `electron_preload`）の watch build、build 完了時の Electron 再起動を行います。内部 scheduler が短時間の複数回 build を coalesce し、不要な再起動を抑制します。

**`vite build`**: client、`electron_main`、`electron_preload` environment をビルドします。`builder: {}` を自動で有効化するため、`vite build --app` は不要です。

**既定の出力先**: `dist-electron/main.js`（ESM）と `dist-electron/preload.cjs`（CJS）。ビルドオプションで変更可能です。

## 開発

```bash
pnpm build   # lint + tsdown bundle
pnpm test    # vitest run
pnpm lint    # oxlint
```

## さらに詳しく

- [はじめに](../../docs/docs/getting-started.md)
- [ビルド・開発ガイド](../../docs/docs/guide.md)
- [オプション詳細](../../docs/docs/options.md)
- [内部アーキテクチャ](../../docs/docs/architecture.md)
- [VS Code デバッグ](../../docs/docs/vscode-debug.md)
- [責務とスコープ](../../docs/docs/scope.md)

## License

MIT
