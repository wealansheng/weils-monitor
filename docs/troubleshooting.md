# 常见问题与排障

本文汇总接入、联调和构建阶段最容易遇到的问题。先按“事件是否生成 → 是否发送 → 是否入库”三层定位，不要只盯 Network。

返回 [文档索引](README.md)。

<a id="port-8080"></a>
## 1. 配置了 8888，为什么仍请求 8080

`http://127.0.0.1:8080/api/v1/monitor` 是 [`@weils-monitor/shared`](../packages/shared/src/constants.ts) 的**默认上报地址**，只有 `createMonitor`、`nuxtMonitor` 或 `setConfig` 没有提供 `url` 时才会使用。

如果已经配置 `url: 'http://127.0.0.1:8888/api/v1/monitor'`，Network 仍出现 8080，通常是旧构建或 shared 多实例问题：

- 小程序/HBuilderX 沿用了旧的 `unpackage/dist/dev/mp-weixin`；
- pnpm workspace 的符号链接导致 `@weils-monitor/shared` 被打包成多份：`setConfig` 写入一份，发送逻辑读取另一份的默认值。

SDK 已将 `config` 与上报队列提升为 `globalThis` 单例，位于 [`packages/shared/src/constants.ts`](../packages/shared/src/constants.ts) 与 [`packages/shared/src/queue.ts`](../packages/shared/src/queue.ts)。多份 shared 副本会复用同一个 `config`/`queue` 对象。

验证与修复：

```powershell
# 1. 确认源码/生成配置是 8888
Select-String -Path .\example\uniapp\config\monitor.ts -Pattern '8080|8888'
Select-String -Path .\example\uniapp\unpackage\dist\dev\mp-weixin\config\monitor.js -Pattern '8080|8888'

# 2. 删除旧构建后重新编译
Remove-Item -Recurse -Force .\example\uniapp\unpackage\dist\dev\mp-weixin
```

然后 HBuilderX 重新运行到微信开发者工具，并在开发者工具「清缓存 → 全部清除」后重新编译。

<a id="data-not-reported"></a>
## 2. uni-app 数据没有上报

按顺序检查：

1. `App.vue` 的 `onLaunch` 是否调用了 `monitor.observer()`；`app.use(monitor)` 只安装 Vue 错误处理器，不启动采集。
2. 是否开启了 `debug: true`。正常情况下 Console 应出现：

   ```text
   [weils-monitor] { event_type: 'behavior', action: 'page_view', ... }
   [weils-monitor] report 200 1
   [monitor] behavior page_view ...
   ```

   - `[weils-monitor] { ... }`：事件已规范化；
   - `[weils-monitor] report ...`：发送成功/失败；
   - `[monitor] ...`：`uni.$emit` 事件总线收到事件。
   - 如果只有第一条、没有 `report`，问题在发送地址、域名或接收端。
3. 普通事件受 `batchSize`（默认 20）和 `maxBatchBytes` 限制；错误事件会立即发送。验收时可临时设置 `batchSize: 1`，或切一次后台触发 `onAppHide` 冲刷。
4. 开发者工具是否勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」；生产环境必须在微信公众平台配置 request 合法域名。
5. 接收端是否真的可达（见下一节）。

<a id="local-backend"></a>
## 3. 本地后端：8888、localhost 与 IPv4/IPv6

`monitor-backend` 默认监听 8888。若后端启动时 `HOST=localhost`，Windows 上可能只绑定 IPv6 `::1`：

```powershell
Get-NetTCPConnection -LocalPort 8888 -State Listen | Select-Object LocalAddress
```

如果只看到 `::1`，小程序请求 `127.0.0.1:8888` 会连接失败。把 [`monitor-backend/.env`](../../monitor-backend/.env) 改为：

```ini
HOST=0.0.0.0
PORT=8888
```

重启后验证：

```powershell
curl.exe http://127.0.0.1:8888/
```

返回健康检查 JSON（包含 `service: "monitor service"`）说明后端可达。ClickHouse 默认 8123，可用 `curl.exe http://127.0.0.1:8123/ping` 检查，正常返回 `Ok.`。

小程序端建议使用明确的 IPv4 地址：

```ts
url: 'http://127.0.0.1:8888/api/v1/monitor'
```

真机不能访问 `127.0.0.1`，需要使用 HTTPS 隧道（cloudflared / ngrok 等），并在微信公众平台配置域名。

