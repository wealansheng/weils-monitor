---
"@weils-monitor/vue": minor
"@weils-monitor/shared": minor
"@weils-monitor/utils": minor
---

Vue SDK 的错误、性能、请求、行为和稳定性数据现已统一为字段协议中的 snake_case 结构，并在入队时补齐公共上下文。上报使用 `{ app_id, sdk_version, send_time, sample_rate, events }` 批量包；队列达到条数或体积阈值、页面隐藏/卸载，或出现严重错误时自动 flush。新增 `maxBatchBytes`、`sampleRate` 和 `debug` 配置，并补充 navigation、longtask 与空白屏采集。
