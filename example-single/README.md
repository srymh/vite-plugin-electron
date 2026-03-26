# @srymh/single

renderer と Electron main/preload を 1 package に同居させた、最小構成のサンプルです。

このサンプルでは plugin が起動した renderer dev server をそのまま Electron から参照します。external renderer は使わず、Vite app と Electron app を同じ package で完結させる構成です。

## 関連ファイル

- vite.config.ts: plugin 設定の入口
- electron/main.ts: Electron main entry
- electron/preload.ts: preload entry
- electron/create-window.ts: BrowserWindow 作成と navigation 制御
- electron/start-app.ts: app lifecycle の薄いラッパー

## ローカルコマンド

example-single 直下で実行する場合:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm package
pnpm lint
```

workspace root から実行する場合:

```bash
pnpm dev:single
pnpm build:single
pnpm preview:single
pnpm package:single
```

## 動作

- `pnpm dev`: renderer dev server を起動し、plugin が Electron main/preload を watch build します。
- `pnpm build`: renderer は dist、Electron 側は dist-electron へ出力されます。
- `pnpm preview`: build 済みの dist-electron/main.js を Electron で起動します。
- `pnpm package`: build 後に electron-builder を実行し、release/${version} 配下へ配布物を生成します。

## このサンプルで確認できること

- renderer 同居構成での plugin 設定
- preload を CommonJS 出力で読み込む構成
- dev 時の Electron 再起動と debug port 設定
- production では dist/index.html を読み込む切り替え

## 補足

- plugin の API 詳細は ../../packages/vite-plugin-electron/README.md を参照してください。
- Electron 配布設定は electron-builder.json5 にあります。
