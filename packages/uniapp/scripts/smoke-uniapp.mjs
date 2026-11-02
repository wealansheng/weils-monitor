/**
 * uni-app / mp-weixin 适配冒烟验证（不依赖真实小程序运行时）。
 * 通过注入 fake uni/wx 运行时覆盖上下文、错误、路由、请求、性能、稳定性与上报链路。
 *
 * 运行前需要先构建：pnpm build
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { clearCache, config, getCacheSize } from '@weils-monitor/shared'
import { REPORT_EVENT, createMonitor } from '../dist/index.mjs'
import { sanitizeQueryObject, sanitizeQueryString } from '@weils-monitor/core/reporter'

const distPath = fileURLToPath(new URL('../dist/index.mjs', import.meta.url))
if (!existsSync(distPath)) {
  console.error(`缺少 uniapp 构建产物：${distPath}\n请先执行 pnpm build`)
  process.exit(1)
}

const MONITOR_URL = 'https://monitor.example.com/api/v1/monitor'

const resetShared = () => {
  clearCache()
  Object.assign(config, {
    url: MONITOR_URL,
    appId: 'uniapp-smoke',
    appKey: '',
    projectName: 'uniapp-smoke',
    userId: 'u-1',
    release: 'rel-1',
    environment: 'test',
    sessionId: 'session-smoke',
    traceId: 'trace-1',
    batchSize: 1000,
    maxBatchBytes: 1024 * 1024,
    sampleRate: 1,
    debug: false,
  })
  config.replay = undefined
}

const page = (route, options = {}, fullPath = `/${route}`) => ({
  route,
  options,
  $page: { route, fullPath, options },
})

const systemInfo = {
  brand: 'Apple',
  model: 'iPhone 14',
  system: 'iOS 16.0',
  platform: 'ios',
  language: 'zh_CN',
  version: '8.0.5',
  SDKVersion: '3.0.0',
  screenWidth: 390,
  screenHeight: 844,
  windowWidth: 390,
  windowHeight: 700,
}

const createHarness = ({ pages, clock = 1000, requestStatus = 'success' } = {}) => {
  const state = {
    interceptors: new Map(),
    requests: [],
    appHide: [],
    emitted: [],
    errors: [],
    rejections: [],
    notFound: [],
    memory: [],
    perfObserver: undefined,
    network: undefined,
    clock,
    requestStatus,
  }
  let currentPages = pages ?? []

  const uni = {
    getSystemInfoSync: () => systemInfo,
    getNetworkType: ({ success }) => success?.({ networkType: 'wifi' }),
    onNetworkStatusChange: (callback) => { state.network = callback },
    onAppHide: (callback) => { state.appHide.push(callback) },
    $emit: (_name, payload) => { state.emitted.push(payload) },
    addInterceptor: (api, interceptor) => {
      const list = state.interceptors.get(api) ?? []
      list.push(interceptor)
      state.interceptors.set(api, list)
    },
    request: (options) => {
      state.requests.push(options)
      Promise.resolve().then(() => {
        if (state.requestStatus === 'fail') options.fail?.({ errMsg: 'request:fail' })
        else options.success?.({ statusCode: 200 })
        options.complete?.({})
      })
    },
  }

  const wx = {
    getPerformance: () => ({
      createObserver: (...args) => {
        state.perfObserver = { callback: args[0], args }
        return { observe: (observeOptions) => { state.perfObserve = observeOptions }, disconnect() {} }
      },
    }),
    getLaunchOptionsSync: () => ({ path: currentPages[0]?.route, query: {} }),
    onError: (callback) => { state.errors.push(callback) },
    onUnhandledRejection: (callback) => { state.rejections.push(callback) },
    onPageNotFound: (callback) => { state.notFound.push(callback) },
    onMemoryWarning: (callback) => { state.memory.push(callback) },
    onAppHide: (callback) => { state.appHide.push(callback) },
  }

  const runtime = {
    uni,
    wx,
    getCurrentPages: () => currentPages,
    now: () => state.clock,
  }

  return {
    state,
    runtime,
    setPages: (next) => { currentPages = next },
    advance: (ms) => { state.clock += ms },
    emitted: (type) => state.emitted.filter((event) => event.event_type === type),
    action: (action) => state.emitted.filter((event) => event.action === action),
    metric: (name) => state.emitted.filter((event) => event.metric_name === name),
    error: (name) => state.emitted.filter((event) => event.error_type === name),
    invoke: (api, args) => {
      const interceptors = state.interceptors.get(api) ?? []
      assert.ok(interceptors.length > 0, `应注册 ${api} 拦截器`)
      let payload = args
      for (const interceptor of interceptors) {
        if (interceptor.invoke) payload = interceptor.invoke(payload) ?? payload
      }
      return payload
    },
    hide: () => {
      assert.ok(state.appHide.length > 0, '应注册 onAppHide 冲刷')
      for (const callback of state.appHide) callback()
    },
    lastRequest: () => state.requests.at(-1),
    parseRequest: (options) => JSON.parse(String(options.data)),
  }
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 10))

const createApp = (previous) => {
  const app = { config: { errorHandler: previous }, mount() {}, provide() {} }
  return app
}

/* -------------------------------------------------------------------------- *
 * 1. 上下文、错误、路由、请求、性能、内存与批量发送
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const harness = createHarness({
    pages: [page('pages/index/index', { tab: '1', token: 'secret' }, '/pages/index/index?tab=1&token=secret')],
  })

  const monitor = createMonitor({
    runtime: harness.runtime,
    url: MONITOR_URL,
    appId: 'uniapp-smoke',
    projectName: 'uniapp-smoke',
    userId: 'u-1',
    release: 'rel-1',
    environment: 'test',
    sessionId: 'session-smoke',
    batchSize: 1000,
    maxBatchBytes: 1024 * 1024,
  })

  let previousCalled = 0
  const app = createApp(() => { previousCalled += 1 })
  monitor.install(app)
  monitor.observer()

  // 初始 page_view + 上下文
  const initialView = harness.action('page_view')[0]
  assert.ok(initialView, '初始应上报 page_view')
  assert.equal(initialView.page_url, '/pages/index/index?tab=1', '敏感 query 必须移除')
  assert.equal(initialView.route, '/pages/index/index')
  assert.equal(initialView.app_id, 'uniapp-smoke')
  assert.equal(initialView.projectName, 'uniapp-smoke')
  assert.equal(initialView.user_id, 'u-1')
  assert.equal(initialView.release, 'rel-1')
  assert.equal(initialView.environment, 'test')
  assert.equal(initialView.session_id, 'session-smoke')
  assert.equal(initialView.trace_id, 'trace-1')
  assert.equal(initialView.sdk_version, '1.0.1')
  assert.equal(initialView.device.type, 'mobile')
  assert.equal(initialView.device.model, 'Apple iPhone 14')
  assert.equal(initialView.browser.name, 'WeChat')
  assert.equal(initialView.browser.version, '8.0.5')
  assert.equal(initialView.os.name, 'iOS')
  assert.equal(initialView.os.version, '16.0')
  assert.equal(initialView.network, 'wifi')
  assert.equal(initialView.locale, 'zh-CN')
  assert.equal(initialView.screen, '390x844')
  assert.equal(initialView.viewport, '390x700')

  // Vue 3 框架错误：保留原 handler
  const stackError = new Error('组件渲染失败')
  stackError.stack = 'Error: 组件渲染失败\n    at render (https://servicewechat.com/wx123/pages/index/index.js:12:34)'
  app.config.errorHandler(stackError, { $options: { name: 'HomePage' } }, 'render')
  const frameworkError = harness.error('framework_error').at(-1)
  assert.ok(frameworkError, '应上报 framework_error')
  assert.equal(frameworkError.message, '组件渲染失败')
  assert.equal(frameworkError.component, 'HomePage')
  assert.equal(frameworkError.component_stack, 'render')
  assert.equal(frameworkError.stack_frames.length, 1, '应解析调用帧')
  assert.equal(previousCalled, 1, '应用原有 errorHandler 必须继续执行')

  // 小程序 JS 错误
  harness.state.errors[0]('Error: mini boom\n    at render (https://servicewechat.com/wx123/pages/index/index.js:12:34)')
  const jsError = harness.error('js_error').at(-1)
  assert.ok(jsError, '应上报 js_error')
  assert.equal(jsError.message, 'mini boom')
  assert.equal(jsError.name, 'Error')
  assert.equal(jsError.tags.source, 'onError')
  assert.equal(jsError.filename, 'https://servicewechat.com/wx123/pages/index/index.js')
  assert.equal(jsError.lineno, 12)
  assert.equal(jsError.colno, 34)

  // Promise 错误
  harness.state.rejections[0]({ reason: new Error('promise boom') })
  const promiseError = harness.error('promise_error').at(-1)
  assert.ok(promiseError, '应上报 promise_error')
  assert.equal(promiseError.message, 'promise boom')
  assert.equal(promiseError.reason, 'promise boom')

  // 页面不存在
  harness.state.notFound[0]({ path: 'pages/missing/index', query: { a: '1' }, isEntryPage: true })
  const notFound = harness.error('page_not_found').at(-1)
  assert.ok(notFound, '应上报 page_not_found')
  assert.equal(notFound.url, 'pages/missing/index')
  assert.equal(notFound.tags.source, 'onPageNotFound')
  assert.equal(notFound.extra.is_entry_page, true)

  // 内存告警
  harness.state.memory[0]()
  const memory = harness.emitted('stability').at(-1)
  assert.ok(memory, '应上报 memory_warning')
  assert.equal(memory.issue_type, 'memory_warning')

  // 路由成功：route_change + page_view
  const routeArgs = harness.invoke('navigateTo', {
    url: '/pages/detail/detail?from=list&token=x',
    success: () => { routeArgs.__successCalled = true },
  })
  harness.advance(120)
  harness.setPages([page('pages/index/index'), page('pages/detail/detail', {}, '/pages/detail/detail?from=list')])
  routeArgs.success({ errMsg: 'navigateTo:ok' })
  const routeChange = harness.action('route_change').at(-1)
  assert.ok(routeChange, '应上报 route_change')
  assert.equal(routeChange.from_route, '/pages/index/index?tab=1')
  assert.equal(routeChange.to_route, '/pages/detail/detail?from=list')
  assert.equal(routeChange.route, '/pages/detail/detail')
  assert.equal(routeChange.duration, 120)
  assert.equal(routeChange.category, 'navigation')
  assert.equal(routeArgs.__successCalled, true, '用户 success 回调必须继续执行')
  const detailView = harness.action('page_view').at(-1)
  assert.equal(detailView.page_url, '/pages/detail/detail?from=list')
  assert.equal(detailView.referrer, '/pages/index/index?tab=1')

  // 同路由 1 秒内不重复 page_view
  const viewsBefore = harness.action('page_view').length
  const repeatArgs = harness.invoke('navigateTo', { url: '/pages/detail/detail?from=list' })
  harness.advance(200)
  repeatArgs.success({})
  assert.equal(harness.action('page_view').length, viewsBefore, '1 秒内同路由不重复 page_view')

  // 路由失败：只上报 route_change
  const failedArgs = harness.invoke('redirectTo', { url: '/pages/error/error' })
  harness.advance(30)
  failedArgs.fail({ errMsg: 'redirectTo:fail' })
  const failedChange = harness.action('route_change').at(-1)
  assert.equal(failedChange.from_route, '/pages/detail/detail?from=list', '失败导航不改变当前页面')
  assert.equal(failedChange.page_url, '/pages/detail/detail?from=list')
  assert.equal(failedChange.to_route, '/pages/error/error')
  assert.deepEqual(failedChange.properties, { success: false, message: 'redirectTo:fail' })
  assert.notEqual(harness.action('page_view').at(-1).page_url, '/pages/error/error')

  // uni.request 成功
  const requestArgs = harness.invoke('request', {
    url: 'https://api.example.com/orders?token=abc&page=2',
    method: 'post',
  })
  harness.advance(80)
  requestArgs.success({ statusCode: 200 })
  const requestEvent = harness.emitted('request').at(-1)
  assert.ok(requestEvent, '应上报 request 事件')
  assert.equal(requestEvent.url, 'https://api.example.com/orders?page=2')
  assert.equal(requestEvent.method, 'POST')
  assert.equal(requestEvent.status_code, 200)
  assert.equal(requestEvent.duration, 80)
  assert.equal(requestEvent.success, true)

  // 监控端点自身请求跳过
  const requestsBefore = harness.emitted('request').length
  const selfArgs = harness.invoke('request', { url: MONITOR_URL, method: 'POST' })
  assert.equal(selfArgs.__weilsRequest, undefined, '监控端点不应被包裹')
  selfArgs.success?.({ statusCode: 200 })
  assert.equal(harness.emitted('request').length, requestsBefore)

  // uni.request 失败
  const failArgs = harness.invoke('request', { url: 'https://api.example.com/fail', method: 'GET' })
  harness.advance(20)
  failArgs.fail({ errMsg: 'request:fail' })
  const failedRequest = harness.emitted('request').at(-1)
  assert.equal(failedRequest.url, 'https://api.example.com/fail')
  assert.equal(failedRequest.status_code, 0)
  assert.equal(failedRequest.success, false)

  // 小程序性能指标
  assert.ok(harness.state.perfObserver, '应创建 wx.getPerformance 观察者')
  harness.state.perfObserver.callback({ getEntries: () => [
    { entryType: 'navigation', name: 'pages/index/index', startTime: 0, duration: 500 },
    { entryType: 'render', name: 'firstRender', startTime: 0, duration: 300 },
    { entryType: 'script', name: 'app.js', startTime: 10, duration: 20 },
    { entryType: 'loadPackage', name: 'main', startTime: 5, duration: 50 },
  ] })
  assert.equal(harness.metric('mp_navigation')[0].value, 500)
  assert.equal(harness.metric('mp_navigation')[0].rating, 'good')
  assert.equal(harness.metric('mp_render')[0].value, 300)
  assert.equal(harness.metric('mp_script')[0].duration, 20)
  assert.equal(harness.metric('mp_loadPackage').length, 1)
  assert.ok(harness.metric('mp_launch').length >= 1, '应上报 mp_launch')

  // 手动埋点
  monitor.behavior.track('checkout_started', { source: 'cart' })
  const tracked = harness.action('checkout_started').at(-1)
  assert.deepEqual(tracked.properties, { source: 'cart' })

  // 等待严重错误的立即 flush 结束，避免 hide 复用在途的 flushingPromise
  await flushMicrotasks()

  // onAppHide 冲刷：信封字段完整
  harness.hide()
  await flushMicrotasks()
  const sent = harness.lastRequest()
  assert.ok(sent, 'onAppHide 应触发 uni.request')
  assert.equal(sent.url, MONITOR_URL)
  assert.equal(sent.method, 'POST')
  assert.equal(sent.header['content-type'], 'application/json')
  const envelope = harness.parseRequest(sent)
  assert.equal(envelope.app_id, 'uniapp-smoke')
  assert.equal(envelope.projectName, 'uniapp-smoke')
  assert.equal(envelope.sdk_version, '1.0.1')
  assert.equal(typeof envelope.send_time, 'number')
  assert.equal(envelope.sample_rate, 1)
  assert.ok(envelope.events.length > 0)
  assert.ok(envelope.events.some((event) => event.action === 'checkout_started'))
  assert.ok(envelope.events.some((event) => event.event_type === 'request'))
  for (const event of envelope.events) {
    assert.match(event.event_id, /^[0-9a-f-]{36}$/i)
    assert.equal(typeof event.timestamp, 'number')
    assert.equal(event.app_id, 'uniapp-smoke')
  }
  assert.equal(getCacheSize(), 0, '冲刷成功后队列应为空')

  // replay 在 mp 端是安全的 no-op
  await monitor.replay.start()
  await monitor.replay.flush()
  assert.equal(typeof monitor.replay.subscribe(() => {}), 'function')
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(monitor.addClickHandler('data-monitor-action'), monitor, 'addClickHandler 返回自身以兼容链式调用')
  } finally {
    console.warn = originalWarn
  }
  assert.equal(REPORT_EVENT, 'weils-monitor:report')
}

/* -------------------------------------------------------------------------- *
 * 2. Vue 2 构造器、请求耗时阈值、性能开关
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const harness = createHarness({ pages: [page('pages/vue2/index/index')] })
  const monitor = createMonitor({
    runtime: harness.runtime,
    url: MONITOR_URL,
    appId: 'vue2-smoke',
    projectName: 'vue2-smoke',
    batchSize: 1000,
    requestDurationThreshold: 100,
  })

  let previousCalled = 0
  const Vue = {
    version: '2.7.0',
    config: { errorHandler: () => { previousCalled += 1 } },
    mixin() {},
  }
  monitor.install(Vue)
  monitor.observer()
  Vue.config.errorHandler(new Error('vue2 boom'), { $options: { name: 'Vue2Page' } }, 'created')
  const error = harness.error('framework_error').at(-1)
  assert.ok(error, 'Vue 2 构造器也应安装 errorHandler')
  assert.equal(error.component, 'Vue2Page')
  assert.equal(previousCalled, 1)

  const fast = harness.invoke('request', { url: 'https://api.example.com/fast', method: 'GET' })
  harness.advance(50)
  fast.success({ statusCode: 200 })
  assert.equal(harness.emitted('request').length, 0, '低于 requestDurationThreshold 不上报')

  const slow = harness.invoke('request', { url: 'https://api.example.com/slow', method: 'GET' })
  harness.advance(150)
  slow.success({ statusCode: 200 })
  assert.equal(harness.emitted('request').length, 1, '达到阈值应上报')

  const noPerfHarness = createHarness({ pages: [page('pages/no-perf/index/index')] })
  const noPerf = createMonitor({
    runtime: noPerfHarness.runtime,
    url: MONITOR_URL,
    appId: 'no-perf',
    performance: false,
  })
  noPerf.observer()
  assert.equal(noPerfHarness.metric('mp_launch').length, 0, '关闭 performance 后不上报启动指标')
  assert.equal(noPerfHarness.state.perfObserver, undefined)
}

/* -------------------------------------------------------------------------- *
 * 3. 缺失运行时、批量阈值、TextEncoder 回退与发送失败重排
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const minimal = createHarness({ pages: [page('pages/minimal/index/index')], clock: 1 })
  const monitor = createMonitor({
    runtime: {
      uni: { $emit: minimal.runtime.uni.$emit },
      wx: {},
      getCurrentPages: () => [page('pages/minimal/index/index')],
      now: () => 1,
    },
    url: MONITOR_URL,
    appId: 'minimal',
    batchSize: 1,
  })
  monitor.observer()
  assert.equal(minimal.metric('mp_launch').length, 1, '无 wx.getPerformance 时应回退上报 mp_launch')
  monitor.behavior.track('manual', { ok: true })
  await flushMicrotasks()
}

{
  resetShared()
  const harness = createHarness({ pages: [page('pages/cache/index/index')] })
  const monitor = createMonitor({
    runtime: harness.runtime,
    url: MONITOR_URL,
    appId: 'cache-smoke',
    batchSize: 1,
  })

  const originalTextEncoder = globalThis.TextEncoder
  // @ts-ignore 冒烟中模拟小程序缺失 TextEncoder
  delete globalThis.TextEncoder
  try {
    monitor.behavior.track('without-text-encoder', { payload: '中文内容' })
    await flushMicrotasks()
    const sent = harness.lastRequest()
    assert.ok(sent, '缺少 TextEncoder 时仍应按体积/条数发送')
    const envelope = harness.parseRequest(sent)
    assert.equal(envelope.events[0].action, 'without-text-encoder')
  } finally {
    if (originalTextEncoder) globalThis.TextEncoder = originalTextEncoder
  }
}

{
  resetShared()
  const harness = createHarness({
    pages: [page('pages/fail/index/index')],
    requestStatus: 'fail',
  })
  const monitor = createMonitor({
    runtime: harness.runtime,
    url: MONITOR_URL,
    appId: 'fail-smoke',
    batchSize: 1,
  })
  monitor.behavior.track('will-retry')
  await flushMicrotasks()
  assert.ok(getCacheSize() > 0, '发送失败的事件应重新入队')
}

/* -------------------------------------------------------------------------- *
 * 4. EntryList 宿主契约、数组兼容、异常返回与性能去重
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const harness = createHarness({ pages: [page('pages/performance/index')] })
  const monitor = createMonitor({ runtime: harness.runtime, url: MONITOR_URL, appId: 'perf-contract' })
  monitor.performance.observeLaunch()
  const { callback, args } = harness.state.perfObserver
  assert.equal(args.length, 1, 'createObserver 只接收回调，观察类型由 observe 配置')
  assert.deepEqual(harness.state.perfObserve.entryTypes, ['navigation', 'render', 'script', 'loadPackage'])

  const entry = { entryType: 'render', name: 'firstRender', startTime: 10, duration: 123 }
  const list = { entries: [entry], getEntries() { return this.entries } }
  callback(list)
  callback(list)
  callback([entry, { entryType: 'script', name: 'array-fallback', startTime: 20, duration: 5 }])
  assert.equal(harness.metric('mp_render').length, 1, 'EntryList 和数组使用相同去重集合')
  assert.equal(harness.metric('mp_render')[0].value, 123)
  assert.equal(harness.metric('mp_script').length, 1, '仍兼容数组形式的运行时')
  const count = harness.emitted('performance').length
  for (const invalid of [undefined, null, {}, { getEntries: 1 }, { getEntries: () => null },
    { getEntries: () => ({}) }, { getEntries() { throw new Error('broken host') } }]) {
    assert.doesNotThrow(() => callback(invalid), '无效 EntryList 不影响业务')
  }
  callback({ getEntries: () => [null, undefined, 'invalid', {},
    { entryType: 'render', name: 'negative', duration: -1 },
    { entryType: 'render', name: 'infinite', duration: Infinity }] })
  assert.equal(harness.emitted('performance').length, count, '无效条目不上报')
  assert.equal(harness.metric('mp_launch').length, 1)
}

/* -------------------------------------------------------------------------- *
 * 5. query 对象和字符串使用同一规则，页面不存在事件不泄露参数
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const query = Object.create({ inherited: 'skip' })
  Object.assign(query, { tab: 'orders', page: 2, token: 'secret', PASSWORD: 'secret',
    '%70hone': '13800000000', Email: 'private@example.com', '%ZZ': 'keep' })
  Object.defineProperty(query, 'hidden', { value: 'skip', enumerable: false })
  Object.freeze(query)
  const expected = { tab: 'orders', page: 2, '%ZZ': 'keep' }
  assert.deepEqual(sanitizeQueryObject(query), expected)
  assert.deepEqual(sanitizeQueryObject(), {})
  assert.deepEqual(sanitizeQueryObject(null), {})
  assert.equal(sanitizeQueryString('token=x&PASSWORD=x&%70hone=x&Email=x&tab=orders&%ZZ=keep'),
    'tab=orders&%ZZ=keep')
  assert.equal(query.token, 'secret', '脱敏不能修改原始对象')

  const harness = createHarness({ pages: [page('pages/query/index')] })
  const monitor = createMonitor({ runtime: harness.runtime, url: MONITOR_URL, appId: 'query-contract' })
  monitor.error.error()
  harness.state.notFound[0]({ path: 'pages/missing/index', query })
  const event = harness.error('page_not_found').at(-1)
  assert.deepEqual(event.extra.query, expected)
  assert.notEqual(event.extra.query, query)
  harness.state.notFound[0]({ path: 'pages/missing/index' })
  assert.deepEqual(harness.error('page_not_found').at(-1).extra.query, {})
  await flushMicrotasks()
  const sent = harness.state.requests.flatMap(request => harness.parseRequest(request).events)
  assert.ok(sent.some(event => event.error_type === 'page_not_found'))
  assert.ok(sent.filter(event => event.error_type === 'page_not_found')
    .every(event => !Object.keys(event.extra.query).some(key => /token|password|phone|email/i.test(key))))
}

/* -------------------------------------------------------------------------- *
 * 6. 自动 PV 与 routeChange 开关独立；手动 PV 和 runtime 去重
 * -------------------------------------------------------------------------- */
