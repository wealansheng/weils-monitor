---
"@weils-monitor/utils": patch
---

支持注入自定义批量发送函数（`createReportStrategy`、`flushReportQueue({ sender })`、`lazyReportBatch` 第三参数），并在缺少 `TextEncoder` 时使用纯 JS 计算 UTF-8 字节数，供小程序端复用同一套批量队列。
