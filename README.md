# vite-plugin-electron

Vite 8 の Environment API を使って Electron main/preload プロセスのビルドを統合するプラグインと、その利用例をまとめた pnpm workspace です。

## パッケージ

| パッケージ | 説明 |
|---|---|
| [packages/vite-plugin-electron](packages/vite-plugin-electron/) | プラグイン本体（[@srymh/vite-plugin-electron](https://npmjs.com/package/@srymh/vite-plugin-electron)） |
| [example-single](example-single/) | renderer 同居型のサンプル |
| [example-multiple](example-multiple/) | external renderer サンプル |

## ドキュメント

- [docs/docs/](docs/docs/) — プラグインの詳細ドキュメント（MkDocs）
- [packages/vite-plugin-electron/README.md](packages/vite-plugin-electron/README.md) — npm 向けの概要（英語）
- [packages/vite-plugin-electron/README_ja.md](packages/vite-plugin-electron/README_ja.md) — 同上の日本語版

## セットアップ

```bash
pnpm install
```

## Workspace コマンド

```bash
pnpm build           # プラグインビルド
pnpm test            # テスト実行
pnpm dev:single      # 同居型サンプルの開発サーバー
pnpm dev:multiple    # external renderer サンプルの開発サーバー
```

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
