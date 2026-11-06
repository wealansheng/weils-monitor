# @weils-monitor/replay

错误与自定义点击前后操作回放，支持按配置在页面退出时上传。录制与播放入口分离；业务页面不加载播放器。依赖固定为 `@rrweb/record` / `@rrweb/replay` / `@rrweb/types` 2.1.7 与 fflate 0.8.3。

录制由业务 SDK 完成，[monitor-backend](../../../monitor-backend/docs/replay.md) 接收分片并写入 `event_record`，[monitor-frontend](../../../monitor-frontend/docs/replay.md) 使用独立播放器查看片段。端到端启动与“没有上传”的排查见 [Replay 接入与排障](../../docs/replay.md)。

> 小程序端（`@weils-monitor/uniapp`）没有 DOM，不支持录制；开启 `replay.enabled` 只会输出一次告警。需要回放请使用 Vue/Nuxt 的 H5/Web 端。

## Vue / Nuxt 接入

```ts
import { createMonitor } from '@weils-monitor/vue'

const monitor = createMonitor({
  appId: 'web-portal',
  url: '/api/v1/monitor',
  replay: {
    enabled: true,
    onMounted: false,
    url: '/api/v1/records',
    sampleRate: 1,
    beforeErrorMs: 30_000,
    afterErrorMs: 10_000,
    blockSelector: '.large-virtual-list, .animated-chart',
    maskTextSelector: '.customer-details',
    onStatus: status => console.info('[replay]', status.type),
  },
})
```

Nuxt 在 `nuxtMonitor.replay` 中使用相同配置；配置文件中只使用可序列化的字段。状态回调可在客户端插件中通过 `$monitor?.replay.subscribe()` 注册；脱敏函数等配置需要独立录制 API，此时应关闭模块自动录制并自行关联错误，避免重复录制。

通用 SDK 默认关闭，关闭时不导入 rrweb，也不建立录制监听和数据库，调用控制器 `start()` 不会绕过开关。开启后异步启动，`await monitor.replay.start()` 可等待就绪。已在懒加载期间上报的错误会在就绪后触发一个前置上下文不足的片段。`example/vue` 和 `example/nuxt` 为便于演示默认开启，窗口为前 10 秒、后 5 秒；用各自的 `VITE_MONITOR_REPLAY=false` / `MONITOR_REPLAY=false` 关闭。

普通监控仍调用 `monitor.observer()` 启动。回放订阅已规范化的报告，不重复采集事件。错误触发类型：`js_error`、`promise_error`、`framework_error`、`nuxt_error`、`nuxt_chunk_error`；资源错误、请求失败、白屏和 `nuxt_ssr_error` 不触发。

### 自定义点击与退出上传

```ts
monitor.addClickHandler('data-action').addReplayHandler('data-replay')
monitor.behavior.click() // 或 monitor.observer()
```

```html
<button data-replay="提交订单"><span>提交</span></button>
```

`addReplayHandler()` 注册 HTML 属性名，返回同一个 monitor；点击最近匹配祖先时，以属性值为 `action` 上报一条行为事件，并用该事件的真实 UUID 触发前后窗口。重复注册不会重复上报，同时匹配普通点击属性时优先使用 Replay 属性。Replay 关闭或未命中采样时仍上报行为，但不生成录制。Nuxt 客户端可通过 `$monitor?.addReplayHandler()` 注册。

`onMounted` 是退出上传开关，与 Vue 挂载无关，默认 `false`。关闭标签页、刷新或整页跳转时保留滚动窗口和未完成片段；下次同应用、同用户出现错误或指定点击，独立补传旧页面片段，并生成本次片段，不拼接两页 DOM。保留片段不会因启动、定时器、`online` 或 `flush()` 自动上传；已封存上传任务仍正常重试。保留期和容量沿用 `retentionMs`、`maxQueueBytes`。

设为 `true` 后，无触发也在页面退出时通过 `navigator.sendBeacon()` 尽力发送。SDK 在页面活动时提前压缩、校验及序列化快照；退出发送最近准备好的快照，最多可能缺少一个持久化周期及处理期间的尾部操作。Beacon 有约 64KiB 的共享在途容量限制，大片段或被拒绝的发送保留到下次打开自动补传。返回 `true` 不代表收到后端回执；副本保留原 ID 与内容，后续正常上传确认，不重复生成变体。首次快照尚未准备、进程被强制终止等情况只能尽力持久化。

