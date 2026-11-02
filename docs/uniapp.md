# uni-app / 微信小程序监控

`@weils-monitor/uniapp` 面向 uni-app 的微信小程序（mp-weixin）运行时，复用仓库的事件协议、规范化、批量队列与退出冲刷；浏览器专属采集（DOM 点击、Core Web Vitals、空白屏、rrweb 回放）在小程序端不适用。

接入与排障入口：[文档索引](README.md) · [常见问题与排障](troubleshooting.md)

## 运行前提

- uni-app 项目（Vue 2.7 或 Vue 3 均可），页面通过 `uni.*` API 导航和请求。
- 微信小程序基础库建议 ≥ 2.11.0（`wx.getPerformance` 从该版本提供；低版本自动退化为 `mp_launch`）。
- 上报地址为绝对 HTTPS 地址，并加入微信公众平台的 request 合法域名；开发工具可临时关闭域名校验。
- 本地联调使用 `http://127.0.0.1:8888/api/v1/monitor` 时，`monitor-backend` 的 `HOST` 应为 `0.0.0.0`，否则 Windows 上可能只监听 IPv6 `::1`，小程序访问 IPv4 会失败。

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

`pageView: false` 只关闭初始与导航成功后的自动 PV，不影响显式调用 `monitor.behavior.trackPageView()`。`routeChange` 与 `pageView` 独立生效，手动和自动 PV 在同一 runtime 内共享一秒去重。

## 运行时与配置

