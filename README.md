# vite-plugin-electron

Vite 8 の Environment API を使って Electron main process を扱う plugin と、その利用例をまとめた pnpm workspace です。

このリポジトリには 3 つの関心ごとがあります。

- packages/vite-plugin-electron: plugin 本体
- example-single: renderer 同居型の単体サンプル
- example-multiple: desktop と web を分離した external renderer サンプル

## Workspace 構成

```text
vite-plugin-electron/
  example-single/
  example-multiple/
    desktop/
    web/
    electron-api/
  packages/
    vite-plugin-electron/
```

## セットアップ

workspace root で実行します。

```bash
pnpm install
```

Windows では postinstall 時に Electron 向け native dependency の再構築が走ります。

## Workspace コマンド

### plugin 本体

```bash
pnpm build
pnpm test
```

- `pnpm build`: packages/vite-plugin-electron をビルドします。
- `pnpm test`: packages/vite-plugin-electron のテストを実行します。

### 単体サンプル

```bash
pnpm dev:single
pnpm build:single
pnpm preview:single
pnpm package:single
```

- example-single は renderer と Electron main/preload を 1 package に同居させたサンプルです。
- `pnpm build:single` で renderer は dist、Electron 側は dist-electron に出力されます。
- `pnpm preview:single` は build 後の dist-electron/main.js を Electron で起動します。
- `pnpm package:single` は example-single/electron-builder.json5 を使って配布物を生成します。

### external renderer サンプル

```bash
pnpm dev:multiple
pnpm build:multiple
pnpm preview:multiple
pnpm package:multiple
```

- example-multiple/desktop は Electron main / preload を持つ desktop 側です。
- example-multiple/web は external renderer として別 Vite app で動きます。
- example-multiple/electron-api は preload 経由で共有する型定義です。
- `pnpm build:multiple` で web と desktop を順に build します。
- `pnpm preview:multiple` と `pnpm package:multiple` は必要な build を先に実行してから desktop を起動または package します。

## 読み分け

- plugin の公開 API と設計方針: [packages/vite-plugin-electron/README.md](packages/vite-plugin-electron/README.md)
- 単体サンプルの使い方: [example-single/README.md](example-single/README.md)
- external renderer サンプルの使い方: [example-multiple/README.md](example-multiple/README.md)
- web 側サンプルの補足: [example-multiple/web/README.md](example-multiple/web/README.md)

## 補足

- plugin 側は Vite root 基準で path を解決するため、monorepo の app root でも扱いやすい構成です。
- external renderer mode では desktop 側に index.html を置かずに build できます。
- Windows では Electron プロセスツリー停止を含めた dev orchestration を優先して検証しています。
