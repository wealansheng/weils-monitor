export default defineNuxtPlugin(() => {
  // 用 useNuxtApp() 而不是插件回调参数，是为了同时兼容 Nuxt 3 与 Nuxt 4：
  // Nuxt 3 的回调参数是内部未导出的 `_NuxtApp`（带 `[key: string]: unknown` 索引签名），
  // 对公开 `NuxtApp` 接口的 `$monitor` 增强在它上面不可见；Nuxt 4 已改为公开的 `NuxtApp`。
  // useNuxtApp() 在两个大版本下都返回公开 `NuxtApp`，因此类型始终准确。
  useNuxtApp().$monitor?.addClickHandler('plugin-action')
})
