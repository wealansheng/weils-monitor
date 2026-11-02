# @weils-monitor/uniapp

uni-app（重点微信小程序 mp-weixin）监控适配。复用 `@weils-monitor/core` 的事件规范化与批量队列，补充小程序端可得的错误、页面、请求、启动性能与内存告警采集。

## 安装

```bash
pnpm add @weils-monitor/uniapp
```

## 最小接入（Vue 3）

```ts
// config/monitor.ts
import { createMonitor } from '@weils-monitor/uniapp'

export const monitor = createMonitor({
  url: 'https://monitor.example.com/api/v1/monitor',
  appId: 'my-uniapp-app',
  projectName: 'my-uniapp-app',
})
```

```js
// main.js
import { createSSRApp } from 'vue'
import App from './App.vue'
import { monitor } from './config/monitor'

export function createApp() {
  const app = createSSRApp(App)
  app.use(monitor) // 安装 Vue 全局错误处理器
  return { app }
}
```

```vue
<!-- App.vue -->
<script>
import { monitor } from './config/monitor'

export default {
  onLaunch() {
    monitor.observer() // 启动全部采集器
  },
}
</script>
```

Vue 2 项目使用 `Vue.use(monitor)` 安装，并在 `App.vue` 的 `onLaunch` 中调用 `monitor.observer()`。

