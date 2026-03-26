# @srymh/web

example-multiple の renderer アプリです。React + Vite で構成されており、example-multiple/desktop から external renderer として利用されます。

## ローカルコマンド

example-multiple/web 直下で実行する場合:

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
```

workspace root から example-multiple 全体を扱う場合:

```bash
pnpm dev:multiple
pnpm build:multiple
pnpm preview:multiple
pnpm package:multiple
```

## 役割

- 開発時は Vite dev server を提供し、desktop 側は `renderer.devUrl` でこの URL を参照します。
- build 時は example-multiple/web/dist を出力します。
- local preview と packaging の両方で、この dist が desktop 側から読み込まれます。

## 関連ファイル

- ../README.md
- ../desktop/vite.config.ts
- ../desktop/src/main.ts
