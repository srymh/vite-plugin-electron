---
name: coding-conventions
description: 'このリポジトリのコーディング規約。import 順序、命名規則、関数・型スタイル、エラーハンドリング、export パターン、JSDoc 規約を含む。TypeScript ファイルの編集時に参照する。'
---

# コーディング規約

## import の順序

3 グループを空行で区切り、各グループ内は昇順ソート:

1. **Node built-in** — 常に `node:` prefix を使う（`'node:path'`、`'node:process'`）
2. **サードパーティ**（`'vite'`、`'vitest'`）
3. **相対・内部モジュール**（`'./types'`、`'./dev-state'`）

値と型を混合する場合は inline `type` キーワードを使う:

```ts
import { type Plugin } from 'vite'
import { ELECTRON_MAIN_ENVIRONMENT_NAME, type ElectronPreloadEntryMap } from './types'
```

import 全体が型のみの場合のみ `import type` を使う。

## 命名規則

| 要素 | 規則 | 例 |
|---|---|---|
| ファイル | `kebab-case.ts` | `dev-state.ts`、`create-window.ts` |
| 変数・関数 | `camelCase` | `resolvedOptions`、`hasPreloadEntries` |
| 型 | `PascalCase` | `ElectronPluginOptions`、`BuildWatcherEvent` |
| モジュールレベル定数 | `SCREAMING_SNAKE_CASE` | `ELECTRON_MAIN_ENVIRONMENT_NAME` |
| boolean | `is`/`has` prefix | `isClosed`、`hasPreloadEntries` |
| factory 関数 | `create` prefix | `createElectronBuildCoordinator` |
| resolver 関数 | `resolve` prefix | `resolveElectronPluginOptions` |
| getter 関数 | `get` prefix | `getElectronDebugArgs` |

公開 API の型は `Electron` prefix を使う。内部の解決済み型は `Resolved` prefix を追加する。

## 関数スタイル

- export / モジュールレベル関数は `function` 宣言を使う（arrow 不可）
- arrow 関数はコールバック、クロージャ、小さな inline 式にのみ使う
- export 関数は必ず戻り値の型を明示する
- `async`/`await` を使う — `.then()` チェーンは不可
- await しない Promise は `void` prefix を付ける（例: `void stopProcess().catch(...)`）

## 型スタイル

- `type` エイリアスのみ使う — `interface` は不可
- `any` は不可 — `unknown` を使い、narrow する
- 型アサーション（`as`）は最小限に — 許容: `as const`、Vite plugin 互換のための `as never`
- object リテラルの型検証には `satisfies` を使う
- デフォルト値には `??`（nullish coalescing）を使う — `||` は不可
- optional chaining（`?.`）は自由に使う
- 大きな数値には numeric separator を使う: `5_000`、`10_000`

## エラーハンドリング

- バリデーション/不変条件の違反は `throw new Error('descriptive message')` を使う
- 複雑な状態遷移には discriminated union の outcome 型を使う:
  ```ts
  type Outcome = { type: 'ignore' } | { type: 'error'; error?: unknown } | { type: 'restart' }
  ```
- catch 句は `catch (error: unknown)` と型付け、ログ出力は `String(error)` で変換
- ネストを減らすために guard clause（早期 return）を使う
- cleanup パスでは fire-and-forget promise に `.catch()` を使う

## export パターン

- named export のみ — default export は不可（フレームワーク必須の設定ファイルを除く）
- `index.ts` が唯一の barrel file。他のモジュールは直接パスから import する
- 値の export と `export type` の re-export は別のステートメントに分ける

## JSDoc 規約

export されたすべての関数に **日本語** の JSDoc を付ける:

- `@param` タグに日本語の説明
- `@returns` タグに日本語の説明
- throw する可能性がある場合は `@throws` タグ

コンソールログのプレフィックス: `[vite-plugin-electron]`
