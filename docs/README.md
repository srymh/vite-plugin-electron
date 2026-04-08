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
