# vite-plugin-electron

Vite 8 の Environment API を使って Electron main process を扱うための、小さな実験的 plugin です。

この plugin は Electron main/preload 用の custom environment を追加し、次をまとめて扱います。

- `vite dev` で renderer dev server を起動する
- Electron main を watch build する
- build 完了ごとに Electron を再起動する
- `vite build` で client と Electron 側をまとめてビルドする
- VS Code から main / renderer の両方へ attach しやすくする
- renderer 同居構成と external renderer 構成の両方を扱う

この README は package 単体の詳細仕様をまとめたものです。workspace 全体の構成は ../../README.md、利用例は ../../example-single/README.md と ../../example-multiple/README.md を参照してください。

## Overview

この package の公開入口は [src/index.ts](src/index.ts) です。ここから `electron` と各 option 型を再 export します。

package の配布ビルドは `tsdown` を使って `dist` へ出力します。現行の package 設定では次の export surface を持ちます。

- `import` -> `./dist/index.mjs`
- `types` -> `./dist/index.d.mts`

この package 自体は Electron アプリの preview や packaging を直接担当しません。preview、installer 生成、electron-builder 設定はサンプルアプリ側の責務です。

現時点では、次を優先しています。

- `build.outDir` を変えても dev 監視が壊れにくい
- watch build 完了時の Electron 再起動が競合しにくい
- Windows でも Electron プロセスツリーを停止できる
- preload 設定を複数の形式で書ける
- plugin option の型を公開して設定を書きやすくする
- plugin 内部の責務境界を明確にして保守しやすくする
- Vite root 基準の path 解決で monorepo に載せやすくする
- renderer を同居構成と外部構成の両方で扱いやすくする

## Quick Start

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {
  electron,
  type ElectronPluginOptions,
} from '@srymh/vite-plugin-electron'

const electronOptions: ElectronPluginOptions = {
  main: 'electron/main.ts',
  preload: 'electron/preload.ts',
  debug: {
    enabled: true,
    port: 9229,
    rendererPort: 9222,
  },
  build: {
    outDir: 'dist-electron',
    sourcemap: true,
    minify: false,
  },
}

