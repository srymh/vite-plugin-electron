# オプション詳細

`electron(options)` に渡す `ElectronPluginOptions` の全フィールドをまとめます。

ソースコードが source of truth です。型定義の最新版は [`src/types.ts`](https://github.com/srymh/vite-plugin-electron/blob/main/packages/vite-plugin-electron/src/types.ts) を参照してください。

## トップレベル構造

```ts
type ElectronPluginOptions = {
  main: ElectronMainOptions
  preload?: ElectronPreloadOptions
  debug?: ElectronDebugOptions | boolean
  renderer?: ElectronRendererOptions
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `main` | はい | Electron main process の entry と Vite 設定オーバーライド |
| `preload` | いいえ | preload script の entry と Vite 設定オーバーライド |
| `debug` | いいえ | 開発時のデバッガ接続設定。`true` で既定値有効化 |
| `renderer` | いいえ | renderer の参照方式（同居 or 外部） |

---

## `main`

```ts
type ElectronMainOptions = {
  entry: string
  vite?: UserConfig
}
```

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `entry` | `string` | — | Electron main の entry ファイル。Vite root 基準で解決される |
| `vite` | `UserConfig` | — | この environment に追加適用する Vite 設定 |

entry は `electron_main` environment の `rolldownOptions.input` に使われます。

---

## `preload`

```ts
type ElectronPreloadOptions = {
  entry: ElectronPreloadInput
  vite?: UserConfig
}
```

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `entry` | `ElectronPreloadInput` | — | preload entry（後述の書式参照） |
| `vite` | `UserConfig` | — | この environment に追加適用する Vite 設定 |

preload が 1 件以上ある場合にのみ `electron_preload` environment が登録されます。

### preload entry の書式

preload entry は 3 つの形式で指定できます。プラグインは最終的に `name → absolute source path` の map に正規化して扱います。

**文字列 1 件:**

```ts
electron({
  main: { entry: 'electron/main.ts' },
  preload: { entry: 'electron/preload.ts' },
})
```

**配列:**

```ts
electron({
  main: { entry: 'electron/main.ts' },
  preload: {
    entry: [
      'electron/preload.ts',
      { name: 'settings', entry: 'electron/settings-preload.ts' },
    ],
  },
})
```

**名前付き map:**

```ts
electron({
  main: { entry: 'electron/main.ts' },
  preload: {
    entry: {
      preload: 'electron/preload.ts',
      settings: 'electron/settings-preload.ts',
    },
  },
})
```

文字列指定の場合、source path の basename から entry 名を推論します。

- `electron/preload.ts` → `preload`
- `electron/settings-preload.ts` → `settings-preload`

### entry 名の制約

- 空文字は不可
- `main` は予約名のため不可
- `/` や `\` を含む名前は不可
- 同じ entry 名の重複は不可

### 出力形式

preload entry は CommonJS で出力されます。

- main: `[name].js`（ESM）
- preload: `[name].cjs`（CJS）

---

## `debug`

```ts
type ElectronDebugOptions = {
  enabled?: boolean
  host?: string
  port?: number
  break?: boolean
  rendererPort?: number
}
```

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `enabled` | `boolean` | `false` | debug 用フラグの有効化 |
| `host` | `string` | `'localhost'` | Node inspector の bind host |
| `port` | `number` | `9229` | Electron main 用 Node inspector port |
| `break` | `boolean` | `false` | `--inspect-brk` を使うかどうか |
| `rendererPort` | `number` | `9222` | Chromium remote debugging port |

### 簡易指定

```ts
// boolean で有効化（全て既定値）
electron({ main: { entry: '...' }, debug: true })

// object で個別設定
electron({
  main: { entry: '...' },
  debug: { enabled: true, port: 9229, rendererPort: 9222 },
})
```

### 付与される CLI 引数

debug が有効な場合、Electron 起動時に次が付与されます。

- `--inspect=host:port` または `--inspect-brk=host:port`（`break: true` の場合）
- `--remote-debugging-port=rendererPort`

---

## `renderer`

```ts
type ElectronRendererMode = 'internal' | 'external'

type ElectronRendererOptions = {
  mode?: ElectronRendererMode
  devUrl?: string
  devUrlEnvVar?: string
}
```

| フィールド | 型 | 既定値 | 説明 |
|---|---|---|---|
| `mode` | `ElectronRendererMode` | 自動推論 | renderer の配置方式 |
| `devUrl` | `string` | — | 外部 renderer dev server の URL |
| `devUrlEnvVar` | `string` | `'VITE_DEV_SERVER_URL'` | Electron main へ URL を渡す環境変数名 |

### mode の自動推論

`mode` を省略した場合:

- `devUrl` があれば `'external'`
- `devUrl` がなければ `'internal'`

### internal mode

プラグイン自身が起動した Vite dev server の URL を `devUrlEnvVar` で指定した環境変数に注入します。

### external mode

外部の renderer dev server URL を `devUrl` で指定します。desktop package 側に `index.html` を置く必要はありません。プラグインが `appType: 'custom'` と空の仮想 client entry を使ってビルドを成立させます。

```ts
electron({
  main: { entry: 'src/main.ts' },
  renderer: {
    mode: 'external',
    devUrl: 'http://localhost:5173',
    devUrlEnvVar: 'ELECTRON_RENDERER_URL',
  },
})
```

---

## ビルド共通設定

main と preload の両方に適用されるビルド設定の既定値:

| 設定 | 既定値 | 備考 |
|---|---|---|
| `outDir` | `'dist-electron'` | — |
| `minify` | `false` | — |
| `sourcemap` | `true` | — |
| `target` | `'node22'` | — |
| `external` | `['electron']` | 常に `electron` を externalize |
| `copyPublicDir` | `false` | — |
| `emitAssets` | `false` | — |
| `reportCompressedSize` | `false` | — |
| `emptyOutDir` | main: `true`（※）, preload: `false` | ※ main と preload が同一 outDir を共有する場合は main も `false` になる |

プラグインが固定する項目（ユーザーが上書きできない）:

- `rolldownOptions.input` — entry 解決はプラグインの責務
- `output.entryFileNames` — main: `[name].js`, preload: `[name].cjs`
- `output.format` — main: ESM, preload: CJS

### `main.vite` / `preload.vite` によるオーバーライド

`main.vite` や `preload.vite` で `UserConfig` を渡すと、対応する environment のビルド設定をオーバーライドできます。ただし、プラグインが固定する項目（entry, format, entryFileNames）は `configEnvironment` フックの最後に再適用されるため、上書きされません。

## Exported Types

`@srymh/vite-plugin-electron` から import できる型:

- `ElectronPluginOptions` — トップレベルオプション
- `ElectronMainOptions` — main 設定
- `ElectronPreloadOptions` — preload 設定
- `ElectronPreloadEntry` — 単一 preload entry（string or object）
- `ElectronPreloadEntryMap` — name → source path map
- `ElectronPreloadInput` — preload entry の union 型
- `ElectronDebugOptions` — debug 設定
- `ElectronRendererMode` — `'internal' | 'external'`
- `ElectronRendererOptions` — renderer 設定
