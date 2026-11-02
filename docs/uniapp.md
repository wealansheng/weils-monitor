# uni-app / 微信小程序监控

`@weils-monitor/uniapp` 面向 uni-app 的微信小程序（mp-weixin）运行时，复用仓库的事件协议、规范化、批量队列与退出冲刷；浏览器专属采集（DOM 点击、Core Web Vitals、空白屏、rrweb 回放）在小程序端不适用。

## 运行前提

- uni-app 项目（Vue 2.7 或 Vue 3 均可），页面通过 `uni.*` API 导航和请求。
- 微信小程序基础库建议 ≥ 2.11.0（`wx.getPerformance` 从该版本提供；低版本自动退化为 `mp_launch`）。
- 上报地址为绝对 HTTPS 地址，并加入微信公众平台的 request 合法域名；开发工具可临时关闭域名校验。

## 接入

```ts
// config/monitor.ts
import { createMonitor } from '@weils-monitor/uniapp'

export const monitor = createMonitor({
  url: 'https://monitor.example.com/api/v1/monitor',
  appId: 'my-uniapp-app',
  projectName: 'my-uniapp-app',
})
```

Vue 3：`main.js` 中 `createSSRApp(App)` 后 `app.use(monitor)`；在 `App.vue` 的 `onLaunch` 调用 `monitor.observer()`。
Vue 2：`Vue.use(monitor)`；同样在 `onLaunch` 调用 `monitor.observer()`。

`app.use(monitor)` 只安装 Vue 错误处理器，不启动采集；`observer()` 才按开关启动各项采集器，同一实例重复调用不会重复监听。

## 数据流

```text
采集器 → monitor.report
       → normalize：补公共字段（设备/页面/网络/会话）、event_id、timestamp
       → uni.$emit('weils-monitor:report', data)（本地调试）
       → 队列（batchSize / maxBatchBytes）
       → uni.request POST serializeReportData 信封
       → 失败时 prependCache 等待下一次冲刷
```

退出冲刷注册在 `wx.onAppHide`（回退 `uni.onAppHide`）。小程序没有 `sendBeacon`，后台网络可能被系统中断，退出时的事件属于尽力发送。

## 事件映射

| 采集源 | `event_type` | 关键字段 |
| --- | --- | --- |
| `wx.onError` | `error` | `error_type: js_error`、`message`、`name`、`stack`、`stack_frames` |
| `wx.onUnhandledRejection` | `error` | `error_type: promise_error`、`reason`、`stack` |
| `wx.onPageNotFound` | `error` | `error_type: page_not_found`、`url`、`route`、`tags`、`extra` |
| Vue 全局 `errorHandler` | `error` | `error_type: framework_error`、`component`、`component_stack` |
| `uni.navigateTo/redirectTo/reLaunch/switchTab/navigateBack` | `behavior` | `action: route_change`、`from_route`、`to_route`、`duration`；成功后追加 `action: page_view` |
| 初始/手动页面访问 | `behavior` | `action: page_view`、`page_url`、`route`、`referrer` |
| `uni.request` | `request` | `url`、`method`、`status_code`、`duration`、`success` |
| `wx.getPerformance` | `performance` | `mp_navigation`、`mp_render`、`mp_script`、`mp_load_package`；前两者带 `rating` |
| 首路由就绪 | `performance` | `mp_launch`（SDK 初始化到首路由出现的耗时） |
| `wx.onMemoryWarning` | `stability` | `issue_type: memory_warning` |

公共字段：`app_id`、`projectName`、`release`、`environment`、`user_id`、`session_id`（每次小程序进程启动生成，可用 `sessionId` 覆盖）、`trace_id`、`sdk_version`、`page_url`、`route`、`referrer`、`device`、`browser`（WeChat）、`os`、`network`、`locale`、`screen`、`viewport`。小程序没有域名，`page_url` 为应用内路径；query 中的 `token/password/session/...` 等敏感参数会被移除。

## 限制与替代方案

| 不可用能力 | 原因 | 替代 |
| --- | --- | --- |
| 全局点击/曝光 | 无 DOM、无全局事件 | `behavior.trackClick` / `behavior.wrapClick` / 页面内 `track` |
| 空白屏检测 | 依赖 `document` 与选择器 | 业务侧手动上报 stability 事件 |
| 资源时序、FCP/LCP/CLS/INP/TTFB/长任务 | 小程序不提供对应 PerformanceObserver | 使用 `mp_navigation` / `mp_render` / `mp_launch` |
| Replay（rrweb） | 依赖 DOM/浏览器存储 | 仅 H5 使用 `@weils-monitor/vue` |
| 自动路由全量覆盖 | 只拦截 `uni.*` 路由 API | `<navigator>`、系统返回后调用 `trackPageView()` |
| 请求体/响应体 | 隐私与体积 | 默认不采集 |
| `sendBeacon` 同步冲刷 | 小程序无该 API | 切换后台时 `uni.request` 尽力发送 |

H5 与 app-plus 可复用本包的基础上下文/请求/路由能力，但完整浏览器指标仍应使用 `@weils-monitor/vue`；本包不把 H5/app-plus 作为验收目标。

## 调试

```ts
import { REPORT_EVENT } from '@weils-monitor/uniapp'

uni.$on(REPORT_EVENT, (event) => console.log('[monitor]', event))
```

`createMonitor({ debug: true })` 会额外打印每条规范化事件。微信开发者工具 Network 中，批量包为 `POST {url}`，请求体是 `{ app_id, projectName, sdk_version, send_time, sample_rate, events }`；SDK 自身的上报请求不会出现在 `request` 事件里。

## 自动化冒烟

```bash
pnpm build
pnpm smoke:uniapp
```

冒烟脚本注入 fake `uni`/`wx`，覆盖：上下文与脱敏、JS/Promise/页面不存在/Vue 2 与 Vue 3 框架错误、路由成功/失败/去重、请求成功/失败/阈值/自端点跳过、性能指标与 `mp_launch` 回退、内存告警、`onAppHide` 批量信封、发送失败重排、缺失 `TextEncoder` 回退，以及产物不包含 `rrweb`/`@weils-monitor/replay`。

## 微信开发者工具验收清单

1. 配置绝对 HTTPS `url`，关闭“不校验合法域名”（或把域名加入白名单），运行 `example/uniapp`。
2. 进入首页：Console/Network 出现初始 `page_view`，`page_url`/`route`/`referrer` 正确。
3. 点击“navigateTo 跳转详情页”再返回：分别出现 `route_change` 与 `page_view`，`duration` 有值。
4. 点击请求按钮：出现 `request` 事件；Network 中查看 SDK 批量 POST 不含该请求的自身采集。
5. 触发 JS 错误与 Promise 错误：出现 `js_error`、`promise_error`，错误详情包含 `stack_frames`。
6. 触发 Vue 组件错误：出现 `framework_error`，且应用原有 `errorHandler` 仍被调用。
7. 切后台再回前台：Network 出现一次批量 POST；请求体信封字段完整。
8. 控制台出现一次 Replay 不支持提示，页面无异常。
9. 使用 `<navigator>` 或系统返回后调用 `monitor.behavior.trackPageView()`，确认可手动补报页面访问。
