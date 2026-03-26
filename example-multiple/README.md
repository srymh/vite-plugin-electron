# example-multiple

desktop と web を分離した external renderer サンプルです。

- example-multiple/desktop: Electron main / preload / packaging
- example-multiple/web: React renderer
- example-multiple/electron-api: preload 経由で共有する型定義

desktop 側は renderer を同居させず、example-multiple/web の dev server または build 成果物を読み込みます。

## 構成

```text
example-multiple/
  desktop/
  web/
  electron-api/
```

## workspace root から使うコマンド

```bash
pnpm dev:multiple
pnpm build:multiple
pnpm preview:multiple
pnpm package:multiple
```

- `pnpm dev:multiple`: web と desktop を並列起動します。
- `pnpm build:multiple`: web を build したあと desktop を build します。
- `pnpm preview:multiple`: 必要な build を実行したあと、desktop の dist/main.js を Electron で起動します。
- `pnpm package:multiple`: 必要な build を実行したあと、desktop を electron-builder で package します。

## 各 package で使うコマンド

example-multiple/web:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
```

example-multiple/desktop:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm package
```

## 動作

- 開発時、desktop は vite.config.ts で指定した `http://localhost:5173` を external renderer として参照します。
- desktop 自身の Vite root は example-multiple/desktop のままで、Electron main/preload の build 出力は dist に生成されます。
- local preview と packaged app では example-multiple/web/dist/index.html を読み込みます。
- packaging 時、web の build 成果物は electron-builder の files 設定で `web/dist` として app.asar に含まれます。

## 関連ファイル

- desktop/vite.config.ts
- desktop/electron-builder.json5
- desktop/src/main.ts
- desktop/src/create-window.ts
- web/vite.config.ts
- electron-api/index.d.ts
