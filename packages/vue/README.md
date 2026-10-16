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

严重错误会触发立即冲刷；其余事件达到批量阈值或页面隐藏、退出时发送。同一页面使用一个监控实例即可，因为配置与上报队列由底层包共享。更多字段见 [`@weils-monitor/shared`](../shared/README.md)，完整演示见 [`example/vue`](../../example/vue)。
