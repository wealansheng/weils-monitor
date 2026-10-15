export default defineNuxtConfig({
  compatibilityDate: '2026-10-15',
  modules: ['@weils-monitor/nuxt'],
  devtools: { enabled: false },
  // Avoid Nuxt's dev startup race while resolving #app-manifest.
  experimental: { appManifest: false },
  cyMonitor: {
    url: '/api/monitor',
    appId: 'nuxt-example',
    projectName: 'weils-monitor-nuxt-example',
    batchSize: 20,
    clickAttributes: ['custom-data'],
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
