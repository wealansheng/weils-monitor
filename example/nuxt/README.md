# Nuxt Replay 录制与上传示例

1. 在仓库根目录运行 `pnpm install`。
2. 示例默认开启录制，无需配置环境变量；设置 `MONITOR_REPLAY=false` 可关闭。
3. 启动后端 `http://localhost:8888`，提供 `POST /api/v1/records` 接口；在仓库根目录运行 `pnpm dev:nuxt`。
4. 打开页面并操作几秒，点击现有的「JavaScript 错误」「Promise 拒绝」或「Nuxt 应用错误」按钮，再继续操作。

SDK 仅在客户端录制，保留错误前 10 秒、后 5 秒并自动上传；重叠错误会合并。未触发错误时不上传滚动缓存，资源错误与 SSR 错误不会触发录制。控制台的 `[replay]` 日志可查看 `started`、`uploaded`、`upload-error` 等状态。修改环境变量后需重启服务。

录制请求发送到 `/api/records`，由 Nuxt 服务端转发到 `http://localhost:8888/api/v1/records`。后端收到每个分片后须返回以下 JSON，三个标识字段必须与请求一致，SDK 才会确认成功，否则会重试：

```json
{
  "ok": true,
  "record_id": "请求中的 record_id",
  "chunk_index": 0,
  "chunk_checksum": "请求中的 chunk_checksum"
}
```

输入默认遮罩，实时报告区域通过 `blockSelector: '.reports'` 屏蔽。完整配置与上传协议见 [Replay 文档](../../packages/replay/README.md)。

示例页面只录制与上传；播放在同级管理工作台中完成。Network 搜索 `records` 时看到的是浏览器到 Nuxt 的 `/api/records` 请求，Nuxt 服务端再向 8888 转发；不要把它误认为浏览器未请求 `/api/v1/records`。完整链路与排障见[三项目联调指南](../../docs/replay.md)。
