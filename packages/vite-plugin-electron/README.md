# vite-plugin-electron

[![npm version](https://img.shields.io/npm/v/@srymh/vite-plugin-electron.svg)](https://npmjs.com/package/@srymh/vite-plugin-electron)

> [日本語版 README はこちら](https://github.com/srymh/vite-plugin-electron/blob/main/packages/vite-plugin-electron/README_ja.md)

A small, experimental Vite 8 plugin that integrates Electron main/preload process builds using Vite's Environment API.

The plugin adds custom environments for Electron main/preload and handles:

- Starting the renderer dev server with `vite dev`
- Watch-building the Electron main process
- Restarting Electron on build completion
- Building client and Electron together with `vite build`
- Debug support for attaching to both main and renderer from VS Code
- Both co-located (internal) and separate (external) renderer setups

For detailed documentation, see the [docs site](https://srymh.github.io/vite-plugin-electron/).

## Quick Start

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { electron } from '@srymh/vite-plugin-electron'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { entry: 'electron/preload.ts' },
      debug: {
        enabled: true,
        port: 9229,
        rendererPort: 9222,
      },
    }),
  ],
})
```

## Options

`electron(options)` accepts an `ElectronPluginOptions` object:

| Option | Required | Description |
|---|---|---|
| `main` | Yes | Main process entry and optional Vite config overrides |
| `preload` | No | Preload script entry (string, array, or named map) and optional Vite config overrides |
| `debug` | No | Debugger settings for dev. `true` enables defaults |
| `renderer` | No | Renderer reference mode (`'internal'` or `'external'`) |

### `main`

| Field | Type | Description |
|---|---|---|
| `entry` | `string` | Main process entry file, resolved relative to Vite root |
| `vite` | `UserConfig` | Optional Vite config overrides for this environment |

### `preload`

| Field | Type | Description |
|---|---|---|
| `entry` | `ElectronPreloadInput` | Preload entry — string, array, or `Record<name, path>` |
| `vite` | `UserConfig` | Optional Vite config overrides for this environment |

Preload entries output as CJS (`.cjs`). Main outputs as ESM (`.js`).

### `debug`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable debug flags |
| `host` | `string` | `'localhost'` | Node inspector bind host |
| `port` | `number` | `9229` | Node inspector port for main |
| `break` | `boolean` | `false` | Use `--inspect-brk` |
| `rendererPort` | `number` | `9222` | Chromium remote debugging port |

### `renderer`

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `'internal' \| 'external'` | auto | Renderer placement mode |
| `devUrl` | `string` | — | External renderer dev server URL |
| `devUrlEnvVar` | `string` | `'VITE_DEV_SERVER_URL'` | Env var name for the renderer URL |

For full option details including preload entry formats, constraints, and build defaults, see the [options reference](../../docs/docs/options.md).

## Exported Types

```ts
import {
  electron,
  type ElectronPluginOptions,
  type ElectronMainOptions,
  type ElectronPreloadOptions,
  type ElectronPreloadEntry,
  type ElectronPreloadEntryMap,
  type ElectronPreloadInput,
  type ElectronDebugOptions,
  type ElectronRendererMode,
  type ElectronRendererOptions,
} from '@srymh/vite-plugin-electron'
```

## Build / Dev Behavior

**`vite dev`**: Starts the renderer dev server, watch-builds `electron_main` (and `electron_preload` if configured), and restarts Electron when builds complete. Restart requests are coalesced by an internal scheduler to avoid unnecessary restarts.

**`vite build`**: Builds client, `electron_main`, and `electron_preload` environments. The plugin automatically enables `builder: {}`, so `vite build --app` is not required in user scripts.

**Output defaults**: `dist-electron/main.js` (ESM) and `dist-electron/preload.cjs` (CJS). Configurable via the build options.

## Development

```bash
pnpm build   # lint + tsdown bundle
pnpm test    # vitest run
pnpm lint    # oxlint
```

## Further Reading

- [Getting Started](../../docs/docs/getting-started.md)
- [Build / Dev Guide](../../docs/docs/guide.md)
- [Options Reference](../../docs/docs/options.md)
- [Internal Architecture](../../docs/docs/architecture.md)
- [VS Code Debug](../../docs/docs/vscode-debug.md)
- [Scope & Responsibilities](../../docs/docs/scope.md)

## License

MIT
