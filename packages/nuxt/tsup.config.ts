import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    module: 'src/module.ts',
    'runtime/plugin.client': 'src/runtime/plugin.client.ts',
    // 以下运行时模块由客户端插件引用，同时作为独立入口输出：
    // 便于按需接入（只用水合 / SSR / 错误采集）以及仓库内的冒烟验证。
    'runtime/wire': 'src/runtime/wire.ts',
    'runtime/hydration': 'src/runtime/hydration.ts',
    'runtime/ssr': 'src/runtime/ssr.ts',
    'runtime/errors': 'src/runtime/errors.ts',
    'runtime/server/plugin': 'src/runtime/server/plugin.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // 每个入口自包含：避免服务端运行时与客户端运行时被合并进同一个共享 chunk。
  splitting: false,
  external: ['nuxt', 'nuxt/app', '@nuxt/kit', '@nuxt/schema'],
  outExtension() {
    return {
      js: '.mjs',
    }
  },
})