- **uni 注入**：小程序 app service 不暴露 `globalThis.uni`。SDK 产物保留裸 `uni` / `wx` 标识符，由 uni-app 的 Vite 注入插件替换为真实运行时；无需在业务代码里传 `runtime`。
- **wx 兜底**：注入缺失时，SDK 会用 `wx` 组成最小运行时，保证错误、上下文和 `uni.request` 上报仍能工作；但 `uni.addInterceptor` 依赖真实 uni，路由/请求拦截不可用。
- **共享配置**：`config` 与上报队列由 `@weils-monitor/shared` 的 `globalThis` 单例持有。即使 pnpm/uni-app 把 shared 打包成多份，`setConfig` 与发送逻辑也读取同一个对象。
- **8080 默认值**：`http://127.0.0.1:8080/api/v1/monitor` 只是没有配置 `url` 时的默认值。已配置 8888 却请求 8080，通常是旧构建或旧 shared 副本，处理方式见 [常见问题与排障](troubleshooting.md#port-8080)。
- **调试开关**：`debug: true` 会打印规范化事件和上报成功/失败结果。

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

每条事件上报时都会校准实时页面栈，并在页面变化时记录上一页面为 `referrer`；同页重复读取不改变来源。页面栈暂时为空时保留最近页面，仅首次无已知页面时回退启动参数。普通事件按上报时页面归属；导航成功事件显式记录目标页，失败事件保留源页面字段。此校准不自动补报 `<navigator>` 或系统返回的 PV。

`onPageNotFound` 的 `extra.query` 与 URL query 共用敏感键过滤规则，删除敏感字段，保留普通字段，且不修改宿主传入的对象。

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

`createMonitor({ debug: true })` 会额外打印：

```text
[weils-monitor] { event_type: 'behavior', action: 'page_view', ... }   // 规范化完成
[weils-monitor] report 200 1                                           // 发送成功
[weils-monitor] report failed <url> { errMsg: ... }                    // 发送失败
```

微信开发者工具 Network 中，批量包为 `POST {url}`，请求体是 `{ app_id, projectName, sdk_version, send_time, sample_rate, events }`；SDK 自身的上报请求不会出现在 `request` 事件里。

判断顺序：

1. 有 `[weils-monitor] { ... }`：采集和规范化正常，继续看发送；
2. 有 `report ...`：发送链路正常，检查后端入库/ClickHouse；
3. 只有事件、没有 `report`：检查地址、域名、接收端监听（IPv4/IPv6）；
4. 连 `[weils-monitor]` 都没有：检查 `onLaunch` 是否调用 `observer()`、是否运行了旧构建。

更多症状见 [常见问题与排障](troubleshooting.md)。

## 自动化冒烟

```bash
pnpm build
pnpm smoke:uniapp
```

冒烟脚本注入 fake `uni`/`wx`，覆盖：上下文与脱敏、JS/Promise/页面不存在/Vue 2 与 Vue 3 框架错误、路由成功/失败/去重、请求成功/失败/阈值/自端点跳过、性能指标与 `mp_launch` 回退、内存告警、`onAppHide` 批量信封、发送失败重排、缺失 `TextEncoder` 回退，以及产物保留裸 `uni`/`wx` 供 uni-app 注入、不包含 `rrweb`/`@weils-monitor/replay`。

`pnpm smoke:core` 额外验证多份 shared 副本共享同一 `config`/队列，避免再次出现“配置 8888、请求 8080”。

四处采集修复的回归还覆盖 EntryList/数组性能回调与异常返回、敏感 query 对象、PV 开关四种组合、手动补报、实时页面归属、导航成功回调与页面栈更新的先后时序、多级返回、空栈缓存，以及不同 runtime 的状态隔离。

### 本次修复验证记录（2026-11-02）

- 自动化：uniapp 及依赖构建、uniapp/core 类型检查、`pnpm smoke:uniapp`、`pnpm smoke:core` 均通过。
- 宿主验收：未执行；本次执行环境未检测到运行中的微信开发者工具。仍需在宿主中验证真实 EntryList 回调、导航返回和敏感 query，不能以模拟测试代替该结果。

## 微信开发者工具验收清单

1. 本地联调：`monitor-backend` 设置 `HOST=0.0.0.0` 并启动；示例 `url` 使用 `http://127.0.0.1:8888/api/v1/monitor`，`debug: true`；微信开发者工具勾选“不校验合法域名”。真机/生产改为绝对 HTTPS 地址并配置合法域名。
2. 进入首页：Console/Network 出现初始 `page_view`，`page_url`/`route`/`referrer` 正确；`debug` 输出 `report 200`。
3. 点击“navigateTo 跳转详情页”再返回：分别出现 `route_change` 与 `page_view`，`duration` 有值。
4. 点击请求按钮：出现 `request` 事件；按钮请求的是后端健康检查 `GET /`，不能使用监控上报端点。Network 中查看 SDK 批量 POST 不含该请求的自身采集。
5. 点击“触发 Vue 事件错误”：出现 `framework_error`（Vue 事件处理器里的异常由 Vue 全局 `errorHandler` 捕获）；点击“触发全局 JS 错误”：出现 `js_error`（脱离 Vue 错误链，由 `wx.onError` 捕获）；点击“触发 Promise 错误”：出现 `promise_error`。错误详情包含 `stack_frames`。
6. 触发 Vue 组件/渲染错误：同样出现 `framework_error`，且应用原有 `errorHandler` 仍被调用。
7. 切后台再回前台：Network 出现一次批量 POST；请求体信封字段完整。
8. 控制台出现一次 Replay 不支持提示，页面无异常。
9. 使用 `<navigator>` 或系统返回后调用 `monitor.behavior.trackPageView()`，确认可手动补报页面访问。
10. 验证 ClickHouse/工作台：`GET /api/v1/dashboard/overview?app_id=...` 或工作台能看到对应应用事件。
11. 确认真正的性能回调通过 `entryList.getEntries()` 产生 `mp_render` 等事件；关闭 `performance` 后不产生性能事件。
12. 设置 `pageView: false`：进入页面和导航不自动上报 PV，显式调用 `trackPageView()` 仍可补报；单独关闭 `routeChange` 不影响自动 PV。
13. 使用系统返回或 `<navigator>` 切换页面后触发行为、请求或错误：确认公共页面字段已更新，`referrer` 是上一页面，同页重复事件不改变来源。
14. 打开带 `token/password/phone` 和普通 `tab` 参数的不存在页面：确认接收到的 `extra.query` 只保留普通参数。
