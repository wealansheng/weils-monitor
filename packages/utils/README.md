# @weils-monitor/utils

监控 SDK 的配置、批量发送与评分工具。通常由 core、Vue、Nuxt 间接使用；只有需要手动管理队列或复用评分函数时才需要直接导入。

## 安装

```bash
pnpm add @weils-monitor/utils
```

## 设置配置并发送事件

```ts
import { lazyReportBatch, flushReportQueue, setConfig } from '@weils-monitor/utils'

setConfig({
  url: '/api/monitor',
  appId: 'my-app',
  projectName: 'my-app',
  batchSize: 20,
})

await lazyReportBatch({
  event_type: 'behavior',
  action: 'checkout_started',
})

// 需要立刻发送不足一个批次的事件时：
await flushReportQueue({ includePartial: true })
```

`lazyReportBatch` 是低层队列入口，不会自动补齐 `event_id`、时间戳和浏览器公共字段。需要这些字段时请使用 [`@weils-monitor/core`](../core/README.md) 的 `report` / `createMonitorCore`，或框架包的 `monitor.report()`。发送失败的批次会放回队首等待下一次冲刷。

## 性能评分

```ts
import { getINPRating, getTTFBRating, getHydrationRating } from '@weils-monitor/utils'

getINPRating(180)       // 'good'，单位 ms
getTTFBRating(1200)     // 'needs-improvement'
getHydrationRating(550) // 'poor'
```

`flushReportQueue` 支持 `transport: 'auto' | 'ajax' | 'image' | 'beacon'`；默认 `auto` 使用 AJAX。`beacon` 适合页面退出时冲刷。批量包中 `sample_rate` 目前仅记录配置值，不执行随机采样。
