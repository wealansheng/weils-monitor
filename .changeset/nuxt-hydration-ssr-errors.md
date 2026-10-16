---
"@weils-monitor/nuxt": minor
"@weils-monitor/utils": minor
---

`@weils-monitor/nuxt` 补齐三项 Nuxt 专属采集能力，均可在 `cyMonitor` 中用同名开关关闭，默认开启：

- 水合耗时：`nuxt_hydration`（`app:beforeMount` → `app:mounted`）与 `nuxt_hydration_complete`（直到 `app:suspense:resolve`）。
- 服务端渲染耗时：新增 Nitro 服务端插件写入 `Server-Timing: nuxt_ssr;dur=…`，客户端读取后上报 `nuxt_ssr_render`。
- Nuxt 框架错误：`app:error` → `nuxt_error`、`app:chunkError` → `nuxt_chunk_error`、服务端 `payload.error` → `nuxt_ssr_error`、`app:error:cleared` → 行为事件 `nuxt_error_cleared`；Vue 组件错误仍由 Vue 子包上报 `framework_error` 并自动去重。

同时新增 `@weils-monitor/utils` 的 `getHydrationRating` 与 `getSSRRating` 阈值函数。

模块现已同时兼容 Nuxt 3 与 Nuxt 4：`peerDependencies.nuxt` 与 `dependencies.@nuxt/kit` 均放宽为 `^3.0.0 || ^4.0.0`（安装时与宿主 Nuxt 去重到同一份），运行时只用两个大版本都存在的钩子（`app:beforeMount` / `app:mounted` / `app:suspense:resolve` / `app:error` / `app:chunkError` / `app:error:cleared`，Nitro 侧为 `request` + `beforeResponse`）。`example/nuxt` 升级到 Nuxt 4，并迁移到 `app/` 目录结构与 Nuxt 4 的项目引用 tsconfig。
