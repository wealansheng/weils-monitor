# Vue Replay 录制与上传示例

1. 在仓库根目录运行 `pnpm install`。
2. 示例默认开启录制，无需配置环境变量；设置 `VITE_MONITOR_REPLAY=false` 可关闭。
3. 启动后端 `http://localhost:8888`，提供 `POST /api/v1/records` 接口；在仓库根目录运行 `pnpm dev:vue`。
4. 打开页面并操作几秒，点击现有的「Vue 组件错误」「JavaScript 错误」或「Promise 拒绝」按钮，再继续操作。

SDK 自动录制触发前 10 秒、后 5 秒，重叠触发会合并。「上传操作录制」按钮使用 `data-replay` 属性和 `monitor.addReplayHandler()`，同时上报行为事件并触发录制。`onMounted: false` 默认退出保留，等同应用、同用户下次错误或指定点击独立补传；设为 true 可启用 Beacon 尽力退出上传及下次自动补传。资源错误不会触发录制。控制台 `[replay]` 日志可查看 `started`、`uploaded`、`upload-error` 等状态。修改环境变量后需重启服务。

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

示例页面只录制与上传；播放在同级管理工作台中完成。Network 搜索 `records`，触发受支持错误后保持页面打开并等待约 5 秒；没有请求、上传重试或工作台无记录时，按[三项目联调与排障](../../docs/replay.md)检查。普通事件未上报或端口/默认地址异常时，见[常见问题与排障](../../docs/troubleshooting.md)。