for (const routeChange of [false, true]) {
  for (const pageView of [false, true]) {
    resetShared()
    const harness = createHarness({ pages: [page('pages/options/home')] })
    const monitor = createMonitor({ runtime: harness.runtime, url: MONITOR_URL, appId: 'pv-options',
      routeChange, pageView, performance: false })
    monitor.observer()
    assert.equal(harness.action('page_view').length, Number(pageView), '初始 PV 服从开关')
    const navigation = routeChange || pageView
      ? harness.invoke('navigateTo', { url: '/pages/options/detail' }) : undefined
    harness.setPages([page('pages/options/home'), page('pages/options/detail')])
    navigation?.success({})
    assert.equal(harness.action('route_change').length, Number(routeChange))
    assert.equal(harness.action('page_view').length, Number(pageView) * 2, '导航 PV 服从开关')
    monitor.behavior.trackPageView()
    assert.equal(harness.action('page_view').length, pageView ? 2 : 1, '手动 PV 可用且保留一秒去重')
    monitor.behavior.trackPageView()
    assert.equal(harness.action('page_view').length, pageView ? 2 : 1)
    harness.advance(1000)
    monitor.behavior.trackPageView()
    assert.equal(harness.action('page_view').length, pageView ? 3 : 2, '一秒后可以再次补报')
  }
}

