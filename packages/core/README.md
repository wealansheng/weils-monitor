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

## 无浏览器运行时的子入口

`@weils-monitor/core/reporter` 只包含上报原语（`createReporter`、适配器/策略类型、规范化/发布装饰器、`createCollectorRegistry`、`normalizeReportData`、`sanitizeQueryString` 等），不会加载 Replay 与 rrweb，也不访问 DOM 全局对象。小程序等非浏览器宿主可基于它接入自己的上下文适配器和批量传输：

```ts
import { createReporter, createCollectorRegistry } from '@weils-monitor/core/reporter'
import { createReportStrategy } from '@weils-monitor/utils'

const strategy = createReportStrategy((batch) => sendByMyRuntime(batch))
const reporter = createReporter(myAdapter, strategy)
```

`error-stack-parser` 及其 CJS 依赖 `stackframe` 已内联进 core 产物，非浏览器宿主不需要再解析 `require('stackframe')`；Vue/Nuxt/uni-app 包都受益于这一点。

`@weils-monitor/uniapp` 即使用该入口实现 mp-weixin 适配。`config` 与队列由 `@weils-monitor/shared` 的 `globalThis` 单例共享，详见 [shared 文档](../shared/README.md)。

## Replay 生命周期

`createMonitorCore({ url, appId, replay: { enabled: true, url: '/api/v1/records' } })` 返回的 `replay` 与 Vue/Nuxt 使用同一控制器。默认关闭；开启时创建同步错误订阅，再异步导入录制包，因此懒加载期间的受支持错误也会排队处理。直接使用 core 时仍需启动错误采集器或通过 `monitor.report()` 上报错误。

core 同时导出 `addReplayHandler(attribute)`，与 `click()` 配合上报行为并触发录制；Vue 的 `monitor.addReplayHandler()` 包装此入口并返回实例。`replay.onMounted` 默认 `false`，退出保留至同应用、同用户新触发；`true` 时退出 Beacon 上传并在下次打开补传。详见 [Replay 配置](../replay/README.md)。

录制只订阅规范化后的 `weils-monitor:report` 错误，关联其真实 UUID；使用自定义适配器或移除发布装饰器时，若不派发此浏览器事件，就不会自动触发录制。未提供 `sessionId` 时，启用 Replay 会生成标签页会话 ID 并复用于普通事件。

SDK 自身的普通事件上报和录制上传地址会被 `isMonitorRequest()` 排除，避免把上传请求再次作为资源监控数据采集。停止采集器注册表不会停止录制，需要单独调用 `monitor.replay.stop()` 或 `destroy()`。接口、触发类型与可靠性边界见 [Replay 文档](../replay/README.md)。
