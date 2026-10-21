# @weils-monitor/utils

## 1.2.0

### Minor Changes

- 添加错误录制回放

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @weils-monitor/shared@1.3.0

## 1.1.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @weils-monitor/shared@1.2.0

## 1.1.0

### Minor Changes

- 34b86da: add core modules
- 34b86da: `@weils-monitor/nuxt` 补齐三项 Nuxt 专属采集能力，均可在 `cyMonitor` 中用同名开关关闭，默认开启：

  - 水合耗时：`nuxt_hydration`（`app:beforeMount` → `app:mounted`）与 `nuxt_hydration_complete`（直到 `app:suspense:resolve`）。
  - 服务端渲染耗时：新增 Nitro 服务端插件写入 `Server-Timing: nuxt_ssr;dur=…`，客户端读取后上报 `nuxt_ssr_render`。
  - Nuxt 框架错误：`app:error` → `nuxt_error`、`app:chunkError` → `nuxt_chunk_error`、服务端 `payload.error` → `nuxt_ssr_error`、`app:error:cleared` → 行为事件 `nuxt_error_cleared`；Vue 组件错误仍由 Vue 子包上报 `framework_error` 并自动去重。

  同时新增 `@weils-monitor/utils` 的 `getHydrationRating` 与 `getSSRRating` 阈值函数。

  模块现已同时兼容 Nuxt 3 与 Nuxt 4：`peerDependencies.nuxt` 与 `dependencies.@nuxt/kit` 均放宽为 `^3.0.0 || ^4.0.0`（安装时与宿主 Nuxt 去重到同一份），运行时只用两个大版本都存在的钩子（`app:beforeMount` / `app:mounted` / `app:suspense:resolve` / `app:error` / `app:chunkError` / `app:error:cleared`，Nitro 侧为 `request` + `beforeResponse`）。`example/nuxt` 升级到 Nuxt 4，并迁移到 `app/` 目录结构与 Nuxt 4 的项目引用 tsconfig。

- 5690cf1: Vue SDK 的错误、性能、请求、行为和稳定性数据现已统一为字段协议中的 snake_case 结构，并在入队时补齐公共上下文。上报使用 `{ app_id, sdk_version, send_time, sample_rate, events }` 批量包；队列达到条数或体积阈值、页面隐藏/卸载，或出现严重错误时自动 flush。新增 `maxBatchBytes`、`sampleRate` 和 `debug` 配置，并补充 navigation、longtask 与空白屏采集。

### Patch Changes

- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [5690cf1]
  - @weils-monitor/shared@1.1.0

## 1.0.1

### Patch Changes

- 新增 performance 监控
- Updated dependencies
  - @weils-monitor/shared@1.0.1

## 1.0.0

### Major Changes

- ba1801c: feat: 初始版本发布

### Patch Changes

- Updated dependencies [ba1801c]
  - @weils-monitor/shared@1.0.0
