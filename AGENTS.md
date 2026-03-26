# AGENTS.md

Guide for AI coding agents working in this repository.

## Project Overview

A pnpm workspace monorepo containing a Vite 8 plugin (`@srymh/vite-plugin-electron`) that
integrates Electron main/preload process builds using Vite's Environment API. The plugin
source lives in `packages/vite-plugin-electron/`. Two example apps (`example-single/`,
`example-multiple/`) demonstrate usage. Documentation and comments are written in Japanese.

## Build / Lint / Test Commands

All commands run from the workspace root unless noted otherwise.

| Task | Command |
|---|---|
| Build plugin | `pnpm build` |
| Lint plugin (oxlint) | `pnpm --filter @srymh/vite-plugin-electron lint` |
| Lint + fix | `pnpm --filter @srymh/vite-plugin-electron lint:fix` |
| Run all tests | `pnpm test` |
| Run a single test by name | `pnpm --filter @srymh/vite-plugin-electron exec vitest run -t "test name"` |
| Run tests in watch mode | `pnpm --filter @srymh/vite-plugin-electron exec vitest` |
| Format (oxfmt) | `pnpm fmt` |
| Format check | `pnpm fmt:check` |
| Dev (single example) | `pnpm dev:single` |
| Dev (multi example) | `pnpm dev:multiple` |

The plugin build script runs lint before bundling (`"build": "pnpm lint && tsdown"`).

Test file location: `packages/vite-plugin-electron/tests/electron.test.ts`
Build tool: `tsdown` (Rolldown-based bundler), config at `packages/vite-plugin-electron/tsdown.config.ts`

## Package Manager

pnpm 10.28.2 with workspaces. Always use `pnpm`, never `npm` or `yarn`.

## Module System

ESM throughout. Every `package.json` sets `"type": "module"`. The plugin outputs `.mjs` only.
Use `import`/`export` syntax, never `require()` (except for loading the CJS-only `electron`
binary via `createRequire`).

## TypeScript Configuration

- Target: ES2023, module: ESNext, moduleResolution: bundler
- `strict: true` with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` -- use inline `type` keyword in imports (e.g., `import { type Foo }`)
- `isolatedDeclarations: true` -- all exported functions and types must have explicit annotations
- `erasableSyntaxOnly: true` -- no `enum`, `namespace`, or other non-erasable TS syntax

## Code Formatting (oxfmt)

Configured in `.oxfmtrc.json`:
- **No semicolons** (`semi: false`)
- **Single quotes** (`singleQuote: true`)
- **Print width: 80**
- **2-space indentation** (default)
- **Trailing commas** on multi-line constructs
- Import sorting is automatic with `sortImports` enabled (ascending, blank lines between groups)

Run `pnpm fmt` to format; `pnpm fmt:check` to verify.

## Import Conventions

Imports must be in 3 groups separated by blank lines, each sorted ascending:

1. **Node built-ins** -- always use `node:` protocol prefix (`'node:path'`, `'node:process'`)
2. **Third-party packages** (`'vite'`, `'vitest'`)
3. **Relative/internal modules** (`'./types'`, `'./dev-state'`)

Use inline `type` keyword when mixing value and type imports from the same module:
```ts
import { type Plugin } from 'vite'
import { ELECTRON_MAIN_ENVIRONMENT_NAME, type ElectronPreloadEntryMap } from './types'
```

Use `import type` only for type-only re-exports or when the entire import is types.

## Naming Conventions

| Element | Convention | Examples |
|---|---|---|
| Files | `kebab-case.ts` | `dev-state.ts`, `create-window.ts` |
| Variables, functions | `camelCase` | `resolvedOptions`, `hasPreloadEntries` |
| Types | `PascalCase` | `ElectronPluginOptions`, `BuildWatcherEvent` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `ELECTRON_MAIN_ENVIRONMENT_NAME` |
| Booleans | `is`/`has` prefix | `isClosed`, `hasPreloadEntries` |
| Factory functions | `create` prefix | `createElectronBuildCoordinator` |
| Resolver functions | `resolve` prefix | `resolveElectronPluginOptions` |
| Getter functions | `get` prefix | `getElectronDebugArgs` |

Public API types use `Electron` prefix. Internal resolved types add `Resolved` prefix.

## Function Style

- Use `function` declarations for all exported and module-level functions (not arrow functions)
- Use arrow functions only for callbacks, closures, and small inline expressions
- Always explicitly annotate return types on exported functions
- Use `async`/`await` -- never `.then()` chains
- Prefix unawaited promises with `void` (e.g., `void stopProcess().catch(...)`)

## Type Style

- Use `type` aliases exclusively -- never `interface`
- Never use `any` -- use `unknown` instead, then narrow
- Minimize type assertions (`as`); acceptable uses: `as const`, `as never` for Vite plugin compat
- Use `satisfies` for validating object literals against types
- Use nullish coalescing (`??`) over logical OR (`||`) for defaults
- Use optional chaining (`?.`) freely
- Use numeric separators for large numbers: `5_000`, `10_000`

## Error Handling

- Throw `new Error('descriptive message')` for validation/invariant failures
- Use discriminated union outcome types for complex state transitions:
  ```ts
  type Outcome = { type: 'ignore' } | { type: 'error'; error?: unknown } | { type: 'restart' }
  ```
- Always type catch clauses as `catch (error: unknown)`, convert with `String(error)` for logging
- Use guard clauses (early returns) to reduce nesting
- In cleanup paths, use `.catch()` callbacks on fire-and-forget promises

## Export Patterns

- Named exports only -- no default exports (except framework-required config files)
- `index.ts` is the sole barrel file; all other modules import from specific paths
- Separate value exports and `export type` re-exports into distinct statements

## Testing Patterns (Vitest)

- Tests live in `packages/vite-plugin-electron/tests/`
- Use `describe` / `it` blocks (not `test`). Test descriptions are in Japanese
- Follow AAA pattern with `// Arrange`, `// Act`, `// Assert` comments
- Assertions use `expect(...).toEqual(...)`, `toMatchObject(...)`, `toBe(...)`, `toThrow(...)`
- Tests import directly from `../src/<module>` -- not from the barrel `../src/index`
- The test suite covers pure logic (option resolution, state machines, config generation);
  no I/O, no mocking of Vite internals

## Architecture (Plugin Source)

Each file in `packages/vite-plugin-electron/src/` has a clear responsibility:

| File | Role | Side effects? |
|---|---|---|
| `index.ts` | Public barrel; re-exports | No |
| `electron.ts` | Vite plugin factory; implements plugin hooks | No (hooks called by Vite) |
| `types.ts` | Shared type definitions and constants | No |
| `options.ts` | Option normalization, validation, helpers | No |
| `environment.ts` | Vite environment config construction | No |
| `dev-state.ts` | Build coordinator and restart scheduler (pure state machines) | No |
| `dev.ts` | Dev server orchestration (watcher + process lifecycle) | Yes |
| `process.ts` | Electron child process spawn/kill | Yes |

Console log prefix: `[vite-plugin-electron]` for all plugin-originated messages.

## Vite Plugin Conventions

- Register custom environments (`electron_main`, `electron_preload`) via the `config()` hook
- Use `this.environment.name` inside hooks to scope per-environment behavior
- Virtual modules: public ID `'virtual:...'`, resolved with `\0` prefix
- `electron` is always externalized in build configs
- Preload scripts output as CJS (`.cjs`), main process outputs as ESM (`.js`)
