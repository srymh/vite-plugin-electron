import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'

import { electron } from '@srymh/vite-plugin-electron'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    electron({
      main: 'electron/main.ts',
      preload: 'electron/preload.ts',
      debug: {
        enabled: true,
        port: 9229,
        rendererPort: 9222,
      },
      build: {
        outDir: 'dist-electron',
        sourcemap: true,
        minify: false,
      },
    }),
    Inspect(),
  ],
}))