<a id="error-types"></a>
## 4. 错误事件类型不符合预期

| 触发方式 | 上报类型 | 原因 |
| --- | --- | --- |
| `@click` / Vue 生命周期中 `throw` | `framework_error` | 被 Vue 全局 `errorHandler` 捕获 |
| `setTimeout(() => { throw ... })`、非 Vue 模块抛错 | `js_error` | 由 `wx.onError` 捕获 |
| `Promise.reject(...)` 且未被处理 | `promise_error` | 由 `wx.onUnhandledRejection` 捕获 |
| 打开不存在的页面 | `page_not_found` | 由 `wx.onPageNotFound` 捕获 |

Vue 事件处理器里的异常走 `framework_error` 是正常行为，不是 `js_error` 丢失。示例已分别提供“触发 Vue 事件错误”和“触发全局 JS 错误”按钮。

## 5. 没有 `request` 事件

- 只采集经 `uni.request` 的请求；直接调用 `wx.request` 或绕过 `uni.addInterceptor` 的第三方库不会自动采集。
- SDK 自身的上报请求会按端点路径跳过，避免闭环。
- `demoRequestUrl` 不能和监控 `url` 相同，否则会被当作 SDK 自身请求跳过。
- 低于 `requestDurationThreshold`（默认 0）的请求不上报；默认不上报请求体/响应体。

## 6. 没有路由/页面事件

只拦截 `uni.navigateTo / redirectTo / reLaunch / switchTab / navigateBack`。以下场景可能漏采：

- `<navigator>` 组件；
- 系统返回手势；
- 自定义路由库。

手动补报：

```ts
monitor.behavior.trackPageView()
```

## 7. 小程序端没有 Replay / 性能指标

小程序没有 DOM：

- Replay（rrweb）、全局点击、空白屏、资源时序、FCP/LCP/CLS/INP/TTFB/长任务均不可用；
- 启动/渲染使用 `mp_launch`、`mp_navigation`、`mp_render`、`mp_script`、`mp_load_package`；
- 需要完整浏览器能力时，H5 端使用 `@weils-monitor/vue`。

开启 `replay.enabled` 时只会输出一次不支持告警，不会影响其他采集。

<a id="nuxt-types"></a>
## 8. Nuxt 中 `release` / `projectName` 爆红

如果 IDE 报：

```text
Object literal may only specify known properties, and 'release' does not exist in type ...
```

但 `pnpm --filter @weils-monitor/example-nuxt typecheck` 能通过，通常是 `.nuxt` 类型缓存过期：

```powershell
Remove-Item -Recurse -Force .\example\nuxt\.nuxt
pnpm build
pnpm --filter @weils-monitor/example-nuxt typecheck
```

然后重启 IDE 的 TypeScript 服务：

- VS Code：`TypeScript: Restart TS Server`；
- WebStorm：`File → Invalidate Caches`。

`ModuleOptions extends InitOptions`，`release`、`projectName`、`replay` 等都是 `nuxtMonitor` 的合法字段。详细说明见 [`packages/nuxt/README.md`](../packages/nuxt/README.md)。

## 9. 升级 SDK 后需要清理什么

- 重新构建依赖包：`pnpm build`；
- 小程序：删除 `example/uniapp/unpackage/dist/dev/mp-weixin`，HBuilderX 重新运行，微信开发者工具清缓存后重新编译；
- Nuxt：删除 `.nuxt`，重新运行 `nuxt typecheck` 或 `pnpm dev:nuxt`；
- 浏览器应用：清理构建缓存后重新打包。

## 10. 小程序错误能看源码吗

不能。当前的私有 Source Map 上传与还原流程面向 Web 构建产物；小程序错误会保留 `stack_frames` 和原始 `stack`，但 Source Map/构建路径还原尚未包含小程序产物适配。

## 11. 还是无法定位

提供以下信息可以快速判断：

1. Console 中所有 `[weils-monitor]` / `[monitor]` 日志；
2. Network 中请求的完整 URL、状态码、响应体或错误信息；
3. 生成配置：
   ```powershell
   Select-String -Path .\example\uniapp\unpackage\dist\dev\mp-weixin\config\monitor.js -Pattern 'url|debug'
   ```
4. 后端日志与 `curl.exe http://127.0.0.1:8888/` 的结果；
5. 小程序基础库版本与 HBuilderX/uni-app 版本。
