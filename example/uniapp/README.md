# 微信小程序监控演示（uni-app）

演示 `@weils-monitor/uniapp` 在微信小程序（mp-weixin）中的接入：页面访问、路由切换、`uni.request`、JS / Promise / Vue 错误、启动与渲染指标、内存告警和手动埋点。

## 运行

1. 在仓库根目录执行 `pnpm install`，让示例链接到 workspace 中的 `@weils-monitor/uniapp`。
2. 修改 [`config/monitor.ts`](config/monitor.ts)：
   - `url` 改为真实接收地址（必须是绝对 HTTPS 地址）；
   - `appId`、`projectName` 改为自己的应用标识；
   - `demoRequestUrl` 改为一个可访问的接口（可选）。
3. 用 HBuilderX 打开 `example/uniapp`，运行到「微信开发者工具 → 小程序」。
4. 在微信公众平台把 `url` 的域名加入 request 合法域名；本地联调可在开发者工具中勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
5. 触发页面按钮后，在开发者工具 Console 查看 `[monitor] ...`，Network 查看 `POST {url}` 的批量事件包。

## 演示内容

| 按钮 / 操作 | 产生的事件 |
| --- | --- |
| 进入首页、跳转详情页、返回 | `behavior` / `page_view`、`route_change` |
| 手动行为埋点 | `behavior` / `example_click`，带 `properties` |
| 发起 `uni.request` | `request`（自动跳过 SDK 自身上报端点） |
| 触发 JS 错误 | `error` / `js_error`（含 `stack_frames`） |
| 触发 Promise 错误 | `error` / `promise_error` |
| Vue 组件/渲染错误 | `error` / `framework_error` |
| 小程序内存告警 | `stability` / `memory_warning` |
| 启动/渲染 | `performance` / `mp_launch`、`mp_navigation` 等 |

## 说明

- 小程序没有 DOM，`Replay`、全局点击捕获、空白屏检测、FCP/LCP/CLS 等浏览器指标不可用；H5 端请使用 `@weils-monitor/vue`。
- 使用 `<navigator>` 组件、系统返回手势或自定义路由库时，路由事件可能无法自动捕获，可调用 `monitor.behavior.trackPageView()` 手动补报。
- 项目由 HBuilderX 编译，仓库内不提供 mp-weixin 的自动化构建脚本。
