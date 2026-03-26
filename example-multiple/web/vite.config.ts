import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [react()],
}))
