# weils-monitor

面向 Vue 3、Nuxt 3 和 Nuxt 4 的前端监控 SDK。它采集浏览器性能、错误、用户行为和页面稳定性事件，通过共享队列批量发送；Vue 适配层补充组件与路由指标，Nuxt 适配层补充水合、SSR 和框架错误指标。

## 选择接入方式

| 包 | 用途 | 文档 |
| --- | --- | --- |
| `@weils-monitor/vue` | Vue 3 应用的主要入口 | [Vue 使用示例](packages/vue/README.md) |
| `@weils-monitor/nuxt` | Nuxt 3 / 4 模块，自动接入 Vue 监控 | [Nuxt 使用示例](packages/nuxt/README.md) |
| `@weils-monitor/core` | 通用浏览器采集器、上报器工厂与采集注册表 | [core 使用示例](packages/core/README.md) |
| `@weils-monitor/shared` | 事件类型、默认配置与常量 | [shared 使用示例](packages/shared/README.md) |
| `@weils-monitor/utils` | 配置、队列发送与性能评分工具 | [utils 使用示例](packages/utils/README.md) |

应用接入通常只需安装 Vue 或 Nuxt 包。core、shared 和 utils 供需要自定义采集或底层上报流程的场景使用。

## Vue 快速开始

```bash
pnpm add @weils-monitor/vue
```

```ts
// src/monitor.ts
import { createMonitor } from '@weils-monitor/vue'

export const monitor = createMonitor({
  url: '/api/monitor',
  appId: 'my-vue-app',
  projectName: 'my-vue-app',
})
```

```ts
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { monitor } from './monitor'

const app = createApp(App)
app.use(monitor)
app.mount('#app')
monitor.observer()
```

安装插件应早于 `mount()`，以记录首次组件挂载。`observer()` 启动浏览器采集器；也可以只调用 `monitor.performance.observeTTFB()` 等单项采集器。已有 Vue Router 时，先安装 Router，再安装监控插件。

## Nuxt 快速开始

```bash
pnpm add @weils-monitor/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@weils-monitor/nuxt'],
  nuxtMonitor: {
    url: '/api/monitor',
    appId: 'my-nuxt-app',
    projectName: 'my-nuxt-app',
    clickAttributes: ['data-monitor-action'],
    hydration: true,
    ssr: true,
    frameworkErrors: true,
  },
})
```

Nuxt 模块会在客户端自动安装并启动监控。`hydration`、`ssr`、`frameworkErrors` 默认开启，按需设为 `false` 即可关闭。在客户端组件中可直接上报业务事件：

```ts
useNuxtApp().$monitor?.report({
  event_type: 'behavior',
  action: 'checkout_started',
  properties: { source: 'cart' },
})
```

`$monitor` 只在客户端提供。水合指标只在 SSR 页面产生；SSR 耗时通过服务端的 `Server-Timing` 响应头传给浏览器，再由客户端上报。

## 上报数据

`url` 是接收监控数据的 HTTP 地址，`appId` 是应用标识，两者是接入时的必填配置。事件先进入页面内队列，默认累计 20 条或约 50 KB 时发送；严重错误会立即冲刷，页面隐藏或退出时也会尝试发送剩余事件。接收端收到的是一个批量事件包，例如：

```json
{
  "app_id": "my-vue-app",
  "projectName": "my-vue-app",
  "sdk_version": "1.0.1",
  "send_time": 1792080000000,
  "sample_rate": 1,
  "events": [
    { "event_type": "behavior", "action": "checkout_started" }
  ]
}
```

示例仅展示主要字段；实际事件还会包含 `event_id`、`timestamp`、页面和设备等公共字段。`sample_rate` 当前记录配置值，不执行随机采样。资源性能事件默认只上报耗时至少 100 ms 的资源，可用 `resourceDurationThreshold: 0` 关闭过滤。

## 在仓库中运行示例

仓库使用 pnpm workspace 和 Turbo。Node.js 要求 `^22.22.3 || ^24.15.0 || >=26.0.0`，pnpm 要求 9.x。

```bash
pnpm install
pnpm dev:vue  # Vue 3 + Vite 示例
pnpm dev:nuxt # Nuxt 4 示例
```

两个示例的 `/api` 请求都会转发到 `http://localhost:8888`。运行交互演示前，需要在该地址提供接收 `/api/v1/monitor` 的服务，或修改示例的代理目标。

| 目录 | 内容 |
| --- | --- |
| [`example/vue`](example/vue) | Vue 3 + Vite 交互演示 |
| [`example/nuxt`](example/nuxt) | Nuxt 4 交互演示，含 SSR 错误页与监控转发接口 |

## 开发与发布

```bash
pnpm build           # 构建所有 packages
pnpm typecheck       # 检查 packages 与示例的类型
pnpm verify:exports  # 校验 package.json 的产物入口
pnpm smoke:core      # core 上报流程冒烟验证
pnpm smoke:report    # 批量上报冒烟验证
pnpm smoke:timing    # Vue 耗时冒烟验证
pnpm smoke:resource  # 资源阈值冒烟验证
pnpm smoke:nuxt      # Nuxt 专属采集冒烟验证
```

发布使用 Changesets：先运行 `pnpm changeset` 记录变更，再运行 `pnpm version-packages` 和 `pnpm install` 更新版本与锁文件；确认发布权限后运行 `pnpm release`。该命令会构建、检查入口并发布未发布的新版本。
