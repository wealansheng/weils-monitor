# 生产错误的 Source Map 定位

SDK 上报原始 `stack`、脚本位置和 `release`；同级项目 `monitor-backend` 私有保存构建后的 Source Map，并在查询错误事件时还原源码位置。`packages/*/dist` 中的 SDK map 无法代替应用最终构建的 map。

## 采集与展示协议

core 使用 `error-stack-parser` 将原始堆栈转换为按调用顺序排列的 `stack_frames`。每帧可包含 `filename`、`lineno`、`colno`、`function_name`、`raw`；JS、Promise、Vue、Nuxt 客户端错误共用归一化流程，Nitro 直接上报复用同一工具。已有有效的顶层文件、行列号优先，否则使用首个完整定位帧补齐。没有堆栈或解析失败时仍正常上报。

这些行列号属于**构建文件**。后端继续使用 `@jridgewell/trace-mapping`，以 `app_id + release + kind + artifact` 查找 map 并还原源码。对外行列号从 1 开始，映射库内部列号从 0 开始。SDK `release` 是监控应用版本，须与上传版本完全一致。

构建必须保留 map 的 `sourcesContent`，否则只能还原路径和位置，无法展示源码。后端只读取 map 内嵌源码，不拉取远程源码，也不按 `sources` 读取服务器文件。

在 `monitor-frontend` 连接工作台查询令牌后，错误详情的“源码定位”区域会逐帧展示源码位置及错误行前后各 5 行。它调用 `GET /api/v1/dashboard/errors/:eventId/symbolication?app_id=...`，只使用 `MONITOR_DASHBOARD_TOKEN`，不需要 map 上传令牌。旧事件没有 `stack_frames` 时仍支持原始 `stack` 和顶层定位字段回退。

## 私有存储与发布顺序

map 统一保存到后端根目录 `mapdata`，容器中挂载持久化目录到 `/app/mapdata`。该目录不提供静态访问，禁止配置 Nginx `alias` 或静态服务器指向它。上传与管理查询受 `SOURCEMAP_ADMIN_TOKEN` 保护；工作台只能读取经过鉴权的定位结果，不能下载 map。

发布必须顺序执行：构建 → 上传 → 清除部署产物中的 map → 部署。当前上传命令仅在全部上传成功后自动清除客户端与服务端构建目录中的 `.map`；`SOURCEMAP_PRUNE_PUBLIC` 无须再设置。上传返回非零退出码时，流水线必须立即失败并阻止部署。以下 PowerShell 示例在构建与上传后都检查退出码，部署命令只能放在成功检查之后：

```powershell
pnpm --filter @weils-monitor/example-vue build
if ($LASTEXITCODE -ne 0) { throw '构建失败，停止发布' }
npm --prefix D:\wealsCode\monitor-backend run sourcemaps:upload
if ($LASTEXITCODE -ne 0) { throw 'Source Map 上传失败，停止发布' }
# 在这里运行实际部署命令；公开产物中此时已无 .map。
```

## Vue 示例

`example/vue/vite.config.ts` 已开启隐藏 Source Map，监控版本从 `VITE_MONITOR_RELEASE` 读取。PowerShell 本地演示：

```powershell
$env:VITE_MONITOR_RELEASE = 'vue-demo-001'
pnpm --filter @weils-monitor/example-vue build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:SOURCEMAP_SERVER = 'http://localhost:8888'
$env:SOURCEMAP_ADMIN_TOKEN = '<与后端配置相同的令牌>'
$env:SOURCEMAP_APP_ID = 'vue-example'
$env:SOURCEMAP_RELEASE = $env:VITE_MONITOR_RELEASE
$env:SOURCEMAP_CLIENT_DIR = 'D:\wealsCode\weils-monitor\example\vue\dist'
$env:SOURCEMAP_CLIENT_BASE_URL = 'http://localhost:4173/'
npm --prefix D:\wealsCode\monitor-backend run sourcemaps:upload
if ($LASTEXITCODE -ne 0) { throw 'Source Map 上传失败，停止发布' }
pnpm --filter @weils-monitor/example-vue preview
```

Vite 预览的 `/api` 已转发至本地后端。打开预览页并触发“JavaScript 错误”，在实时报告中复制错误的 `event_id`，调用后端的受保护查询接口。

## Nuxt 示例

`example/nuxt/nuxt.config.ts` 已为客户端与服务端构建开启隐藏 Source Map，监控版本从 `MONITOR_RELEASE` 读取。构建完成后，清除上一示例的 `SOURCEMAP_CLIENT_DIR` 等变量，再设置：

Nitro 默认会从最终服务端 map 中排除源码；示例显式设置 `nitro.rollupConfig.output.sourcemapExcludeSources: false` 和 `nitro.experimental.sourcemapMinify: false`，保留服务端源码内容和完整映射。其他 Nuxt 应用接入时也应配置这两项。

```powershell
$env:MONITOR_RELEASE = 'nuxt-demo-001'
pnpm --filter @weils-monitor/example-nuxt build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:SOURCEMAP_APP_ID = 'nuxt-example'
$env:SOURCEMAP_RELEASE = $env:MONITOR_RELEASE
$env:SOURCEMAP_CLIENT_DIR = 'D:\wealsCode\weils-monitor\example\nuxt\.output\public\_nuxt'
$env:SOURCEMAP_CLIENT_BASE_URL = 'http://localhost:3000/_nuxt/'
$env:SOURCEMAP_SERVER_DIR = 'D:\wealsCode\weils-monitor\example\nuxt\.output\server'
npm --prefix D:\wealsCode\monitor-backend run sourcemaps:upload
if ($LASTEXITCODE -ne 0) { throw 'Source Map 上传失败，停止发布' }
$env:MONITOR_SSR_ENDPOINT = 'http://localhost:8888/api/v1/monitor'
$env:MONITOR_SSR_APP_ID = 'nuxt-example'
pnpm --filter @weils-monitor/example-nuxt exec nuxt preview
```

本地接收服务需要已设置 `SOURCEMAP_ADMIN_TOKEN` 并可访问 ClickHouse。发布流水线也应按同一顺序执行：构建、上传 map、从公开产物移除 map、部署；同一次发布的 SDK `release` 和上传值必须相同。若使用 CDN，把 `SOURCEMAP_CLIENT_BASE_URL` 设为浏览器堆栈中实际出现的资源前缀。Nuxt 生产错误的客户端 payload 不含原始服务端堆栈，因此设置 `MONITOR_SSR_ENDPOINT`、`MONITOR_SSR_APP_ID`、`MONITOR_RELEASE` 让 Nitro 直接上报完整 SSR 错误；客户端仍会补报简要错误。服务端堆栈含 `.output/server/` 路径时，可匹配上传的服务端相对路径。

## 查询

```powershell
$eventId = '<实时报告中的 event_id>'
Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:SOURCEMAP_ADMIN_TOKEN" } `
  -Uri "http://localhost:8888/api/v1/monitor/errors/$eventId/symbolication?app_id=vue-example"
```

返回的 `frames` 分别包含打包后位置 `generated` 和源码位置 `original`；`status` 为 `missing_map` 等值时，可先检查发布版本、资源 URL 与 map 上传结果。未上传 map 的错误仍可正常采集和入库。
