# @weils-monitor/nuxt

Nuxt 3 / Nuxt 4 监控模块。它自动安装 Vue 监控，并增加水合、服务端渲染耗时与 Nuxt 框架错误采集。

## 安装

```bash
pnpm add @weils-monitor/nuxt
```

## 最小接入

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@weils-monitor/nuxt'],
  nuxtMonitor: {
    url: '/api/monitor',
    appId: 'my-nuxt-app',
    projectName: 'my-nuxt-app',
    clickAttributes: ['data-monitor-action'],
  },
})
```

模块仅在客户端创建监控实例；`url` 或 `appId` 为空时不会启动。浏览器事件与 Nuxt 专属指标共用同一上报队列。

## 自定义点击与事件

```vue
<template>
  <button data-monitor-action="open_settings">设置</button>
</template>
```

在客户端组件或 `*.client.ts` 插件中可使用自动注入的 `$monitor`：

```ts
const { $monitor } = useNuxtApp()
$monitor?.report({
  event_type: 'behavior',
  action: 'settings_saved',
  properties: { source: 'profile' },
})
```

`$monitor` 只在客户端提供，因此示例使用可选链。

## Nuxt 专属开关

以下配置写在 `nuxtMonitor` 中，默认均为 `true`，设为 `false` 即可关闭：

| 配置 | 采集内容 |
| --- | --- |
| `hydration` | `nuxt_hydration`、`nuxt_hydration_complete`；仅 SSR 页面产生 |
| `ssr` | HTML 响应的 `Server-Timing` 中的 `nuxt_ssr`，客户端上报 `nuxt_ssr_render` |
| `frameworkErrors` | `nuxt_error`、`nuxt_chunk_error`、`nuxt_ssr_error` 等框架错误 |

```ts
export default defineNuxtConfig({
  modules: ['@weils-monitor/nuxt'],
  nuxtMonitor: {
    url: '/api/monitor',
    appId: 'my-nuxt-app',
    hydration: false, // 仅按需关闭某项采集
  },
})
```

SSR 耗时依赖浏览器读取 Navigation Timing 的 `serverTiming`；不支持时跳过该指标。完整 Nuxt 4 演示见 [`example/nuxt`](../../example/nuxt)。
