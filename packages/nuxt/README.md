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

生产 Nuxt 会从客户端 payload 中移除服务端错误堆栈。要用私有 Source Map 定位 SSR 错误，在运行 Nitro 的环境中设置 `MONITOR_SSR_ENDPOINT`（绝对 HTTP 上报地址）、`MONITOR_SSR_APP_ID`（与 `nuxtMonitor.appId` 相同）和 `MONITOR_RELEASE`（与 `nuxtMonitor.release` 相同）。Nitro 错误钩子会直接上报带原始堆栈的 `nuxt_ssr_error`；客户端仍会补报不含堆栈的简要错误。完整流程见 [Source Map 定位指南](../../docs/source-map.md)。
## 客户端错误录制与上传

在 `nuxtMonitor` 中添加以下配置即可开启客户端懒加载录制；通用 SDK 默认关闭，服务端不运行 rrweb：

```ts
replay: {
  enabled: true,
  url: '/api/v1/records',
  sampleRate: 1,
  beforeErrorMs: 30_000,
  afterErrorMs: 10_000,
}
```

Nuxt 配置仅使用可序列化字段。状态订阅使用已有客户端实例，不需要再创建录制器：

```ts
// app/plugins/replay-status.client.ts（Nuxt 4）
export default defineNuxtPlugin(() => {
  useNuxtApp().$monitor?.replay.subscribe(status => console.info('[replay]', status))
})
```

客户端 `$monitor.replay` 提供 `start/stop/capture/flush/destroy/subscribe`。订阅不补发此前的状态。脱敏函数等不可序列化配置可使用独立 `createRecorder` API；此时关闭模块的自动录制，避免重复录制，并自行关联错误。

JS、Promise、Vue、`nuxt_error` 与 `nuxt_chunk_error` 自动触发；`nuxt_ssr_error`、资源错误和白屏不触发。Nuxt 示例通过 `/api/records` 转发到后端 `/api/v1/records`，该转发是示例实现，安装模块不会自动创建接收接口。

本仓库 [Nuxt 示例](../../example/nuxt/README.md) 默认开启，窗口为前 10 秒、后 5 秒，仅录制与上传。完整配置见 [replay 子包](../replay/README.md)，三项目联调见 [Replay 接入与排障](../../docs/replay.md)。
