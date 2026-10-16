# @weils-monitor/shared

监控事件的公共 TypeScript 类型、默认配置、版本常量和内存队列。这个包是 core、Vue、Nuxt 与 utils 的基础依赖；它本身不启动采集或发送网络请求。

## 安装

```bash
pnpm add @weils-monitor/shared
```

## 定义符合上报协议的事件

```ts
import type { InitOptions, QueueReportData } from '@weils-monitor/shared'

const options: InitOptions = {
  url: '/api/monitor',
  appId: 'my-app',
  resourceDurationThreshold: 100,
}

const event: QueueReportData = {
  event_type: 'behavior',
  action: 'checkout_started',
  properties: { cartSize: 2 },
}
```

`InitOptions` 中的 `url` 和 `appId` 必填。事件类型包括 `performance`、`request`、`resource`、`error`、`stability` 和 `behavior`；具体字段由 `QueueReportData` 的联合类型约束。`event_id`、`timestamp` 及浏览器公共字段可交由 core 上报器自动补齐。

## 读取共享常量

```ts
import { VERSION, config } from '@weils-monitor/shared'

console.log(VERSION, config.batchSize, config.resourceDurationThreshold)
```

`config` 是当前页面进程中的可变共享对象。业务配置建议通过 [`@weils-monitor/vue`](../vue/README.md) 的 `createMonitor`、[`@weils-monitor/nuxt`](../nuxt/README.md) 的 `nuxtMonitor`，或 [`@weils-monitor/utils`](../utils/README.md) 的 `setConfig` 设置。