普通切换标签页仅保存缓存；SPA 路由变化不触发退出上传，BFCache 往返恢复不重复发送。旧格式 checkpoint 沿用原恢复策略，新的 checkpoint 保存创建时的退出策略。

未配置 sessionId 时生成标签页会话 ID，并同时用于普通事件。`replay.sampleRate` 实际按会话采样，决定保存在 sessionStorage；与普通事件信封的 sampleRate 独立。

## 独立录制与控制

```ts
import { createRecorder } from '@weils-monitor/replay'
const recorder = createRecorder({ appId: 'web-portal', sessionId: 'session-id', url: '/api/v1/records' })
const unsubscribe = recorder.subscribe(status => console.log(status))
await recorder.start()
// eventId 必须来自关联事件的真实 UUID。
await recorder.capture(errorEventId)
// 自定义行为使用第三个参数；省略时按错误处理。
// await recorder.capture(behaviorEventId, Date.now(), { type: 'custom', action: '提交订单' })
await recorder.flush()   // 上传已封存的错误片段，不截断当前错误窗口
await recorder.stop()    // 停止采集，提前封存并尝试上传已触发片段
unsubscribe()
await recorder.destroy() // 解除监听、定时器和数据库连接
```

SDK 页面级共享配置的限制仍然适用：同一页面只创建一个 monitor。独立 createRecorder 不自动订阅监控错误。

## 状态与排障

`onStatus` 和 `subscribe()` 使用相同的 `ReplayStatus`，可能包含 `recordId` 和 `message`。订阅返回取消函数，不补发历史状态；应在启动前订阅，或在 Vue 初始化配置中传入 `onStatus`。

| 状态 | 含义 |
| --- | --- |
| `started` / `stopped` | 录制已启动 / 已停止 |
| `sampled-out` | 该标签页会话未命中采样，不录制 |
| `memory-fallback` | IndexedDB 不可用或写入失败，使用有界内存，刷新会丢失待传数据 |
| `uploaded` | 该录制全部分片已得到匹配的后端回执 |
| `upload-error` | 请求或回执失败，已进入重试流程；查看 `message` |
| `truncated` | 录制达到限制而提前结束 |
| `dropped` | 过期、容量不足或缺少快照等原因导致数据丢弃 |
| `error` | 录制或处理异常；查看 `message` |

默认没有错误或指定点击时不会上传，`flush()` 不把滚动缓存变成片段。刚触发后需等待后置窗口和压缩完成，连续触发会延长窗口；`onMounted: true` 另允许退出上传。后端必须返回 `ok: true` 以及匹配的 `record_id`、`chunk_index`、`chunk_checksum`；HTTP 200 本身不代表 SDK 已确认完成。完整回执和网络排查见[联调指南](../../docs/replay.md)。

## 存储与可靠性

链路为 `脱敏 → JSON.stringify → 异步 gzip → base64 → IndexedDB → 上传`。每 1 秒或累计 256KiB 原始数据形成本地批次；每 10 秒请求全量快照，按完整快照链淘汰缓存。重建可能额外保留约 10 秒前置事件，播放从展示起点开始。

默认保存错误前 30 秒、后 10 秒，重叠错误合并，默认展示窗口最长 120 秒，可通过 `maxDurationMs` 调整。结束时在客户端整体压缩，先保存最终包，然后按 256KiB 编码长度分片；小包只有一片。每片与整包均有 SHA-256 校验。

同段最多 1000 个错误/点击触发标记；标记 JSON 超过 96KiB 时提前封存，后续触发另起片段，保证长 action 的连续点击不会挤占后端请求体预算。

| 配置 | 默认值 |
| --- | --- |
| enabled | false，仅框架/core 自动录制开关；独立 createRecorder 由 start() 启动 |
| onMounted | false，退出保留待新触发；true 时通过 Beacon 尽力发送并允许自动恢复补传 |
| url | `/api/v1/records` |
| sampleRate | 1，按会话实际采样，范围限制在 0–1 |
| beforeErrorMs / afterErrorMs | 30000 / 10000 |
| maxDurationMs | 120000 |
| maxRollingBytes | 8MiB，压缩编码后的滚动缓存 |
| maxQueueBytes | 50MiB，待传编码载荷 |
| maxRecordBytes | 16MiB，单段原始 JSON，上限不可调高 |
| retentionMs | 24 小时，待传保留期限 |
| checkpointIntervalMs | 10000 |
| persistIntervalMs | 1000 |
| maxBatchBytes | 256KiB，原始事件批次阈值 |

