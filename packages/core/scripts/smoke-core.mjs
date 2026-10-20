import assert from 'node:assert/strict'
import {
  createCollectorRegistry,
  createReporter,
  withNormalization,
  withPublication,
  parseErrorStack,
  enrichErrorStack,
  normalizeReportData,
} from '../dist/index.mjs'
import { setConfig } from '@weils-monitor/utils'

setConfig({ appId: 'core-smoke', url: 'https://example.test/monitor', projectName: 'core' })

const published = []
const queued = []
let exit
let flushes = 0
const adapter = {
  collect: () => ({ route: '/from-adapter' }),
  publish: (data) => published.push(data),
  onExit: (flush) => { exit = flush },
}
const strategy = {
  enqueue: (data, immediate) => queued.push({ data, immediate }),
  flush: () => { flushes++ },
}
const { report, setupExitFlush } = createReporter(adapter, strategy, [
  withNormalization(adapter),
  withPublication(adapter),
])
setupExitFlush()
report({ event_type: 'behavior', action: 'click' })
report({ event_type: 'error', error_type: 'js_error', message: 'boom' })

assert.equal(published.length, 2)
assert.equal(published[0], queued[0].data, 'subscribers and strategy receive one normalized event')
assert.equal(published[0].route, '/from-adapter')
assert.equal(published[0].app_id, 'core-smoke')
assert.match(published[0].event_id, /^[0-9a-f-]{36}$/i)
assert.equal(queued[0].immediate, false)
assert.equal(queued[1].immediate, true)
exit()
assert.equal(flushes, 1)

const collectors = createCollectorRegistry()
let starts = 0
let stops = 0
const start = () => { starts++; return () => { stops++ } }
collectors.start('nuxt:error', start)
collectors.start('nuxt:error', start)
assert.equal(starts, 1)
collectors.stop()
assert.equal(stops, 1)

console.log('✅ core 工厂、适配器、装饰器、策略与采集注册表验证通过')

for (const stack of [
  'Error: boom\n    at render (https://cdn.example.com/app.js:12:34)\n    at https://cdn.example.com/vendor.js:2:8',
  'render@https://cdn.example.com/app.js:12:34\n@https://cdn.example.com/vendor.js:2:8',
]) {
  const frames = parseErrorStack(stack)
  assert.equal(frames.length, 2)
  assert.equal(frames[0].filename, 'https://cdn.example.com/app.js')
  assert.equal(frames[0].lineno, 12)
  assert.equal(frames[0].colno, 34)
  for (const error_type of ['js_error', 'promise_error', 'framework_error', 'nuxt_error', 'nuxt_ssr_error']) {
    const event = normalizeReportData({ event_type: 'error', error_type, stack }, adapter)
    assert.equal(event.stack, stack)
    assert.equal(event.filename, frames[0].filename)
    assert.equal(event.stack_frames.length, 2)
  }
}
const preserved = enrichErrorStack({ event_type: 'error', error_type: 'js_error',
  filename: 'explicit.js', lineno: 4, colno: 5,
  stack: 'Error: boom\n    at https://cdn.example.com/app.js:12:34' })
assert.equal(preserved.filename, 'explicit.js')
assert.equal(preserved.lineno, 4)
assert.equal(preserved.colno, 5)
assert.deepEqual(parseErrorStack('unparseable'), [])
assert.deepEqual(parseErrorStack(), [])
assert.equal(enrichErrorStack({ event_type: 'error', error_type: 'promise_error', message: 'rejected' }).filename, undefined)
const cjs = await import('node:module').then(({ createRequire }) => createRequire(import.meta.url)('../dist/index.cjs'))
assert.equal(cjs.parseErrorStack('Error: x\n    at https://example.com/a.js:1:2')[0].colno, 2)
console.log('✅ 完整堆栈、浏览器格式、统一错误通道、降级与 ESM/CJS 验证通过')
