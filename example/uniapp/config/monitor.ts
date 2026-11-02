import { createMonitor, REPORT_EVENT } from '@weils-monitor/uniapp'

/**
 * 小程序端 url 必须是绝对 HTTPS 地址，并在微信公众平台加入 request 合法域名。
 * 本地调试可在微信开发者工具中勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
 */
export const monitor = createMonitor({
  url: 'http://127.0.0.1:8888/api/v1/monitor',
  appId: 'uniapp-example',
  projectName: 'weils-monitor-uniapp-example',
  release: 'local',
  userId: 'visitor',
  // 验收普通事件时可临时改为 1，立即发送；错误事件本身就会立即发送。
  batchSize: 20,
  maxBatchBytes: 50 * 1024,
  sampleRate: 1,
  // 演示开启 debug：控制台会打印每条规范化事件和上报结果；生产环境请设为 false。
  debug: true,
  // 小程序端没有 DOM，Replay / 全局点击 / 空白屏均不可用；
  // 需要这些能力时请在 H5 端使用 @weils-monitor/vue。
})

/**
 * 演示请求接口：使用后端健康检查（GET /），避免和监控上报端点相同而被 request 采集跳过。
 * 替换为真实接口时，请保持完整 URL。
 */
export const demoRequestUrl = 'http://127.0.0.1:8888/'

export { REPORT_EVENT }
