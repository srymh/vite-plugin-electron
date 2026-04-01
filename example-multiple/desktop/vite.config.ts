import { defineConfig } from 'vite'

import {
  electron,
  type ElectronPluginOptions,
} from '@srymh/vite-plugin-electron'

const electronOptions: ElectronPluginOptions = {
  main: {
    entry: 'src/main.ts',
    vite: {
      build: { outDir: 'dist', sourcemap: true, minify: false },
    },
  },
  preload: {
    entry: 'src/preload.ts',
    vite: {
      build: { outDir: 'dist', sourcemap: true, minify: false },
    },
  },
  renderer: {
    mode: 'external',
    devUrl: 'http://localhost:5173',
  },
  debug: {
    enabled: true,
    port: 9229,
    rendererPort: 9222,
  },
}

export default defineConfig({
  server: {
    port: 5174,
  },
  plugins: [electron(electronOptions)],
})
