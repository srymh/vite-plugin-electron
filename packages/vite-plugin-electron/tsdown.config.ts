import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
  minify: true,
  clean: true,
  deps: {
    skipNodeModulesBundle: true,
  },
})
