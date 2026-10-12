import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/module.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['nuxt', '@nuxt/kit', '@nuxt/schema'],
  outExtension() {
    return {
      js: '.mjs',
    }
  },
})
