# @weils-monitor/vue

Vue 3 前端监控插件。安装后可采集组件错误与渲染耗时；调用 `observer()` 后启动浏览器错误、页面访问、点击、路由切换、性能和空白屏采集。

## 安装

```bash
pnpm add @weils-monitor/vue
```

## 最小接入

```ts
// src/monitor.ts
import { createMonitor } from '@weils-monitor/vue'

export const monitor = createMonitor({
  url: '/api/monitor',
  appId: 'my-vue-app',
  projectName: 'my-vue-app',
})
```

```ts
// src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { monitor } from './monitor'

const app = createApp(App)
app.use(monitor) // 在 mount 前安装，才能记录首次组件挂载
app.mount('#app')
monitor.observer() // 启动全部浏览器采集器
```

已有 Vue Router 时，先 `app.use(router)`，再 `app.use(monitor)`；路由耗时将优先使用 Router 钩子。`observer()` 可在挂载后调用，安装阶段记录的首次组件耗时会在启动后补报。

## 按需采集与自定义事件

```ts
// 可以只启动需要的采集器；同一实例重复启动同名采集器只执行一次。
monitor.behavior.click()
monitor.behavior.pageChange()
monitor.performance.observerEntries() // 慢资源
monitor.performance.observeTTFB()

monitor.report({
  event_type: 'behavior',
  action: 'checkout_started',
  properties: { source: 'cart' },
})
```

自定义点击动作可从 HTML 属性读取：

```ts
monitor.addClickHandler('data-monitor-action')
```

```html
<button data-monitor-action="save_profile">保存</button>
```

点击时会产生 `event_type: 'behavior'`、`action: 'save_profile'` 的事件。每条规范化事件还会触发浏览器事件 `weils-monitor:report`，便于本地调试：

```ts
window.addEventListener('weils-monitor:report', (event) => {
  console.log((event as CustomEvent).detail)
})
```

## 常用配置

| 配置 | 说明 |
| --- | --- |
| `url`、`appId` | 必填，上报地址和应用标识 |
| `projectName` | 项目名，写入事件与批量包 |
| `batchSize` | 批量条数，默认 20 |
| `maxBatchBytes` | 批量包目标上限，默认 50 KB |
| `resourceDurationThreshold` | 资源耗时下限，默认 100 ms；设为 `0` 可采集全部资源 |
| `debug` | 开启规范化事件的控制台输出 |
| `replay` | 可选错误录制配置，默认关闭；与普通事件使用独立队列和上传地址 |

严重错误会触发立即冲刷；其余事件达到批量阈值或页面隐藏、退出时发送。同一页面使用一个监控实例即可，因为配置与上报队列由底层包共享。更多字段见 [`@weils-monitor/shared`](../shared/README.md)，完整演示见 [`example/vue`](../../example/vue)。
## 错误录制与上传

```ts
const monitor = createMonitor({
  url: '/api/v1/monitor',
  appId: 'my-vue-app',
  replay: {
    enabled: true,
    url: '/api/v1/records',
    onStatus: status => console.info('[replay]', status),
  },
})
```

开启后异步录制，`await monitor.replay.start()` 可等待就绪；普通错误采集仍需 `monitor.observer()` 或按需启动错误采集器。JS、Promise 和 Vue 组件错误自动关联真实 `event_id`，无需再次调用 `capture()`。默认保存错误前 30 秒、后 10 秒，输入值遮罩，未触发错误时不上传。

`monitor.replay` 提供 `start()`、`stop()`、`capture()`、`flush()`、`destroy()`、`subscribe()`。`flush()` 不截断当前错误窗口，`stop()` 提前封存已触发片段；状态中的 `uploaded` 表示后端回执已校验成功。配置关闭时 `start()` 不会重新启用录制。

本仓库 [Vue 示例](../../example/vue/README.md) 默认开启，窗口为前 10 秒、后 5 秒，仅录制与上传。完整配置见 [replay 子包](../replay/README.md)，三项目联调见 [Replay 接入与排障](../../docs/replay.md)。
