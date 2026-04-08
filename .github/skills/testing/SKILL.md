---
name: testing
description: 'このリポジトリのテストパターンと規約。Vitest を使った単体テストの書き方、AAA パターン、アサーション、import 規約を含む。テストファイルの編集時に参照する。'
---

# テストパターン (Vitest)

## 基本

- テストは `packages/vite-plugin-electron/tests/` に配置
- `describe` / `it` ブロックを使う（`test` は不可）
- テストの説明文は**日本語**で書く

## AAA パターン

すべてのテストで Arrange / Act / Assert のコメントを付ける:

```ts
it('preload entry を正規化する', () => {
  // Arrange
  const input = 'electron/preload.ts'

  // Act
  const result = normalizePreloadEntries(input)

  // Assert
  expect(result).toEqual({ preload: 'electron/preload.ts' })
})
```

## アサーション

使う:

- `expect(...).toEqual(...)` — 深い等値比較
- `expect(...).toMatchObject(...)` — 部分一致
- `expect(...).toBe(...)` — 厳密等値
- `expect(...).toThrow(...)` — 例外

## import 規約

テストは barrel (`../src/index`) からではなく、個別のモジュールから直接 import する:

```ts
// ✅ 正しい
import { resolveElectronPluginOptions } from '../src/options'

// ❌ 避ける
import { resolveElectronPluginOptions } from '../src/index'
```

## テスト対象

テストスイートは pure logic を対象とする:

- option の正規化とバリデーション
- state machine の状態遷移
- environment build config の生成
- debug 引数の組み立て

I/O や Vite 内部のモックは行わない。

## コマンド

```bash
# 全テスト実行
pnpm test

# 特定テストのみ
pnpm --filter @srymh/vite-plugin-electron exec vitest run -t "テスト名"

# watch モード
pnpm --filter @srymh/vite-plugin-electron exec vitest
```
