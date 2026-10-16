---
"@weils-monitor/vue": minor
"@weils-monitor/shared": minor
---

`metric_name: "resource"` 事件默认按耗时过滤：新增 `resourceDurationThreshold` 配置（默认 `100`，单位毫秒，设为 `0` 表示不过滤）。

开发服务器的 Vite 会为每个模块单独发一次请求，此前一次页面加载会产生数百条 resource 事件（实测 dev 下 250 条 resource timing、上报 251 条，占单次加载全部事件的 90%；同页面生产构建只有 9 条）。默认阈值保留真正慢的资源、过滤缓存命中与极快请求，实测两次刷新的事件数：dev `558 → 140`，生产 `74 → 56`（其中生产只剩 1 条 ≥100ms 的 resource）。
