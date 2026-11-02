import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/reporter.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // error-stack-parser 是 CommonJS，依赖同样为 CJS 的 stackframe。
  // 小程序（mp-weixin）构建器不会为运行时 require('stackframe') 产出模块，
  // 因此必须在 core 产物中内联，避免浏览器 SDK 的依赖泄漏到非浏览器宿主。
  noExternal: ['error-stack-parser', 'stackframe'],
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
})