export default defineConfig({
  plugins: [react(), electron(electronOptions)],
})
```

この構成では `electron/preload.ts` を build し、`electron/main.ts` から `BrowserWindow` の `webPreferences.preload` へ渡します。preload の生成物は `.cjs` になり、example 側では `sandbox: true` を維持したまま読み込めます。

同居型では renderer dev server URL は既定で `VITE_DEV_SERVER_URL` に入ります。外部 renderer を使う場合は `renderer.devUrl` と `renderer.devUrlEnvVar` で差し替えます。external renderer mode では plugin が `appType: 'custom'` と空の仮想 client entry を使うため、desktop package 側に `index.html` を置かなくても `vite build` を通せます。

この plugin は build 時に `builder: {}` を自動で有効化するため、利用側の script で `vite build --app` を明示する必要はありません。

## Development

package 直下で実行するコマンド:

```bash
pnpm build
pnpm test
pnpm lint
```

意味:

- `pnpm build`: `tsdown` で package 用の ESM と d.ts を `dist` へ出力します。
- `pnpm test`: `vitest run` で helper 中心のテストを実行します。
- `pnpm lint`: package 配下の lint を実行します。

workspace root からは、root の `pnpm build` と `pnpm test` がこの package を対象に実行されます。

## API Summary

`electron(options)` は次の 5 つの設定を受け取ります。

- `renderer`: renderer の参照方法
- `main`: Electron main entry
- `preload`: preload entry 設定
- `build`: Electron 側 build 設定
- `debug`: dev 時の debugger 設定

公開 API としての `electron(options)` の責務は次のとおりです。

- 利用者オプションを内部で扱いやすい形へ正規化する
- `electron_main` と `electron_preload` の custom environment を登録する
- Electron 向け build 設定を environment ごとに差し込む
- `vite dev` 時に Electron watch build と再起動 orchestration を起動する
- renderer 同居構成では自身の Vite dev server を使い、外部構成では指定 URL を使う

逆に、次の詳細は公開 API の外側に置いています。

- build 完了イベントの細かな判定
- restart 要求の coalescing
- Electron child process の起動と停止
- Windows 固有の process tree 終了処理

これらは内部 module に分離してあり、利用者は通常意識する必要がありません。

## Exported Types

[src/index.ts](src/index.ts) では次を export しています。

- `electron`
- `ElectronBuildOptions`
- `ElectronDebugOptions`
- `ElectronPluginOptions`
- `ElectronPreloadEntry`
- `ElectronPreloadEntryMap`
- `ElectronPreloadOptions`
- `ElectronRendererMode`
- `ElectronRendererOptions`

## Options

### `renderer`

renderer を desktop package 内へ同居させる場合と、別 app として外出しする場合の両方を扱うための設定です。

既定では未指定のままでよく、この場合は plugin 自身が起動した Vite dev server URL を Electron child process へ注入します。

```ts
electron({
  renderer: {
    mode: 'external',
    devUrl: 'http://localhost:4173',
    devUrlEnvVar: 'ELECTRON_RENDERER_URL',
  },
})
```

意味:

- `mode`: `internal` か `external` の renderer 配置方式
- `devUrl`: 外部 renderer dev server を使う場合の URL
- `devUrlEnvVar`: Electron main へ URL を渡す環境変数名

この option は monorepo 専用ではありません。renderer を別 package や別 repo に分離したいケースでも同じ形で使えます。

`mode` を省略した場合は、`devUrl` があれば `external`、なければ `internal` として扱います。

### `main`

Electron main の entry ファイルです。

この値は Vite root 基準で絶対パスへ解決され、`electron_main` environment の `rolldownOptions.input` に使われます。

既定値:

```ts
'electron/main.ts'
```

### `preload`

preload entry は、単体、配列、名前付き map のいずれでも指定できます。

plugin はこの設定を最終的に `name -> absolute source path` の map に正規化して扱います。preload が 1 件以上ある場合だけ `electron_preload` environment を登録します。

文字列 1 件:

```ts
electron({
  preload: 'electron/preload.ts',
})
```

配列:

```ts
electron({
  preload: [
    'electron/preload.ts',
    {
      name: 'settings',
      entry: 'electron/settings-preload.ts',
    },
  ],
})
```

名前付き map:

```ts
electron({
  preload: {
    preload: 'electron/preload.ts',
    settings: 'electron/settings-preload.ts',
  },
})
```

文字列指定では、source path の basename から entry 名を推論します。

- `electron/preload.ts` -> `preload`
- `electron/settings-preload.ts` -> `settings-preload`

object / map 形式では、指定した `name` または key が出力名になります。

内部では preload entry ごとに CommonJS 出力を行います。現行実装では main は ESM の `[name].js`、preload は CJS の `[name].cjs` です。

制約:

- 空文字の entry 名は不可
- `main` は予約名のため不可
- `/` や `\` を含む名前は不可
- 同じ entry 名の重複は不可

### `build`

Electron 側 build のうち、plugin 利用者に開いている項目です。

この設定は main と preload の両方へ適用されます。ただし、entry と出力名のように plugin の lifecycle 制御と密結合な項目は利用者へ開いていません。

指定できる項目:

- `outDir`
- `emptyOutDir`
- `copyPublicDir`
- `emitAssets`
- `minify`
- `reportCompressedSize`
- `sourcemap`
- `target`
- `external`
- `chunkFileNames`

一方で、次は plugin が固定します。

- `rolldownOptions.input`
- `output.entryFileNames`
- `output.format`

理由は、entry 解決と dev 再起動ロジックが plugin の責務だからです。

出力名の扱い:

- main entry は `[name].js`
- preload entry は `[name].cjs`

既定値の考え方:

- `outDir`: `dist-electron`
- `minify`: `false`
- `sourcemap`: `true`
- `target`: `node22`
- `external`: 常に `electron` を追加
- `copyPublicDir`: `false`
- `emitAssets`: `false`
- `reportCompressedSize`: `false`

`emptyOutDir` は main build 側でだけ有効にし、preload build 側では false 固定にしています。これにより main / preload を同じ `outDir` に出しても、お互いの出力を消しにくい構成にしています。

注意点として、package 自体の配布ビルド target は [tsdown.config.ts](tsdown.config.ts) で `node20`、Electron 側 build の既定 target は plugin option で `node22` です。前者は npm package 用、後者は Electron app 用で役割が異なります。

### `debug`

dev 中の debugger 接続を制御します。

```ts
electron({
  debug: {
    enabled: true,
    host: 'localhost',
    port: 9229,
    rendererPort: 9222,
    break: false,
  },
})
```

意味:

- `enabled`: debug 用フラグの有効化
- `host`: Node inspector の bind host
- `port`: Electron main 用 Node inspector port
- `rendererPort`: Electron renderer 用 Chromium remote debugging port
- `break`: `--inspect-brk` を使うかどうか

debug が有効な場合、plugin は Electron 起動時に次を付与します。

- Node inspector 用の `--inspect` または `--inspect-brk`
- renderer attach 用の `--remote-debugging-port`

これにより VS Code から main / renderer を別々に attach できます。

公開 API では `debug: true` も許可しており、この場合は既定値で debug を有効化します。未指定または `false` の場合は無効です。

## Build / Dev Behavior

`vite dev` 時:

- renderer dev server を起動
- plugin が renderer dev server URL を解決
- preload の有無に応じて `electron_main` と `electron_preload` を watch build
- build 完了イベントを内部 coordinator に渡す
- 必要なタイミングでだけ Electron を再起動

monorepo で renderer を別 app に分ける場合は、desktop 側の Vite root を保ったまま `renderer.devUrl` で外部 renderer の URL を指定できます。

再起動は単純な都度実行ではなく、内部 scheduler によって coalesce されます。短時間に複数回 build 完了が発生しても、不要な再起動が増えにくい構成です。

`vite build` 時:

- client environment を build
- `electron_main` environment を build
- preload があれば `electron_preload` environment も build

external renderer mode では、client environment 側には空の仮想 entry を差し込みます。これにより HTML を持たない desktop package でも Vite app build 自体を成立させ、最終 bundle 出力は削除します。

## What The Plugin Owns

この plugin が責務として持つもの:

- package entrypoint からの公開 API
- Electron main custom environment の登録
- main / preload entry の正規化
- Electron 側 build 設定の一部
- dev 時の Electron 起動と再起動
- debug 用フラグの付与

責務の境界を明確にするため、plugin が持たないものも意識的に分けています。

- 利用者アプリ固有の BrowserWindow 設定
- production renderer の最終的な load 戦略
- preload bridge 自体の API 設計
- Electron アプリケーションロジック全体の終了戦略
- electron-builder による packaging 設定

## Internal Architecture

内部実装は大きく 7 つに分けています。

- [src/electron.ts](src/electron.ts): 公開入口。Vite plugin の登録と environment 設定を担当
- [src/types.ts](src/types.ts): 共有型と定数。公開 option 型と内部 resolved 型の基盤を担当
- [src/options.ts](src/options.ts): option 正規化、preload 検証、debug 解決、spawn 用 helper を担当
- [src/environment.ts](src/environment.ts): custom environment 定義と environment build 設定を担当
- [src/dev-state.ts](src/dev-state.ts): build 判定、watch event outcome、restart scheduler を担当
- [src/dev.ts](src/dev.ts): dev orchestration。Vite watch build と restart 実行の接着を担当
- [src/process.ts](src/process.ts): Electron process lifecycle。起動、停止、Windows の taskkill を担当

この分離により、複雑な制御は helper テストで担保し、副作用を持つ処理は薄い module に閉じ込めています。

より具体的には、内部の流れは次の順序です。

1. [src/electron.ts](src/electron.ts) が option を解決し、custom environment と build 設定を登録する
2. [src/dev.ts](src/dev.ts) が dev server の `listening` を待って watch session を開始する
3. [src/options.ts](src/options.ts)、[src/environment.ts](src/environment.ts)、[src/dev-state.ts](src/dev-state.ts) が option 解決・environment 構成・restart 判定を担う
4. [src/process.ts](src/process.ts) が実際の Electron process の起動と停止を行う

この構造にしている理由は、判定ロジックを pure function と state machine に寄せて、副作用のある部分だけを小さく保つためです。

## Repository Layout

```text
src/
  index.ts
  electron.ts
  types.ts
  options.ts
  environment.ts
  dev-state.ts
  process.ts
  dev.ts
