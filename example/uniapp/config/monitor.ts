import { createMonitor, REPORT_EVENT } from '@weils-monitor/uniapp'

/**
 * 小程序端 url 必须是绝对 HTTPS 地址，并在微信公众平台加入 request 合法域名。
 * 本地调试可在微信开发者工具中勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
 */
export const monitor = createMonitor({
  url: 'http://localhost:8899/api/v1/monitor',
  appId: 'uniapp-example',
  projectName: 'weils-monitor-uniapp-example',
  release: 'local',
  userId: 'visitor',
  batchSize: 20,
  maxBatchBytes: 50 * 1024,
  sampleRate: 1,
  debug: false,
  // 小程序端没有 DOM，Replay / 全局点击 / 空白屏均不可用；
  // 需要这些能力时请在 H5 端使用 @weils-monitor/vue。
})

/** 演示请求接口，替换为真实合法域名即可看到 request 事件。 */
export const demoRequestUrl = 'https://example.com/api/ping'

export { REPORT_EVENT }
