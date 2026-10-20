import assert from 'node:assert/strict'

/* -------------------------------------------------------------------------- *
 * 浏览器环境桩：与 packages/vue/scripts/smoke-timing.mjs 保持同一思路，
 * 让运行时模块可以在 Node 里加载并观察我们派发的 weils-monitor:report 事件。
 * -------------------------------------------------------------------------- */

class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow()
fakeWindow.location = { href: 'http://localhost:3000/', pathname: '/', search: '' }
fakeWindow.screen = { width: 1280, height: 720 }
fakeWindow.innerWidth = 1280
fakeWindow.innerHeight = 720
fakeWindow.performance = globalThis.performance
fakeWindow.setTimeout = setTimeout
fakeWindow.clearTimeout = clearTimeout
fakeWindow.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0)

const fakeDocument = new EventTarget()
fakeDocument.readyState = 'complete'
fakeDocument.referrer = ''
fakeDocument.visibilityState = 'visible'
fakeDocument.title = 'nuxt smoke'
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

/**
 * 模拟浏览器在 Navigation Timing 中暴露的 Server-Timing：
 * 服务端 Nitro 插件写入的 nuxt_ssr 指标应当被客户端读取并上报。
 */
const navigationEntry = {
  entryType: 'navigation',
  name: 'http://localhost:3000/',
  startTime: 0,
  duration: 100,
  responseStart: 0,
  serverTiming: [{ name: 'nuxt_ssr', duration: 42.5, description: '' }],
}
const originalGetEntriesByType = globalThis.performance.getEntriesByType.bind(globalThis.performance)
Object.defineProperty(globalThis.performance, 'getEntriesByType', {
  configurable: true,
  writable: true,
  value: (type) => (type === 'navigation' ? [navigationEntry] : originalGetEntriesByType(type)),
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const { createMonitor } = await import('@weils-monitor/vue')
const { wireNuxtMonitoring } = await import('../dist/runtime/wire.mjs')
const { createSsrTimingPlugin } = await import('../dist/runtime/server/plugin.mjs')
const serverPluginDefault = (await import('../dist/runtime/server/plugin.mjs')).default

/* -------------------------------------------------------------------------- *
 * 假的 NuxtApp：复刻 nuxt/dist/app/entry.js 的钩子与 errorHandler 时序
 * -------------------------------------------------------------------------- */

const createNuxtAppStub = ({ serverRendered = true, payloadError } = {}) => {
  const registry = new Map()

  const nuxtApp = {
    payload: { serverRendered, data: {}, state: {}, _errors: {}, error: payloadError },
    hook(name, handler) {
      const handlers = registry.get(name) ?? []
      handlers.push(handler)
      registry.set(name, handlers)
      return () => {
        const index = handlers.indexOf(handler)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
    async callHook(name, ...args) {
      for (const handler of [...(registry.get(name) ?? [])]) await handler(...args)
    },
    vueApp: { config: { globalProperties: {}, errorHandler: undefined }, use() {}, mixin() {} },
  }

  return nuxtApp
}

const setup = ({ serverRendered = true, payloadError, options = {} } = {}) => {
  const reports = []
  const listener = (event) => reports.push(event.detail)
  fakeWindow.addEventListener('weils-monitor:report', listener)

  const nuxtApp = createNuxtAppStub({ serverRendered, payloadError })

  // entry.js：Nuxt 先安装默认 errorHandler，它在组件错误时触发 app:error。
  nuxtApp.vueApp.config.errorHandler = (error) => {
    void nuxtApp.callHook('app:error', error)
  }

  const monitor = createMonitor({
    url: '/api/monitor',
    appId: 'nuxt-smoke',
    batchSize: 1000,
    maxBatchBytes: 1024 * 1024,
  })

  monitor.install(nuxtApp.vueApp) // 等价于 nuxtApp.vueApp.use(monitor)
  wireNuxtMonitoring(nuxtApp, monitor, options)

  const metrics = (metricName) => reports.filter((event) => event.metric_name === metricName)
  const errors = (errorType) => reports.filter((event) => event.error_type === errorType)

  return { reports, nuxtApp, monitor, metrics, errors }
}

/* -------------------------------------------------------------------------- *
 * 1. 水合耗时：app:beforeMount → app:mounted / app:suspense:resolve
 * -------------------------------------------------------------------------- */

{
  const { nuxtApp, metrics, errors } = setup()
  const before = metrics('nuxt_hydration').length

  await nuxtApp.callHook('app:beforeMount', {})
  await sleep(8)
  await nuxtApp.callHook('app:mounted', {})
  await sleep(8)
  await nuxtApp.callHook('app:suspense:resolve')

  const hydration = metrics('nuxt_hydration')
  assert.equal(hydration.length, before + 1, '应上报一条 nuxt_hydration')
  assert.equal(hydration[0].event_type, 'performance')
  assert.ok(hydration[0].duration >= 8, '水合耗时至少包含 beforeMount 到 mounted 的 8ms')
  assert.equal(hydration[0].value, hydration[0].duration)
  assert.ok(hydration[0].start_time >= 0, 'start_time 为水合起始的 performance.now() 偏移')
  assert.ok(
    ['good', 'needs-improvement', 'poor'].includes(hydration[0].rating),
    'nuxt_hydration 应带 rating',
  )

  const complete = metrics('nuxt_hydration_complete')
  assert.equal(complete.length, 1, '应上报一条 nuxt_hydration_complete')
  assert.ok(
    complete[0].duration >= hydration[0].duration,
    'suspense 解析耗时不应小于纯水合耗时',
  )

  // 重复触发不应重复上报
  await nuxtApp.callHook('app:mounted', {})
  await nuxtApp.callHook('app:suspense:resolve')
  assert.equal(metrics('nuxt_hydration').length, before + 1)
  assert.equal(metrics('nuxt_hydration_complete').length, 1)

  assert.equal(errors('nuxt_ssr_error').length, 0, '没有 payload.error 时不应上报 SSR 错误')
}

/* -------------------------------------------------------------------------- *
 * 2. 纯 SPA 首屏（未经服务端渲染）不产生水合指标
 * -------------------------------------------------------------------------- */

{
  const { nuxtApp, metrics } = setup({ serverRendered: false })
  await nuxtApp.callHook('app:beforeMount', {})
  await nuxtApp.callHook('app:mounted', {})
  await nuxtApp.callHook('app:suspense:resolve')
  assert.equal(metrics('nuxt_hydration').length, 0, '未服务端渲染的页面没有水合过程')
  assert.equal(metrics('nuxt_hydration_complete').length, 0)
}

/* -------------------------------------------------------------------------- *
 * 3. 服务端渲染耗时：读取 Server-Timing 并上报
 * -------------------------------------------------------------------------- */

{
  const { metrics } = setup()
  const ssr = metrics('nuxt_ssr_render')
  assert.equal(ssr.length, 1, '应从 Server-Timing 读取并上报一条 nuxt_ssr_render')
  assert.equal(ssr[0].value, 42.5)
  assert.equal(ssr[0].duration, 42.5)
  assert.equal(ssr[0].event_type, 'performance')
  assert.equal(ssr[0].rating, 'good', '42.5ms 属于 good')
}

/* -------------------------------------------------------------------------- *
 * 4. 服务端渲染错误：由 payload.error 在客户端补报
 * -------------------------------------------------------------------------- */

{
  const payloadError = Object.assign(new Error('SSR 渲染失败'), {
    statusCode: 500,
    statusMessage: 'Internal Server Error',
  })
  const { errors, metrics } = setup({ payloadError })

  const ssrError = errors('nuxt_ssr_error')
  assert.equal(ssrError.length, 1, '应上报一条 nuxt_ssr_error')
  assert.equal(ssrError[0].message, 'SSR 渲染失败')
  assert.equal(ssrError[0].status_code, 500)
  assert.equal(ssrError[0].tags.source, 'ssr')
  assert.equal(ssrError[0].tags.status_message, 'Internal Server Error')
  assert.equal(metrics('nuxt_ssr_render').length, 1, '服务端错误不影响 SSR 耗时上报')
}

/* -------------------------------------------------------------------------- *
 * 5. Nuxt 框架错误：app:error / app:chunkError / app:error:cleared
 * -------------------------------------------------------------------------- */

{
  const { nuxtApp, errors, reports } = setup()

  await nuxtApp.callHook('app:error', new Error('插件里抛出的错误'))
  let nuxtError = errors('nuxt_error')
  assert.equal(nuxtError.length, 1, 'app:error 应上报 nuxt_error')
  assert.equal(nuxtError[0].message, '插件里抛出的错误')
  assert.equal(nuxtError[0].name, 'Error')
  assert.equal(nuxtError[0].tags.source, 'app:error')

  await nuxtApp.callHook('app:error', {
    statusCode: 404,
    statusMessage: 'Page Not Found',
    message: 'createError 生成的 NuxtError 对象',
  })
  nuxtError = errors('nuxt_error')
  assert.equal(nuxtError.length, 2, 'NuxtError 普通对象也应上报')
  assert.equal(nuxtError[1].status_code, 404)
  assert.equal(nuxtError[1].tags.status_message, 'Page Not Found')

  await nuxtApp.callHook('app:chunkError', {
    error: new Error('Failed to fetch dynamically imported module: http://localhost:3000/_nuxt/demo.js'),
  })
  const chunkError = errors('nuxt_chunk_error')
  assert.equal(chunkError.length, 1, 'app:chunkError 应上报 nuxt_chunk_error')
  assert.equal(chunkError[0].resource_type, 'chunk')
  assert.equal(chunkError[0].resource_url, 'http://localhost:3000/_nuxt/demo.js')

  await nuxtApp.callHook('app:error:cleared', { redirect: '/next' })
  const cleared = reports.filter((event) => event.action === 'nuxt_error_cleared')
  assert.equal(cleared.length, 1, 'app:error:cleared 应上报行为事件')
  assert.equal(cleared[0].event_type, 'behavior')
  assert.equal(cleared[0].category, 'nuxt')
}

/* -------------------------------------------------------------------------- *
 * 6. 去重：Vue 组件错误只产生一条 framework_error，不再触发 nuxt_error
 * -------------------------------------------------------------------------- */

{
  const { nuxtApp, errors, reports } = setup()

  const vueError = new Error('组件渲染失败')
  nuxtApp.vueApp.config.errorHandler(vueError, null, 'render')

  const frameworkError = errors('framework_error')
  assert.equal(frameworkError.length, 1, 'Vue 组件错误仍由 Vue 子包上报 framework_error')
  assert.equal(frameworkError[0].component_stack, 'render')
  assert.equal(
    errors('nuxt_error').length,
    0,
    '同一次 Vue 组件错误不应再被 app:error 重复上报为 nuxt_error',
  )
  assert.ok(reports.length >= 1)

  // 非组件错误（直接触发 app:error）仍然要上报
  await nuxtApp.callHook('app:error', new Error('非组件错误'))
  assert.equal(errors('nuxt_error').length, 1)
}

/* -------------------------------------------------------------------------- *
 * 7. 三个开关可以分别关闭
 * -------------------------------------------------------------------------- */

{
  const { nuxtApp, reports } = setup({
    payloadError: Object.assign(new Error('SSR 失败'), { statusCode: 500 }),
    options: { hydration: false, ssr: false, frameworkErrors: false },
  })

  await nuxtApp.callHook('app:beforeMount', {})
  await sleep(3)
  await nuxtApp.callHook('app:mounted', {})
  await nuxtApp.callHook('app:suspense:resolve')
  await nuxtApp.callHook('app:error', new Error('被关闭的错误采集'))
  await nuxtApp.callHook('app:chunkError', { error: new Error('chunk') })
  await nuxtApp.callHook('app:error:cleared', {})

  assert.equal(reports.length, 0, '开关全部关闭时不应产生任何上报')
}

/* -------------------------------------------------------------------------- *
 * 8. 服务端插件：写入 Server-Timing 响应头
 * -------------------------------------------------------------------------- */

{
  const hooks = new Map()
  const nitroApp = {
    hooks: {
      hook(name, handler) {
        const handlers = hooks.get(name) ?? []
        handlers.push(handler)
        hooks.set(name, handlers)
      },
    },
  }

  assert.equal(typeof serverPluginDefault, 'function', 'Nitro 直接调用默认导出，必须是函数')
  serverPluginDefault(nitroApp)
  assert.ok(hooks.get('request')?.length, '应注册 request 钩子')
  assert.ok(hooks.get('beforeResponse')?.length, '应注册 beforeResponse 钩子')

  const run = async (event, response) => {
    await hooks.get('request')[0](event)
    await sleep(6)
    await hooks.get('beforeResponse')[0](event, response)
    return response
  }

  /** 模拟 Node 响应：Nitro 路由分支下 beforeResponse 收到的 response 只有 body。 */
  const createNodeRes = (initial = {}) => {
    const headers = { ...initial }
    return {
      headers,
      getHeader: (name) => headers[name.toLowerCase()],
      setHeader: (name, value) => { headers[name.toLowerCase()] = value },
    }
  }

  const htmlRes = createNodeRes({ 'content-type': 'text/html;charset=utf-8' })
  await run({ node: { res: htmlRes } }, { body: '<html></html>' })
  assert.match(
    String(htmlRes.headers['server-timing']),
    /^nuxt_ssr;dur=\d+\.\d$/,
    'HTML 文档应写入 Server-Timing',
  )
  const duration = Number(String(htmlRes.headers['server-timing']).match(/dur=([\d.]+)/)[1])
  assert.ok(duration >= 6, '耗时至少包含两次钩子之间的 6ms')

  const jsonRes = createNodeRes({ 'content-type': 'application/json' })
  await run({ node: { res: jsonRes } }, { body: '{}' })
  assert.equal(jsonRes.headers['server-timing'], undefined, '接口响应不写 Server-Timing')

  // 已有 Server-Timing（例如 Nitro 自身或其它模块）时应追加而不是覆盖
  const appendedRes = createNodeRes({ 'content-type': 'text/html', 'server-timing': 'nuxt;dur=1.0' })
  await run({ node: { res: appendedRes } }, { body: '<html></html>' })
  assert.match(String(appendedRes.headers['server-timing']), /^nuxt;dur=1\.0, nuxt_ssr;dur=\d+\.\d$/)

  // 拿不到 Node 响应时回退到 response.headers
  const fallbackResponse = { headers: { 'content-type': 'text/html' } }
  await run({}, fallbackResponse)
  assert.match(
    String(fallbackResponse.headers['server-timing']),
    /^nuxt_ssr;dur=\d+\.\d$/,
    '没有 Node 响应时应回退写入 response.headers',
  )

  // 自定义指标名（工厂函数）
  const customHooks = new Map()
  createSsrTimingPlugin('custom_ssr')({
    hooks: { hook: (name, handler) => customHooks.set(name, handler) },
  })
  const customRes = createNodeRes({ 'content-type': 'text/html' })
  const customEvent = { node: { res: customRes } }
  customHooks.get('request')(customEvent)
  customHooks.get('beforeResponse')(customEvent, { body: '' })
  assert.match(String(customRes.headers['server-timing']), /^custom_ssr;dur=\d+\.\d$/)

  // 没有 request 阶段记录的请求不应写响应头
  const orphanRes = createNodeRes({ 'content-type': 'text/html' })
  hooks.get('beforeResponse')[0]({ node: { res: orphanRes } }, { body: '' })
  assert.equal(orphanRes.headers['server-timing'], undefined)
}

/* -------------------------------------------------------------------------- *
 * 9. 服务端错误：直接上传 Nitro 原始堆栈，避免生产 payload 丢失 stack
 * -------------------------------------------------------------------------- */

{
  const previous = {
    endpoint: process.env.MONITOR_SSR_ENDPOINT,
    appId: process.env.MONITOR_SSR_APP_ID,
    release: process.env.MONITOR_RELEASE,
    fetch: globalThis.fetch,
  }
  process.env.MONITOR_SSR_ENDPOINT = 'http://localhost:8888/api/v1/monitor'
  process.env.MONITOR_SSR_APP_ID = 'nuxt-example'
  process.env.MONITOR_RELEASE = 'test-release'
  const sent = []
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body))
    return { ok: true }
  }
  try {
    const hooks = new Map()
    createSsrTimingPlugin()({ hooks: { hook: (name, handler) => hooks.set(name, handler) } })
    const error = new Error('SSR failed')
    error.stack = 'Error: SSR failed\n    at file:///app/.output/server/chunks/build/page.mjs:3:4'
    await hooks.get('error')(error, { event: { path: '/ssr-error?token=hidden' } })
    await hooks.get('error')(error, { event: { path: '/ssr-error' } })
    assert.equal(sent.length, 1, '同一服务端错误只上报一次')
    assert.equal(sent[0].error_type, 'nuxt_ssr_error')
    assert.equal(sent[0].release, 'test-release')
    assert.equal(sent[0].page_url, '/ssr-error')
    assert.equal(sent[0].stack, error.stack)
    assert.equal(sent[0].filename, 'file:///app/.output/server/chunks/build/page.mjs')
    assert.equal(sent[0].lineno, 3)
    assert.equal(sent[0].colno, 4)
    assert.equal(sent[0].stack_frames.length, 1)
  } finally {
    globalThis.fetch = previous.fetch
    for (const [name, value] of [
      ['MONITOR_SSR_ENDPOINT', previous.endpoint],
      ['MONITOR_SSR_APP_ID', previous.appId],
      ['MONITOR_RELEASE', previous.release],
    ]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

console.log(
  '✅ Nuxt 冒烟验证通过：水合耗时、SSR 耗时（Server-Timing）、SSR 错误补报、'
  + 'app:error / chunkError / error:cleared、组件错误去重、开关与响应头写入',
)
