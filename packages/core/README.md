# @weils-monitor/core

浏览器监控的核心运行时：通用采集器、事件规范化、上报器工厂和采集器注册表。Vue/Nuxt 包在此基础上接入框架生命周期；直接使用 core 时需自行选择采集器。

## 安装

```bash
pnpm add @weils-monitor/core
```

## 在浏览器中使用

```ts
import { createMonitorCore, observerFCP, observerEntries } from '@weils-monitor/core'

const monitor = createMonitorCore({
  url: '/api/monitor',
  appId: 'browser-app',
  projectName: 'browser-app',
})

monitor.collectors.start('fcp', observerFCP)
monitor.collectors.start('resources', observerEntries)

monitor.report({
  event_type: 'behavior',
  action: 'search_submitted',
})
```

`start(name, collector)` 对同名采集器只执行一次。默认上报流程会补齐公共字段、`event_id` 与时间戳；事件先入队，达到阈值时批量发送，页面退出时冲刷剩余队列。资源采集默认过滤耗时低于 100 ms 的记录。

## 定制上报流程

`createReporter` 是工厂方法。适配器提供上下文、事件通知与退出钩子；策略负责入队和冲刷；装饰器可在入队前处理事件：

```ts
import {
  browserAdapter,
  batchStrategy,
  createReporter,
  withNormalization,
  withPublication,
  type ReportDecorator,
} from '@weils-monitor/core'

const audit: ReportDecorator = (next) => (event) => {
  console.log('monitor event:', event.event_type)
  next(event)
}

const reporter = createReporter(browserAdapter, batchStrategy, [
  withNormalization(browserAdapter),
  withPublication(browserAdapter),
  audit,
])

reporter.setupExitFlush()
reporter.report({ event_type: 'behavior', action: 'custom_action' })
```

传入自定义装饰器数组会替换默认数组，因此需要显式保留规范化与发布装饰器。`createReporter()` 不传参数时使用浏览器适配器、批量上报策略和这两个默认装饰器。业务使用 Vue/Nuxt 时，优先使用对应框架包的入口。