{
  resetShared()
  const first = createHarness({ pages: [page('pages/isolation/shared')] })
  const second = createHarness({ pages: [page('pages/isolation/shared')] })
  const makeMonitor = runtime => createMonitor({ runtime, url: MONITOR_URL, appId: 'route-isolation' })
  const firstMonitor = makeMonitor(first.runtime)
  const secondMonitor = makeMonitor(second.runtime)
  firstMonitor.behavior.pv()
  secondMonitor.behavior.pv()
  makeMonitor(first.runtime).behavior.pv()
  assert.equal(first.action('page_view').length, 1, '同一 runtime 共享 PV 去重')
  assert.equal(second.action('page_view').length, 1, '不同 runtime 的相同路径不能互相去重')
  first.setPages([page('pages/isolation/changed')])
  firstMonitor.behavior.track('first')
  secondMonitor.behavior.track('second')
  assert.equal(first.action('first')[0].referrer, '/pages/isolation/shared')
  assert.equal(second.action('second')[0].route, '/pages/isolation/shared')
  assert.equal(second.action('second')[0].referrer, undefined, '路由历史不能跨 runtime 串扰')
}

/* -------------------------------------------------------------------------- *
 * 7. 实时页面归属、空栈缓存、导航回调与页面栈更新的时序
 * -------------------------------------------------------------------------- */
{
  resetShared()
  const home = page('pages/live/home')
  const detail = page('pages/live/detail')
  const third = page('pages/live/third')
  const harness = createHarness({ pages: [home] })
  harness.runtime.wx.getLaunchOptionsSync = () => ({ path: home.route })
  const monitor = createMonitor({ runtime: harness.runtime, url: MONITOR_URL, appId: 'live-route',
    performance: false })
  monitor.observer()
  harness.setPages([home, detail]) // 模拟未经过拦截器的 navigator 跳转
  monitor.behavior.track('native-navigation')
  monitor.behavior.track('same-page')
  for (const action of ['native-navigation', 'same-page']) {
    assert.equal(harness.action(action)[0].page_url, '/pages/live/detail')
    assert.equal(harness.action(action)[0].referrer, '/pages/live/home')
  }
  assert.equal(harness.action('page_view').length, 1, '校准归属本身不自动补 PV')

  const request = harness.invoke('request', { url: 'https://api.example.com/live' })
  harness.setPages([home, detail, third])
  request.success({ statusCode: 200 })
  assert.equal(harness.emitted('request').at(-1).route, '/pages/live/third', '请求按完成时页面归属')
  assert.equal(harness.emitted('request').at(-1).referrer, '/pages/live/detail')
  harness.setPages([page('pages/live/error')])
  harness.state.errors[0]('Error: live page')
  assert.equal(harness.error('js_error').at(-1).route, '/pages/live/error')
  assert.equal(harness.error('js_error').at(-1).referrer, '/pages/live/third')
  harness.setPages([home, detail, third])
  monitor.behavior.trackPageView()
  assert.equal(harness.action('page_view').at(-1).page_url, '/pages/live/third')

  harness.setPages([])
  monitor.behavior.track('empty-stack')
  assert.equal(harness.action('empty-stack')[0].route, '/pages/live/third', '空栈不能退回启动页')
  const readPages = harness.runtime.getCurrentPages
  harness.runtime.getCurrentPages = () => { throw new Error('temporarily unavailable') }
  monitor.behavior.track('broken-stack')
  assert.equal(harness.action('broken-stack')[0].route, '/pages/live/third')
  harness.runtime.getCurrentPages = readPages
  harness.setPages([home, detail, third])

  const back = harness.invoke('navigateBack', { delta: 2 })
  back.success({}) // 成功回调早于页面栈更新
  const backEvent = harness.action('route_change').at(-1)
  assert.equal(backEvent.to_route, '/pages/live/home', 'delta=2 从调用前快照推导目标')
  assert.equal(backEvent.page_url, '/pages/live/home')
  assert.equal(backEvent.referrer, '/pages/live/third')
  monitor.behavior.track('before-stack-update')
  assert.equal(harness.action('before-stack-update')[0].route, '/pages/live/third', '不提前提交目标页')
  harness.setPages([home])
  monitor.behavior.track('after-stack-update')
  assert.equal(harness.action('after-stack-update')[0].route, '/pages/live/home')
  assert.equal(harness.action('after-stack-update')[0].referrer, '/pages/live/third')

  const failed = harness.invoke('redirectTo', { url: '/pages/live/missing?token=private&tab=1' })
  failed.fail({ errMsg: 'redirectTo:fail' })
  const failure = harness.action('route_change').at(-1)
  assert.equal(failure.page_url, '/pages/live/home')
  assert.equal(failure.route, '/pages/live/home')
  assert.equal(failure.to_route, '/pages/live/missing?tab=1')
  assert.equal(failure.referrer, '/pages/live/third')

  const forward = harness.invoke('navigateTo', { url: '/pages/live/detail' })
  forward.success({})
  assert.equal(harness.action('route_change').at(-1).page_url, '/pages/live/detail')
  monitor.behavior.track('forward-before-stack-update')
  assert.equal(harness.action('forward-before-stack-update')[0].route, '/pages/live/home')
  assert.equal(harness.action('forward-before-stack-update')[0].referrer, '/pages/live/third')
  harness.setPages([home, detail])
  monitor.behavior.track('forward-after-stack-update')
  assert.equal(harness.action('forward-after-stack-update')[0].referrer, '/pages/live/home')

  const immediateBack = harness.invoke('navigateBack', {})
  harness.setPages([home])
  immediateBack.success({})
  assert.equal(harness.action('route_change').at(-1).to_route, '/pages/live/home')
  assert.equal(harness.action('route_change').at(-1).referrer, '/pages/live/detail')
  monitor.behavior.track('back-after-stack-update')
  assert.equal(harness.action('back-after-stack-update')[0].referrer, '/pages/live/detail')

  harness.setPages([home, detail, third])
  monitor.behavior.track('before-live-back')
  const liveBack = harness.invoke('navigateBack', { delta: 2 })
  harness.setPages([page('pages/live/home', {}, '/pages/live/home?tab=updated')])
  liveBack.success({})
  assert.equal(harness.action('route_change').at(-1).to_route, '/pages/live/home?tab=updated',
    '成功后真实页面栈优先于返回目标快照')
  await flushMicrotasks()
}

