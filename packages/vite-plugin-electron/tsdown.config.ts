import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  clean: true,
  deps: {
    skipNodeModulesBundle: true,
  },
})
