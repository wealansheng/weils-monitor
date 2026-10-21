import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts', 'src/player.ts'], format: ['esm', 'cjs'], dts: { resolve: ['@weils-monitor/shared'] },
  sourcemap: true, clean: true, splitting: false,
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
})
