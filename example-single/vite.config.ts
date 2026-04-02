import { electron } from '@srymh/vite-plugin-electron'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: { sourcemap: true, minify: false },
        },
      },
      preload: {
        entry: 'electron/preload.ts',
        vite: {
          build: { sourcemap: true, minify: false },
        },
      },
      debug: {
        enabled: true,
        port: 9229,
        rendererPort: 9222,
      },
    }),
    Inspect(),
  ],
}))
