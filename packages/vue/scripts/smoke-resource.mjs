import assert from 'node:assert/strict'

/* -------------------------------------------------------------------------- *
 * 浏览器环境桩：为 resource 采集提供可控的 PerformanceObserver。
 * -------------------------------------------------------------------------- */

class FakePerformanceObserver {
  static instances = []

  constructor(callback) {
    this.callback = callback
    FakePerformanceObserver.instances.push(this)
  }

  observe() {}
  disconnect() {}
  takeRecords() { return [] }
}

class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow()
fakeWindow.location = { href: 'http://localhost:3000/', pathname: '/' }
fakeWindow.screen = { width: 1280, height: 720 }
fakeWindow.innerWidth = 1280
fakeWindow.innerHeight = 720
fakeWindow.performance = globalThis.performance
fakeWindow.setTimeout = setTimeout
fakeWindow.clearTimeout = clearTimeout
fakeWindow.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0)
// 采集器用裸标识符 `new PerformanceObserver(...)`，在 Node 里会解析到真实实现，
// 因此桩需要同时挂在 window（供 `'PerformanceObserver' in window` 判断）和 globalThis 上。
fakeWindow.PerformanceObserver = FakePerformanceObserver
globalThis.PerformanceObserver = FakePerformanceObserver

const fakeDocument = new EventTarget()
fakeDocument.readyState = 'complete'
fakeDocument.referrer = ''
fakeDocument.visibilityState = 'visible'
fakeDocument.querySelector = () => ({ textContent: '', children: [], querySelectorAll: () => [] })
// @vue/runtime-dom 在模块加载时会取 document.createElement('template')，桩里提供最小实现。
fakeDocument.createElement = () => ({
  innerHTML: '',
  content: { firstChild: null },
  style: {},
  setAttribute() {},
  appendChild() {},
  removeChild() {},
  addEventListener() {},
  removeEventListener() {},
})

globalThis.window = fakeWindow
globalThis.document = fakeDocument
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Chrome/120', language: 'zh-CN' },
})

const { default: sdk, init } = await import('../dist/index.mjs')

const MONITOR_URL = 'http://localhost:3000/api/monitor'
const reports = []
fakeWindow.addEventListener('weils-monitor:report', (event) => reports.push(event.detail))

const resources = () => reports.filter((event) => event.metric_name === 'resource')
const entry = (name, duration) => ({
  name,
  initiatorType: 'script',
  duration,
  transferSize: 1024,
  encodedBodySize: 512,
  startTime: 10,
})
const emit = (entries) => {
  const observer = FakePerformanceObserver.instances.at(-1)
  assert.ok(observer, 'observerEntries 应创建 PerformanceObserver')
  observer.callback({ getEntries: () => entries })
}
const options = (threshold) => ({
  url: MONITOR_URL,
  appId: 'resource-smoke',
  ...(threshold === undefined ? {} : { resourceDurationThreshold: threshold }),
})

// 1. 默认阈值 100ms
init(options())
sdk.performance.observerEntries()
emit([
  entry('http://localhost:3000/a.js', 5),
  entry('http://localhost:3000/b.js', 99.9),
  entry('http://localhost:3000/c.js', 100),
  entry('http://localhost:3000/d.js', 500),
])
assert.equal(resources().length, 2, '默认阈值 100ms：只上报耗时达到阈值的资源')
assert.deepEqual(resources().map((event) => event.duration), [100, 500])
assert.equal(resources()[0].event_type, 'performance')
assert.equal(resources()[0].initiator_type, 'script')
assert.equal(resources()[0].transfer_size, 1024)
assert.equal(resources()[0].encoded_body_size, 512)
assert.equal(resources()[0].start_time, 10)

// 2. 阈值 0 表示不过滤
init(options(0))
emit([5, 99.9, 100, 500].map((duration, index) =>
  entry(`http://localhost:3000/e${index}.js`, duration)))
assert.equal(resources().length, 6, '阈值 0 时应全部上报')

// 3. 自定义阈值 300ms
init(options(300))
emit([
  entry('http://localhost:3000/f.js', 299),
  entry('http://localhost:3000/g.js', 300),
])
assert.equal(resources().length, 7, '阈值 300ms：只有 300ms 的资源上报')
assert.equal(resources().at(-1).duration, 300)

// 4. 非法阈值回落到默认 100ms
init(options(Number.NaN))
emit([
  entry('http://localhost:3000/h.js', 99),
  entry('http://localhost:3000/i.js', 101),
])
assert.equal(resources().length, 8, '非法阈值应回落到默认 100ms')
assert.equal(resources().at(-1).duration, 101)

// 5. 监控上报端点自身永远排除，即使超过阈值
init(options(0))
emit([entry('http://localhost:3000/api/monitor?data=probe', 999)])
assert.equal(resources().length, 8, '上报端点自身不应产生 resource 事件')

console.log(
  '✅ resource 阈值冒烟验证通过：默认 100ms、阈值 0 不过滤、自定义阈值、'
  + '非法值回落、上报端点排除',
)
