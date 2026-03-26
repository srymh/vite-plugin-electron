import { defineConfig } from 'vite'

import {
  electron,
  type ElectronPluginOptions,
} from '@srymh/vite-plugin-electron'

const electronOptions: ElectronPluginOptions = {
  main: 'src/main.ts',
  preload: 'src/preload.ts',
  renderer: {
    mode: 'external',
    devUrl: 'http://localhost:5173',
  },
  debug: {
    enabled: true,
    port: 9229,
    rendererPort: 9222,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: false,
  },
}

export default defineConfig({
  server: {
    port: 5174,
  },
  plugins: [electron(electronOptions)],
})
