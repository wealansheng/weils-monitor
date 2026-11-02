---
"@weils-monitor/core": patch
---

新增 `@weils-monitor/core/reporter` 子入口：提供不加载 Replay/rrweb、不依赖 DOM 的上报原语；补充不依赖 `URL` 的 `sanitizeQueryString`，供小程序等非浏览器宿主复用。
