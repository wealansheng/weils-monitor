# Vue Replay 录制与上传示例

1. 在仓库根目录运行 `pnpm install`。
2. 示例默认开启录制，无需配置环境变量；设置 `VITE_MONITOR_REPLAY=false` 可关闭。
3. 启动后端 `http://localhost:8888`，提供 `POST /api/v1/records` 接口；在仓库根目录运行 `pnpm dev:vue`。
4. 打开页面并操作几秒，点击现有的「Vue 组件错误」「JavaScript 错误」或「Promise 拒绝」按钮，再继续操作。

SDK 自动录制错误前 10 秒、后 5 秒，并上传封存的错误片段；重叠错误会合并。未触发错误时不上传滚动缓存，资源错误不会触发录制。控制台的 `[replay]` 日志可查看 `started`、`uploaded`、`upload-error` 等状态。修改环境变量后需重启服务。

录制请求通过 Vite `/api` 代理上传到 `http://localhost:8888/api/v1/records`。后端收到每个分片后须返回以下 JSON，三个标识字段必须与请求一致，SDK 才会确认成功，否则会重试：

```json
{
  "ok": true,
  "record_id": "请求中的 record_id",
  "chunk_index": 0,
  "chunk_checksum": "请求中的 chunk_checksum"
}
```

输入默认遮罩，实时报告区域通过 `blockSelector: '.reports-panel'` 屏蔽。完整配置与上传协议见 [Replay 文档](../../packages/replay/README.md)。

示例页面只录制与上传；播放在同级管理工作台中完成。Network 搜索 `records`，触发受支持错误后保持页面打开并等待约 5 秒；没有请求、上传重试或工作台无记录时，按[三项目联调与排障](../../docs/replay.md)检查。