> `url` 必须是绝对 HTTPS 地址，并在微信公众平台加入 request 合法域名。本地联调可在微信开发者工具勾选“不校验合法域名”，并使用明确的 IPv4 地址，例如 `http://127.0.0.1:8888/api/v1/monitor`。
>
> `http://127.0.0.1:8080/api/v1/monitor` 只是 shared 包的默认值；如果配置了 8888 却仍请求 8080，请参考 [常见问题与排障](../../docs/troubleshooting.md#port-8080) 清理旧构建。

## 配置

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `url`、`appId` | 必填 | 上报地址与应用标识；小程序端 `url` 需为绝对地址 |
| `projectName` | `weils-monitor` | 项目名，写入事件与批量包 |
| `debug` | `false` | 打印每条规范化事件及上报成功/失败结果 |
| `batchSize` | `20` | 批量条数阈值 |
| `maxBatchBytes` | `50 * 1024` | 批量包体积上限 |
| `runtimeErrors` | `true` | `wx.onError` / `onUnhandledRejection` / `onPageNotFound` |
| `frameworkErrors` | `true` | 包装 Vue 2 / Vue 3 全局 `errorHandler` |
| `requests` | `true` | 通过 `uni.addInterceptor('request')` 采集请求 |
| `requestDurationThreshold` | `0` | request 事件耗时下限（毫秒） |
| `performance` | `true` | `wx.getPerformance` 启动/渲染指标 + `mp_launch` |
| `routeChange` | `true` | 路由切换 `route_change` |
| `pageView` | `true` | 自动页面访问 `page_view`（初始 + 路由成功）；关闭后仍可显式调用 `trackPageView()` |
| `memoryWarning` | `true` | `wx.onMemoryWarning` 内存告警 |
| `runtime` | 自动解析 | 测试/宿主注入 `uni`、`wx`、`getCurrentPages` |

`replay` 保留配置位但小程序端不会录制：开启时只告警一次，接口保持在 `monitor.replay` 上以兼容共享配置代码。

## 运行时与 uni 注入

小程序 app service 不会把 `uni` 挂到 `globalThis`。本包产物保留裸 `uni` / `wx` 标识符，由 uni-app 的 Vite 注入插件替换为真实运行时（mp-weixin 编译为 `@dcloudio/uni-mp-weixin` 的 uni 对象）。因此：

- 正常接入无需传 `runtime`，也不要把 SDK 改成依赖 `globalThis.uni`；
- 注入不可用时，会用 `wx` 组成最小运行时，保证错误、上下文和 `uni.request` 上报仍能工作，但路由/请求拦截不可用；
- `runtime` 仅用于测试或非标准宿主注入 `uni`、`wx`、`getCurrentPages`；
- `config` 与队列由 [`@weils-monitor/shared`](../shared/README.md) 的 `globalThis` 单例共享，多份 shared 副本不会各持一个 8080 默认配置。

## 采集内容

| 来源 | 上报 |
| --- | --- |
| `wx.onError` | `error` / `js_error` |
| `wx.onUnhandledRejection` | `error` / `promise_error` |
| `wx.onPageNotFound` | `error` / `page_not_found` |
| Vue `errorHandler` | `error` / `framework_error` |
| `uni` 路由 API | `behavior` / `route_change`、`page_view` |
| `uni.request` | `request`（跳过 SDK 自身端点） |
| `wx.getPerformance` | `performance` / `mp_navigation`、`mp_render`、`mp_script`、`mp_load_package` |
| 首路由就绪 | `performance` / `mp_launch` |
| `wx.onMemoryWarning` | `stability` / `memory_warning` |

公共字段来自 `uni.getSystemInfoSync()`、当前页面栈和启动参数：`device`、`browser`（WeChat）、`os`、`network`、`locale`、`screen`、`viewport`、`page_url`、`route`、`referrer`。小程序没有域名，`page_url` 为应用内路径（如 `/pages/index/index?tab=1`），query 中的敏感参数会被移除。

每次上报都会根据实时页面栈校准页面归属，页面变化时更新 `referrer`，同页重复上报保持来源不变。页面栈暂时为空时保留最近页面，仅首次无页面信息时回退启动参数。普通事件（包括请求完成事件）按上报时所在页面归属；导航事件显式记录源页面和目标页面。未经过路由拦截器的跳转会在后续事件中校准归属，但 PV 仍需手动补报。`page_not_found` 的 `extra.query` 也会按相同敏感键规则过滤，且不修改原始参数对象。

### 错误类型

| 触发方式 | 上报类型 |
| --- | --- |
| `@click` / Vue 生命周期中 `throw` | `framework_error`（Vue 全局 `errorHandler`） |
| `setTimeout(() => { throw ... })`、非 Vue 模块抛错 | `js_error`（`wx.onError`） |
| 未处理的 `Promise.reject` | `promise_error`（`wx.onUnhandledRejection`） |
| 打开不存在的页面 | `page_not_found`（`wx.onPageNotFound`） |

Vue 事件处理器里的异常会走 Vue，因此是 `framework_error` 而不是 `js_error`。示例同时提供两种按钮用于区分。

## 按需启动与手动埋点

```ts
const { error, behavior, performance, stability } = monitor

error.error()
behavior.pageChange()
behavior.pv()
performance.observeLaunch()
performance.observeRequest()
stability.observeMemoryWarning()
```

```ts
// 行为事件
monitor.behavior.track('checkout_started', { source: 'cart' })
monitor.behavior.trackClick('buy_clicked', { tag: 'button', text: '购买' })

// 点击后执行原逻辑
const onBuy = monitor.behavior.wrapClick('buy_clicked', () => submitOrder())

// <navigator>、系统返回、自定义路由等拦截不到时手动补报
monitor.behavior.trackPageView()
```

每条规范化事件都会通过 `uni.$emit('weils-monitor:report', data)` 发布，便于本地调试（uni 注入不可用的兜底模式下只保留 `debug` 日志）：

```ts
import { REPORT_EVENT } from '@weils-monitor/uniapp'

uni.$on(REPORT_EVENT, (event) => console.log('[monitor]', event))
```

开启 `debug: true` 后还会看到：

```text
[weils-monitor] { event_type: 'behavior', action: 'page_view', ... }   // 规范化完成
[weils-monitor] report 200 1                                           // 发送成功
[weils-monitor] report failed <url> { errMsg: ... }                    // 发送失败
```

如果只有 `[weils-monitor] { ... }` 没有 `report`，问题通常在地址、域名或接收端；如果连 `[weils-monitor]` 都没有，先确认 `onLaunch` 里调用了 `monitor.observer()`。完整排障见 [常见问题与排障](../../docs/troubleshooting.md)。

## 上报机制

事件先进入页面内队列，累计 `batchSize` 条、约 `maxBatchBytes` 体积、出现严重错误或小程序进入后台（`onAppHide`）时，通过 `uni.request` 以 JSON 批量包发送：

```json
{
  "app_id": "my-uniapp-app",
  "projectName": "my-uniapp-app",
  "sdk_version": "1.0.1",
  "send_time": 1792080000000,
  "sample_rate": 1,
  "events": [{ "event_type": "behavior", "action": "checkout_started" }]
}
```

发送失败的事件会放回队首等待下一次冲刷。SDK 自身的上报请求不会被 request 采集器再次采集；如果要在示例中演示 `request` 事件，`demoRequestUrl` 不能和监控 `url` 相同（示例使用后端健康检查 `GET /`）。

## 已知限制

- 没有 DOM：不支持全局点击捕获、空白屏检测、资源时序、FCP/LCP/CLS/INP/TTFB/长任务和 Replay。
- 路由只覆盖 `uni.navigateTo / redirectTo / reLaunch / switchTab / navigateBack`；`<navigator>`、系统返回手势、部分第三方路由库可能漏采，可用 `trackPageView()` 补报。
- 请求只覆盖经 `uni.request` 且 `uni.addInterceptor` 可用的调用；不采集请求/响应体。
- `wx.onAppHide` 后的异步请求可能被系统中断，退出冲刷是尽力而为。
- 小程序没有 `TextEncoder` 时会用纯 JS 计算字节数；`crypto.randomUUID` 缺失时使用随机 UUID 回退。
- H5、app-plus 仅保证基础能力；H5 建议继续使用 `@weils-monitor/vue`。
- 建议同一小程序只创建一个 monitor 实例。
- 遇到未上报、8080、IPv6 后端等问题时，优先查看 [常见问题与排障](../../docs/troubleshooting.md)。

## 示例与验证

```bash
pnpm build
pnpm smoke:uniapp
```

完整示例见 [`example/uniapp`](../../example/uniapp)，平台说明与验收步骤见 [`docs/uniapp.md`](../../docs/uniapp.md)。
