# 微信小程序监控演示（uni-app）

演示 `@weils-monitor/uniapp` 在微信小程序（mp-weixin）中的接入：页面访问、路由切换、`uni.request`、JS / Promise / Vue 错误、启动与渲染指标、内存告警和手动埋点。

## 运行

1. 在仓库根目录执行 `pnpm install`，让示例链接到 workspace 中的 `@weils-monitor/uniapp`。
2. 修改 [`config/monitor.ts`](config/monitor.ts)：
   - `url` 默认为本机后端 `http://127.0.0.1:8888/api/v1/monitor`；生产环境改为绝对 HTTPS 地址；
   - `appId`、`projectName` 改为自己的应用标识；
   - `demoRequestUrl` 默认为后端健康检查 `GET /`，用于演示 `request` 事件（不能和监控上报端点相同，否则会被跳过）。
3. 用 HBuilderX 打开 `example/uniapp`，运行到「微信开发者工具 → 小程序」。
4. 在微信公众平台把 `url` 的域名加入 request 合法域名；本地联调可在开发者工具中勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
5. 触发页面按钮后，在开发者工具 Console 查看：
   ```text
   [weils-monitor] { event_type: 'behavior', action: 'page_view', ... }
   [weils-monitor] report 200 1
   [monitor] behavior page_view ...
   ```
   Network 查看 `POST {url}` 的批量事件包；错误事件会立即发送，普通事件受 `batchSize` 控制。

> `http://127.0.0.1:8080/api/v1/monitor` 只是 `@weils-monitor/shared` 里的 SDK 默认值，示例显式配置了 8888，不会使用 8080。若仍看到 8080，说明小程序还在运行旧构建：删除 `unpackage/dist/dev/mp-weixin`，HBuilderX 重新运行，并在微信开发者工具「清缓存 → 全部清除」后重新编译。
>
> 若本机后端只监听 IPv6（`::1`），请把 `monitor-backend` 的 `HOST` 改为 `0.0.0.0` 后重启，否则小程序访问 `127.0.0.1:8888` 会连接失败。ClickHouse 默认 8123，可用 `curl.exe http://127.0.0.1:8123/ping` 检查。

详细排障见 [`docs/troubleshooting.md`](../../docs/troubleshooting.md)。

## 演示内容

| 按钮 / 操作 | 产生的事件 |
| --- | --- |
| 进入首页、跳转详情页、返回 | `behavior` / `page_view`、`route_change` |
| 手动行为埋点 | `behavior` / `example_click`，带 `properties` |
| 发起 `uni.request` | `request`（自动跳过 SDK 自身上报端点） |
| 触发 Vue 事件错误 | `error` / `framework_error`（Vue 全局 `errorHandler` 捕获，含 `component`、`component_stack`） |
| 触发全局 JS 错误 | `error` / `js_error`（脱离 Vue 错误链，由 `wx.onError` 捕获，含 `stack_frames`） |
| 触发 Promise 错误 | `error` / `promise_error`（`wx.onUnhandledRejection`） |
| 小程序内存告警 | `stability` / `memory_warning` |
| 启动/渲染 | `performance` / `mp_launch`、`mp_navigation` 等 |

## 说明

- 小程序没有 DOM，`Replay`、全局点击捕获、空白屏检测、FCP/LCP/CLS 等浏览器指标不可用；H5 端请使用 `@weils-monitor/vue`。
- `@click` 中的异常是 `framework_error`，`setTimeout`/非 Vue 模块中的异常才是 `js_error`；示例分别提供了两个按钮。
- 使用 `<navigator>` 组件、系统返回手势或自定义路由库时，路由事件可能无法自动捕获，可调用 `monitor.behavior.trackPageView()` 手动补报。
- 项目由 HBuilderX 编译，仓库内不提供 mp-weixin 的自动化构建脚本。修改 SDK 或 shared 后需重新构建依赖包并重新运行示例。
- 更多问题见 [`docs/troubleshooting.md`](../../docs/troubleshooting.md)。
