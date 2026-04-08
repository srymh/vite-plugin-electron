# AGENTS.md

AI コーディングエージェント向けのガイドです。

## プロジェクト概要

Vite 8 プラグイン（`@srymh/vite-plugin-electron`）を含む pnpm workspace monorepo です。
Electron main/preload のビルドを Vite の Environment API で統合します。
プラグインのソースは `packages/vite-plugin-electron/` にあります。
利用例は `example-single/`（同居型）と `example-multiple/`（external renderer）です。

## ドキュメントポリシー

- ソースコードが常に source of truth です
- `docs/docs/` のドキュメントはソースに追従していない場合があります
- コードの振る舞いに疑問がある場合は、ドキュメントではなくソースを参照してください
- JSDoc、コメント、テスト説明文は**日本語**で書きます

## ビルド / Lint / テストコマンド

workspace root で実行します。常に `pnpm`（10.28.2）を使ってください。

| タスク | コマンド |
|---|---|
| プラグインビルド（lint + bundle） | `pnpm build` |
| Lint（oxlint） | `pnpm --filter @srymh/vite-plugin-electron lint` |
| Lint + fix | `pnpm --filter @srymh/vite-plugin-electron lint:fix` |
| 全テスト実行 | `pnpm test` |
| 特定テスト実行 | `pnpm --filter @srymh/vite-plugin-electron exec vitest run -t "テスト名"` |
| watch モード | `pnpm --filter @srymh/vite-plugin-electron exec vitest` |
| フォーマット（oxfmt） | `pnpm fmt` |
| フォーマットチェック | `pnpm fmt:check` |

ビルドスクリプトは lint を経由します: `"build": "pnpm lint && tsdown"`。
ビルドツール: `tsdown`（Rolldown ベース）、設定は `packages/vite-plugin-electron/tsdown.config.ts`。
テストファイル: `packages/vite-plugin-electron/tests/electron.test.ts`。

**変更を完了する前に必ず `pnpm build` と `pnpm test` を実行してください。**

## TypeScript LSP

TypeScript language server にアクセスできる場合は積極的に使ってください:

- **編集前**: diagnostics で既存のエラーと型を把握
- **編集中**: hover / type info で signature を確認（推測しない）
- **編集後**: diagnostics で新しいエラーがないことを確認
- **探索時**: go-to-definition と find-references をテキスト検索より優先
- **リネーム**: find-and-replace ではなく LSP rename を使う

## TypeScript 設定

設定: `packages/vite-plugin-electron/tsconfig.json`。Target ES2023、ESNext modules、bundler resolution。

- `strict: true`（`noUnusedLocals`、`noUnusedParameters`、`noFallthroughCasesInSwitch`）
- `verbatimModuleSyntax: true` — import 文で inline `type` キーワードを使う
- `isolatedDeclarations: true` — export された関数/型には明示的な型注釈が必要
- `erasableSyntaxOnly: true` — `enum`、`namespace` 等の非消去構文は不可

全体が ESM です。すべての `package.json` に `"type": "module"` を設定。
`import`/`export` を使い、`require()` は不可（CJS 専用の `electron` バイナリを `createRequire` でロードする場合を除く）。

## コードフォーマット（oxfmt）

`.oxfmtrc.json` で設定:
- **セミコロンなし**、**シングルクォート**、**print width 80**、**2 スペースインデント**
- 複数行でのトレーリングカンマ
- import ソートは自動（`sortImports` 有効、昇順、グループ間に空行）

`pnpm fmt` でフォーマット、`pnpm fmt:check` でチェック。

## コーディング規約とテストパターン

詳細は Skill ファイルを参照してください:

- `.github/skills/coding-conventions/SKILL.md` — import 順序、命名規則、関数・型スタイル、エラーハンドリング、export パターン、JSDoc 規約
- `.github/skills/testing/SKILL.md` — Vitest テストパターン、AAA パターン、アサーション、import 規約

## アーキテクチャ（プラグインソース）

`packages/vite-plugin-electron/src/` の各ファイルの責務:

| ファイル | 役割 | 副作用 |
|---|---|---|
| `index.ts` | 公開 barrel。re-export | なし |
| `electron.ts` | Vite plugin factory。plugin hook の実装 | なし（hook は Vite が呼ぶ） |
| `types.ts` | 共有型定義と定数 | なし |
| `options.ts` | option 正規化、バリデーション、helper | なし |
| `environment.ts` | Vite environment 設定の構築 | なし |
| `dev-state.ts` | build coordinator と restart scheduler（pure state machine） | なし |
| `dev.ts` | dev server orchestration（watcher + process lifecycle） | あり |
| `process.ts` | Electron child process の起動/停止 | あり |

## Vite プラグイン規約

- `config()` hook で custom environment（`electron_main`、`electron_preload`）を登録
- hook 内では `this.environment.name` で environment ごとの処理を分岐
- 仮想モジュール: 公開 ID は `'virtual:...'`、解決時は `\0` prefix
- `electron` は常にビルド設定で externalize
- preload の出力は CJS（`.cjs`）、main は ESM（`.js`）
- `builder: {}` を config に設定して `vite build --app` をサポート
