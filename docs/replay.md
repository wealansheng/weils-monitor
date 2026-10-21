# Replay 接入、联调与排障

本文串联业务 SDK、[接收后端](../../monitor-backend/README.md)和[管理工作台](../../monitor-frontend/README.md)。SDK 负责录制与上传，后端负责校验分片并入库，工作台负责读取与播放。业务页面不加载播放器。

## 默认值与上传条件

| 场景 | 默认开关 | 错误前 / 后窗口 | 上传路径 |
| --- | --- | --- | --- |
| SDK 通用接入 | 关闭，需 `replay.enabled: true` | 30 秒 / 10 秒 | 默认 `/api/v1/records`，建议显式设置 |
| `example/vue` | 开启，`VITE_MONITOR_REPLAY=false` 关闭 | 10 秒 / 5 秒 | Vite `/api/v1/records` → 后端同路径 |
| `example/nuxt` | 开启，`MONITOR_REPLAY=false` 关闭 | 10 秒 / 5 秒 | Nuxt `/api/records` → 后端 `/api/v1/records` |

两个示例均转发到 `http://localhost:8888`，修改环境变量后需重启服务。普通监控使用 `/api/v1/monitor`；录制使用 `/api/v1/records`，不放进 `events` 批量信封。

仅 `js_error`、`promise_error`、`framework_error`、`nuxt_error`、`nuxt_chunk_error` 触发片段。普通点击、资源错误、HTTP 错误、白屏及 `nuxt_ssr_error` 不触发。未触发错误时只维护滚动缓存，不上传；重叠错误会合并，持续触发会推迟封存，最长受 `maxDurationMs` 限制。

## 本地联调

假设三个仓库位于同一父目录，在各自终端中依次执行：

1. 后端：复制 `monitor-backend/.env.example` 为 `.env`，配置 ClickHouse 与 `MONITOR_DASHBOARD_TOKEN`，运行 `npm install`、`npm run db:init`、`npm run dev`。已有数据库也需执行初始化，确保 `event_record` 存在；运行账号需要该表的 SELECT/INSERT 权限。
2. SDK：在本仓库运行 `pnpm install`，再运行 `pnpm dev:vue` 或 `pnpm dev:nuxt`。根启动命令会先构建依赖包；若直接在示例目录启动，应先在根目录执行 `pnpm build`。
3. 浏览器：打开 SDK 示例，确认控制台出现 `[replay]` 的 `started`。操作页面数秒，点击「JavaScript 错误」等现有按钮，并保持页面打开。
4. 等待约 5 秒及封存处理时间，在 Network 中搜索 `records`。HTTP 200 且回执中的录制 ID、片号、片校验值均匹配后，控制台应出现 `uploaded`。
5. 工作台：先完成同级 SDK 构建，再在 `monitor-frontend` 运行 `npm install` 和 `npm run dev`，访问 `http://localhost:8866`。连接管理查询令牌，选择 `vue-example` 或 `nuxt-example`，进入「操作回放」，或从错误事件详情打开关联录制。

工作台首次展示的是明确标记的演示数据，需连接数据源才会读取后端。错误关联依靠同一 `app_id` 和 `errors[].event_id`，不能用错误消息或录制 ID 代替错误 UUID。刚出现错误时，关联片段可能仍在收集后置操作，可稍后重新查询。

## 上传回执与存储

客户端在脱敏后执行 JSON → gzip → base64 → IndexedDB，再按最多 256KiB 的编码字符串分片上传。每片请求包含完整元信息，后端成功入库后返回：

```json
{
  "ok": true,
  "record_id": "81111111-1111-4111-8111-111111111111",
  "chunk_index": 0,
  "chunk_checksum": "本次请求中的64位小写SHA-256"
}
```

这里的校验值为占位说明，不能作为有效分片提交。只返回 `{ "ok": true }` 不足以确认上传，SDK 会继续重试。每片最多 256KiB、单请求体上限 512KiB，每段最多 64 片，解压后的原始 JSON 最大 16MiB。完整协议、查询参数与错误码见[后端 Replay 文档](../../monitor-backend/docs/replay.md)。

SDK 待传队列默认保留 24 小时，后端录制表 TTL 默认 30 天；两者是独立期限。页面退出只尽力持久化，断电、崩溃和隐私模式不能保证零丢失。输入默认遮罩；敏感正文、图片或复杂区域应显式使用 `rr-mask`、`rr-block`、`data-private` 等标记，详见[录制配置](../packages/replay/README.md)。

## 看不到上传时

| 现象 | 检查与处理 |
| --- | --- |
| 无 `[replay] started` | 检查是否被环境变量设为 `false`；通用接入需 `enabled: true`。确认 SDK 依赖已构建，页面使用 HTTPS 或 localhost |
| 已启动但没有请求 | 使用 JS、Promise、Vue 或 Nuxt 客户端错误按钮；普通点击和资源错误不会上传。等待后置窗口结束，避免连续触发错误 |
| `sampled-out` | 当前会话未命中录制采样；检查 `replay.sampleRate`，采样决定保存在该标签页 sessionStorage |
| `error` / `memory-fallback` | 查看状态的 `message`，检查 Web Crypto、IndexedDB、Worker 和 CSP 的 blob worker 支持；内存回退刷新后会丢失待传片段 |
| 请求 404 / 502 或连接失败 | 检查 8888 后端、Vue `/api` 代理或 Nuxt `server/api/records.post.ts` 的转发目标 |
| 请求 400 / 413 | 查看后端错误响应；分片协议不符或请求超过 512KiB；反向代理也需允许相应体积 |
| 请求 500 | 检查 ClickHouse 连接、`event_record` 建表和运行账号 INSERT 权限 |
| HTTP 200 仍 `upload-error` | 检查回执是否包含匹配的 `record_id`、`chunk_index`、`chunk_checksum`，以及 `ok: true` |
| 工作台无录制 | 连接真实数据源，选择相同应用及时间范围，清除不匹配的用户/会话/路由筛选，等待上传后重新查询 |
| 工作台 401 / 404 / 409 | 分别检查管理令牌、接口与录制是否存在，以及录制是否缺片或损坏；工作台不会播放不完整录制 |

`monitor.replay.flush()` 只尝试上传已封存片段，不截断正在收集的错误窗口；需要提前结束时用 `stop()`，它也只封存已触发错误的片段。开关关闭时调用 `start()` 不会绕过配置启用录制。