```

## VS Code Debug

このリポジトリには [../../.vscode/launch.json](../../.vscode/launch.json) を用意しています。

主な構成:

- `Launch Vite Dev`
- `Attach Electron Main`
- `Attach Electron Renderer`
- `Launch Electron + Renderer Debug`

example 側で debug option を有効にしておくと、`Launch Electron + Renderer Debug` で `pnpm dev` の起動と main / renderer への attach をまとめて実行できます。

## Current Status

現在のバージョンは [package.json](package.json) の `version` フィールドを参照してください。

この段階では、次の状態を目標にしています。

- 基本的な dev / build が通る
- Electron installer の生成までサンプル側で通る
- Environment API の使い方が分かる
- plugin としての責務の境界が見えている
- 利用者の `outDir` 設定や Windows 環境で dev が破綻しにくい
- internal helper を単体テストしやすい

現在の生成物は大きく 2 系統です。

- package 用: `dist`
- example Electron app 用: 各 app 側の `dist`、`dist-electron`、`release/${version}`

## Remaining Issues

現時点の残課題を分類して整理しています。

### 未解決

#### `removeExternalRendererClientBuildOutputs` の型安全性

`environment.ts` の `removeExternalRendererClientBuildOutputs` は引数を `Record<string, unknown>` として受け取り、呼び出し側の `electron.ts` で `bundle as Record<string, unknown>` と assertion しています。Vite の `OutputBundle` 型を直接使えば assertion を除去でき、型安全性が向上します。ただし Vite 内部型への依存度とのトレードオフがあります。

#### `asBuildWatcher` のランタイム型チェック強化

`dev.ts` の `asBuildWatcher` は `'on' in value` で duck-typing していますが、`typeof value.on === 'function'` まで確認した方が堅牢です。現状でも実用上の問題は起きにくいですが、防御的プログラミングの観点で改善の余地があります。

#### `resolvedUrls` の参照タイミングリスク

`dev.ts` の `resolveDevServerUrl` は `httpServer` の `listening` イベント後に `server.resolvedUrls` を参照しています。Vite の現行実装では `listening` 後に設定されるため問題ありませんが、ドキュメントされた保証ではないため、Vite のメジャーアップデート時に壊れるリスクがあります。`rendererDevUrl` を明示指定する external mode では影響しません。

#### Electron 終了時の exit code

`dev.ts` の `registerElectronDevServer` 内で、Electron プロセスがユーザー操作（ウィンドウを閉じるなど）で自発的に終了した場合、`server.close()` で Vite dev server を graceful にシャットダウンしてから `process.exit(1)` で終了しています。

exit code を 0 ではなく 1 にしている理由は、`pnpm --parallel` が子プロセスの終了コードを監視しており、非ゼロで終了した場合のみ残りの兄弟プロセスを停止するためです。exit(0) だと external renderer 構成（`dev:multiple` のように web dev server と desktop dev server を並列実行するケース）で、desktop が終了しても web dev server が残り続けてしまいます。dev server の中断終了なので exit code 1 は意味的にも妥当です。

この挙動により、ターミナルに `ELIFECYCLE` エラーメッセージが表示されることがありますが、実害はありません。

#### build coordinator のステートリセットの可読性

`dev-state.ts` の `createElectronBuildCoordinator` で、restart 判定後に `preloadReady = !hasPreloadEntries` としてリセットしています。preload なし構成では常に `true` にリセットされるのは正しいですが、初見では意図が読み取りにくいため、コメントで補足する価値があります。

#### preload API の高度なユースケースは未整理

単体指定、配列指定、名前付き map には対応していますが、より複雑な preload 設計や、bridge を複数層に分けるような運用までは整理できていません。

この plugin の責務を広げすぎない範囲で、どこまで支援するかを見極める必要があります。

#### dev 時の inspect から Electron environment の module graph が見えない

現状の dev orchestration では、`electron_main` と `electron_preload` の watch build を Vite dev server 本体の通常 module graph ではなく、別途生成した builder で回しています。そのため `vite-plugin-inspect` の UI では environment 名は見えても、module graph や変換履歴が空に見えることがあります。

理論上は、Electron 側の dev build を Vite dev server 側の environment 文脈へさらに寄せることで改善できる可能性があります。ただし watch build、再起動制御、custom environment の扱いをまとめて見直す必要があり、現時点では最低優先度です。

#### I/O 層のテストカバレッジ

`dev.ts` と `process.ts` はテスト対象外です。設計上 pure logic に集中したテスト方針を取っていますが、`process.ts` の `waitForProcessExit` や `stopWindowsProcessTree` のタイムアウト挙動は EventEmitter のモックで検証可能です。`dev.ts` の `resolveDevServerUrl` のエッジケース（`resolvedUrls` が `null` の場合）も同様に検証可能です。

### スコープ外

#### production renderer の責務境界

この plugin は production renderer の配置、解決、load を直接の責務としません。

- **同居構成**: renderer の build 出力は Vite 標準の `dist/` に入ります。Electron main から `loadFile(path.join(__dirname, '../dist/index.html'))` のように読むのは利用者側の責務です。
- **外部構成**: renderer app は別の Vite app として独立に build されます。その build 出力の配置先とロード方法は利用者側が管理します。

plugin が担当するのは dev 時の renderer URL 解決と環境変数への注入までです。production 時のファイル配置戦略は意図的にスコープ外としています。

#### external renderer 側の `base` 制御

external renderer mode では、renderer app は desktop app とは別の Vite app として build されます。そのため renderer 側の `base` のような設定は、desktop 側へ入れたこの plugin だけで直接上書きできません。

理論上は companion plugin や config helper を別途用意して、renderer app 側でも同じ package を使う形にすれば制御できます。ただしこれは現在の plugin 単体の責務からは外れています。
