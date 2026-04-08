# ドキュメントサイト

`@srymh/vite-plugin-electron` のドキュメントソースです。[MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfundamentals.github.io/mkdocs-material/) で構成しています。

## ローカルプレビュー

```bash
cd docs
uv sync        # 初回のみ
uv run mkdocs serve
```

ブラウザで http://127.0.0.1:8000 を開くとライブプレビューを確認できます。

## ビルド

```bash
uv run mkdocs build
```

`site/` ディレクトリに静的ファイルが出力されます。

## GitHub Pages 公開

このリポジトリでは GitHub Actions で GitHub Pages に公開します。

1. GitHub の Settings > Pages を開く
2. Build and deployment の Source で GitHub Actions を選ぶ
3. `main` ブランチに push すると `.github/workflows/docs-pages.yml` が `site/` を build して公開する

公開 URL は https://srymh.github.io/vite-plugin-electron/ です。

`mkdocs gh-deploy` による `gh-pages` ブランチ運用は標準フローとしては採用していません。生成物は CI で build し、`site/` も Git 管理しない前提です。