{
  resetShared()
  const harness = createHarness()
  harness.runtime.wx.getLaunchOptionsSync = () => ({ path: 'pages/launch/index', query: { tab: '1', token: 'secret' } })
  const monitor = createMonitor({ runtime: harness.runtime, url: MONITOR_URL, appId: 'launch-fallback' })
  monitor.behavior.track('launch-fallback')
  assert.equal(harness.action('launch-fallback')[0].page_url, '/pages/launch/index?tab=1')
  harness.setPages([page('pages/launch/next')])
  monitor.behavior.track('real-page')
  assert.equal(harness.action('real-page')[0].referrer, '/pages/launch/index?tab=1')
  harness.setPages([])
  monitor.behavior.track('keep-real-page')
  assert.equal(harness.action('keep-real-page')[0].route, '/pages/launch/next')
}

/* -------------------------------------------------------------------------- *
 * 8. 包体守卫：uniapp 产物不得引入浏览器回放依赖
 * -------------------------------------------------------------------------- */
{
  const code = readFileSync(distPath, 'utf8')
  assert.ok(!code.includes('@weils-monitor/replay'), 'uniapp 产物不能引用 replay 包')
  assert.ok(!code.toLowerCase().includes('rrweb'), 'uniapp 产物不能包含 rrweb')
  // uni-app 的 Vite 注入插件依赖裸标识符 uni/wx；改成 globalThis.uni 会导致小程序拿不到运行时。
  assert.ok(code.includes('typeof uni'), '产物必须保留裸 uni 标识符供 uni-app 注入')
  assert.ok(code.includes('typeof wx'), '产物必须保留裸 wx 标识符供 uni-app 注入')

  const require = createRequire(import.meta.url)
  const cjs = require('../dist/index.cjs')
  assert.equal(typeof cjs.createMonitor, 'function', 'CJS 入口必须可用')
  assert.equal(cjs.REPORT_EVENT, 'weils-monitor:report')
}

console.log('✅ uni-app / mp-weixin 冒烟验证通过：上下文、错误、路由、请求、性能、稳定性、批量上报与包体守卫')