最多 64 片；重试保持录制 ID、序号和内容不变。收到后端匹配 ID、片号及校验值的回执后才推进任务，全部完成后删除任务。采用带抖动指数退避（最高约 60 秒），每次上线和启动时继续检查；恢复网络不会跳过尚未到期的退避。

跨标签页使用事务租约领取任务，活动任务续租。支持 Web Locks 的浏览器还会持有录制者存活锁，防止后台标签页计时器被节流时被误恢复。异常退出后的活动录制待 30 秒租约过期后检查：默认等待新的同用户触发；退出上传模式自动恢复原快照；旧格式已触发记录恢复为 `recovered`、未触发缓存清除。封存上传包和清除恢复标记在同一事务内完成，避免崩溃恢复产生同一录制的第二个版本。退出时只能尽力写盘，不能承诺浏览器崩溃或断电时零丢失：最近尚未完成写盘的一批数据可能丢失。

新录制使用可选 `triggers` 标记真实错误、点击和退出；`errors` 仅含真实错误。`linked_event_ids` 可关联稍后释放旧片段的事件，时间点不伪装进旧片段。管理端行为详情与错误详情均通过通用事件关联接口读取录制；先部署支持新字段的后端和管理端，再发布 SDK，无需新增数据库列。

容量不足先清理过期和旧待传记录，并通过 `dropped` 状态通知；超长或超大录制提前结束。单个快照链超过限制时停止录制。IndexedDB 不可用或写入失败时进入有界内存模式，通知 `memory-fallback`，仍尽力上传，但刷新会丢失尚未上传的内存内容。

## 隐私与精简

```html
<section data-private>不记录内部结构与操作</section>
<section class="rr-block">长列表、复杂 SVG 或动画区域</section>
<span class="rr-mask">敏感页面文本</span>
```

默认输入全部遮罩，密码始终遮罩，contenteditable 文本也遮罩。支持 blockClass/blockSelector、maskTextClass/maskTextSelector、maskInputFn/maskTextFn 和 dropAttributes；自定义函数由接入方负责验证，密码不会被自定义输入函数解除遮罩。

Canvas 和跨域 iframe 不录制，Canvas 区域默认整体屏蔽。启用 slimDOMOptions，移除事件处理属性、敏感属性、埋点冗余属性；保留 class/style、框架样式属性和布局信息。URL 属性与页面 URL 移除敏感查询参数；srcset 不记录。初始和增量事件使用同样的过滤规则。业务正文、CSS 或自定义属性可能含隐私时，必须用屏蔽/遮罩标记或 dropAttributes 明确处理；本功能不自动识别所有个人信息。

gzip/base64 是编码和压缩，不是加密；使用 HTTPS 与现有受控管理端访问。图片、字体等外部资源不归档，失效时可能影响回放外观。

## 播放

```ts
import { createReplayPlayer } from '@weils-monitor/replay/player'
import '@weils-monitor/replay/style.css'
const player = await createReplayPlayer({ target: element, chunks })
player.play(0)
player.pause()
player.seek(5000) // 相对 display_start，毫秒
player.setSpeed(2)
console.log(player.duration, player.getCurrentTime()) // 相对 display_start，毫秒
player.destroy()
```

也可传入 `events` 原始 rrweb 数组及 displayStart。分片会排序、校验、拼接，解码与解压限制为 16MiB；缺片、冲突、校验失败时拒绝创建播放器。默认暂停，沙箱不允许执行录制页面脚本，不开启不安全 Canvas 回放。

工作台先通过受保护的详情接口确认录制为 `complete`，再分页读取分片并交给播放器。`incomplete` 与 `corrupt` 在后端拒绝读取播放分片；录制列表不携带 `payload`。`play(0)` 从展示起点播放，`play()` 继续，`seek()` 定位并暂停；调用方负责控件、进度更新与卸载时销毁。

## 开发验证

```bash
pnpm build
pnpm --filter @weils-monitor/replay test
pnpm --filter @weils-monitor/replay exec playwright install chromium
pnpm --filter @weils-monitor/replay test:e2e
```

要求现代浏览器的 MutationObserver、Web Crypto（HTTPS 或 localhost）、IndexedDB、Web Worker。CSP 应允许 SDK 压缩使用的 blob worker；不支持时通过 error 状态报告。
