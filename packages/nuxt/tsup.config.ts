import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    module: 'src/module.ts',
    'runtime/plugin.client': 'src/runtime/plugin.client.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['nuxt', 'nuxt/app', '@nuxt/kit', '@nuxt/schema'],
  outExtension() {
    return {
      js: '.mjs',
    }
  },
})
