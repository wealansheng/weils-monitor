export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  modules: ['@weils-monitor/nuxt'],
  sourcemap: { client: 'hidden', server: 'hidden' },
  nitro: {
    // Nitro excludes embedded sources by default; private symbolication needs them.
    rollupConfig: { output: { sourcemapExcludeSources: false } },
    experimental: { sourcemapMinify: false },
  },
  devtools: { enabled: false },
  // Avoid Nuxt's dev startup race while resolving #app-manifest.
  experimental: { appManifest: false },
  nuxtMonitor: {
    url: '/api/monitor',
    appId: 'nuxt-example',
    release: process.env.MONITOR_RELEASE || 'local',
    projectName: 'weils-monitor-nuxt-example',
    batchSize: 20,
    clickAttributes: ['custom-data'],
    // Nuxt 专属采集能力，三个开关默认都是 true。
    hydration: true,
    ssr: true,
    frameworkErrors: true,
    debug: false,
  },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Nuxt 监控演示 · weils monitor',
      meta: [{ name: 'description', content: '在 Nuxt 中体验客户端监控、路由切换和错误上报。' }],
    },
  },
})
