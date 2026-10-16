# @weils-monitor/vue

## 1.1.0

### Minor Changes

- 34b86da: Extract framework-independent collectors and the report pipeline into core. Vue and Nuxt now register their framework-specific collectors through the core factory and collector registry. Remove the uniapp package from the workspace.
- 34b86da: add core modules
- 34b86da: `metric_name: "resource"` 事件默认按耗时过滤：新增 `resourceDurationThreshold` 配置（默认 `100`，单位毫秒，设为 `0` 表示不过滤）。

  开发服务器的 Vite 会为每个模块单独发一次请求，此前一次页面加载会产生数百条 resource 事件（实测 dev 下 250 条 resource timing、上报 251 条，占单次加载全部事件的 90%；同页面生产构建只有 9 条）。默认阈值保留真正慢的资源、过滤缓存命中与极快请求，实测两次刷新的事件数：dev `558 → 140`，生产 `74 → 56`（其中生产只剩 1 条 ≥100ms 的 resource）。

- 5690cf1: Vue SDK 的错误、性能、请求、行为和稳定性数据现已统一为字段协议中的 snake_case 结构，并在入队时补齐公共上下文。上报使用 `{ app_id, sdk_version, send_time, sample_rate, events }` 批量包；队列达到条数或体积阈值、页面隐藏/卸载，或出现严重错误时自动 flush。新增 `maxBatchBytes`、`sampleRate` 和 `debug` 配置，并补充 navigation、longtask 与空白屏采集。

### Patch Changes

- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [5690cf1]
  - @weils-monitor/core@1.1.0
  - @weils-monitor/shared@1.1.0
  - @weils-monitor/utils@1.1.0

## 1.0.1

### Patch Changes

- 新增 performance 监控
- Updated dependencies
  - @weils-monitor/shared@1.0.1
  - @weils-monitor/utils@1.0.1

## 1.0.0

### Major Changes

- ba1801c: feat: 初始版本发布

### Patch Changes

- Updated dependencies [ba1801c]
  - @weils-monitor/shared@1.0.0
  - @weils-monitor/utils@1.0.0
