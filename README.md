# weils-monitor

面向 Vue 3、Nuxt 3 和 Nuxt 4 的前端监控 SDK。它采集浏览器性能、错误、用户行为和页面稳定性事件，通过共享队列批量发送；Vue 适配层补充组件与路由指标，Nuxt 适配层补充水合、SSR 和框架错误指标。

## 选择接入方式

| 包 | 用途 | 文档 |
| --- | --- | --- |
| `@weils-monitor/vue` | Vue 3 应用的主要入口 | [Vue 使用示例](packages/vue/README.md) |
| `@weils-monitor/nuxt` | Nuxt 3 / 4 模块，自动接入 Vue 监控 | [Nuxt 使用示例](packages/nuxt/README.md) |
| `@weils-monitor/core` | 通用浏览器采集器、上报器工厂与采集注册表 | [core 使用示例](packages/core/README.md) |
| `@weils-monitor/replay` | 错误前后录制、IndexedDB 持久化与独立回放入口 | [操作回放](packages/replay/README.md) |
| `@weils-monitor/shared` | 事件类型、默认配置与常量 | [shared 使用示例](packages/shared/README.md) |
| `@weils-monitor/utils` | 配置、队列发送与性能评分工具 | [utils 使用示例](packages/utils/README.md) |

应用接入通常只需安装 Vue 或 Nuxt 包。core、shared 和 utils 供需要自定义采集或底层上报流程的场景使用。

## 三个项目如何配合

| 项目 | 职责 | 本地入口 |
| --- | --- | --- |
| 本仓库 `weils-monitor` | 在业务页面采集事件；开启 Replay 后录制并上传错误片段 | `pnpm dev:vue` / `pnpm dev:nuxt` |
| [`monitor-backend`](../monitor-backend/README.md) | 接收事件和录制分片，写入 ClickHouse，提供管理查询 | `http://localhost:8888` |
| [`monitor-frontend`](../monitor-frontend/README.md) | 查询事件、还原源码、播放错误关联录制 | `http://localhost:8866` |

普通事件写入三张事件表；录制分片独立写入 `event_record`。管理工作台使用 `MONITOR_DASHBOARD_TOKEN` 查询，业务 SDK 不携带该令牌。完整联调步骤见 [Replay 接入与排障](docs/replay.md)。

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

## 错误录制与上传

业务 SDK 的 Replay 默认关闭。需要录制时在 `createMonitor` 或 `nuxtMonitor` 中显式配置：

```ts
replay: {
  enabled: true,
  url: '/api/v1/records',
  sampleRate: 1,
  beforeErrorMs: 30_000,
  afterErrorMs: 10_000,
}
```

开启后异步启动录制；Vue 仍需调用 `monitor.observer()` 启动普通采集，Nuxt 模块会自动启动。仅已上报的 JS、Promise、Vue 和受支持的 Nuxt 客户端错误会触发片段上传。录制与普通事件使用不同接口及队列；`replay.sampleRate` 按会话实际采样。SDK 默认窗口为错误前 30 秒、后 10 秒；本仓库两个示例默认开启并缩短为前 10 秒、后 5 秒，示例只录制和上传，播放由管理工作台完成。

## 在仓库中运行示例

仓库使用 pnpm workspace 和 Turbo。Node.js 要求 `^22.22.3 || ^24.15.0 || >=26.0.0`，pnpm 要求 9.x。

```bash
pnpm install
pnpm dev:vue  # Vue 3 + Vite 示例
pnpm dev:nuxt # Nuxt 4 示例
```

两个示例的 `/api` 请求都会转发到 `http://localhost:8888`。运行交互演示前，需要在该地址提供接收 `/api/v1/monitor` 的服务，或修改示例的代理目标。

两个示例均默认开启 Replay 错误录制与上传：触发页面已有的错误按钮，约 5 秒后片段将上传到 `http://localhost:8888/api/v1/records`。启动方式与接收回执要求见 [Vue 示例说明](example/vue/README.md) 和 [Nuxt 示例说明](example/nuxt/README.md)。

| 目录 | 内容 |
| --- | --- |
| [`example/vue`](example/vue) | Vue 3 + Vite 交互演示 |
| [`example/nuxt`](example/nuxt) | Nuxt 4 交互演示，含 SSR 错误页与监控转发接口 |

## 开发与发布

生产错误的 Source Map 私有上传与查询流程见 [Source Map 定位指南](docs/source-map.md)。

错误事件会携带 `error-stack-parser` 解析的完整 `stack_frames` 和原始 `stack`，顶层 `filename/lineno/colno` 表示构建文件位置。生产接入须配置应用 `release`，与上传 map 时的版本一致。后端使用 `@jridgewell/trace-mapping` 读取私有 `mapdata`，工作台错误详情支持按调用帧查看源码及上下文；浏览器不需要访问 map 文件。

```bash
pnpm build           # 构建所有 packages
pnpm typecheck       # 检查声明了 typecheck 任务的包与 Nuxt 示例
pnpm verify:exports  # 校验 package.json 的产物入口
pnpm smoke:core      # core 上报流程冒烟验证
pnpm smoke:report    # 批量上报冒烟验证
pnpm smoke:timing    # Vue 耗时冒烟验证
pnpm smoke:resource  # 资源阈值冒烟验证
pnpm smoke:nuxt      # Nuxt 专属采集冒烟验证
pnpm --filter @weils-monitor/replay test      # 录制、编码、存储与播放校验
pnpm --filter @weils-monitor/replay test:e2e  # 需先安装 Playwright Chromium
```

发布使用 Changesets：先运行 `pnpm changeset` 记录变更，再运行 `pnpm version-packages` 和 `pnpm install` 更新版本与锁文件；确认发布权限后运行 `pnpm release`。该命令会构建、检查入口并发布未发布的新版本。

各包 `CHANGELOG.md` 保留已发布版本历史；尚未发布的变更记录在 `.changeset/`，由版本命令生成正式日志。
