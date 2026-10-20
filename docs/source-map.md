# 生产错误的 Source Map 定位

SDK 上报原始 `stack`、脚本位置和 `release`；同级项目 `monitor-backend` 私有保存构建后的 Source Map，并在查询错误事件时还原源码位置。`packages/*/dist` 中的 SDK map 无法代替应用最终构建的 map。

## Vue 示例

`example/vue/vite.config.ts` 已开启隐藏 Source Map，监控版本从 `VITE_MONITOR_RELEASE` 读取。PowerShell 本地演示：

```powershell
$env:VITE_MONITOR_RELEASE = 'vue-demo-001'
pnpm --filter @weils-monitor/example-vue build
$env:SOURCEMAP_SERVER = 'http://localhost:8888'
$env:SOURCEMAP_ADMIN_TOKEN = '<与后端配置相同的令牌>'
$env:SOURCEMAP_APP_ID = 'vue-example'
$env:SOURCEMAP_RELEASE = $env:VITE_MONITOR_RELEASE
$env:SOURCEMAP_CLIENT_DIR = 'D:\wealsCode\weils-monitor\example\vue\dist'
$env:SOURCEMAP_CLIENT_BASE_URL = 'http://localhost:4173/'
$env:SOURCEMAP_PRUNE_PUBLIC = 'true'
npm --prefix D:\wealsCode\monitor-backend run sourcemaps:upload
pnpm --filter @weils-monitor/example-vue preview
```

Vite 预览的 `/api` 已转发至本地后端。打开预览页并触发“JavaScript 错误”，在实时报告中复制错误的 `event_id`，调用后端的受保护查询接口。

## Nuxt 示例

`example/nuxt/nuxt.config.ts` 已为客户端与服务端构建开启隐藏 Source Map，监控版本从 `MONITOR_RELEASE` 读取。构建完成后，清除上一示例的 `SOURCEMAP_CLIENT_DIR` 等变量，再设置：

```powershell
$env:MONITOR_RELEASE = 'nuxt-demo-001'
pnpm --filter @weils-monitor/example-nuxt build
$env:SOURCEMAP_APP_ID = 'nuxt-example'
$env:SOURCEMAP_RELEASE = $env:MONITOR_RELEASE
$env:SOURCEMAP_CLIENT_DIR = 'D:\wealsCode\weils-monitor\example\nuxt\.output\public\_nuxt'
$env:SOURCEMAP_CLIENT_BASE_URL = 'http://localhost:3000/_nuxt/'
$env:SOURCEMAP_SERVER_DIR = 'D:\wealsCode\weils-monitor\example\nuxt\.output\server'
$env:SOURCEMAP_PRUNE_PUBLIC = 'true'
npm --prefix D:\wealsCode\monitor-backend run sourcemaps:upload
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
