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

## Replay 公共类型

本包还导出 `ReplayOptions`、`ReplayStatus`、`ReplayController`、`RecordError`、`RecordMetadata`、`RecordChunk`。`InitOptions.replay` 接受 `ReplayOptions`；通用 SDK 默认关闭，框架实例通过 core 创建控制器。

录制协议使用 `protocol_version: 1`、`encoding: 'gzip-base64'`，每片是 `RecordMetadata` 加 `chunk_index`、`chunk_checksum`、`payload`。`errors` 保存错误 UUID 和时间；Replay 元信息使用 `project_name`，普通事件配置仍可用 `projectName`。录制不是 `QueueReportData` 的第七类事件，必须走独立 `/api/v1/records` 接口。

顶层 `sampleRate` 只写入普通事件信封；`replay.sampleRate` 决定是否录制该会话。字段定义见 [`src/replay.ts`](src/replay.ts)，运行行为见 [Replay 文档](../replay/README.md)。
