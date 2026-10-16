import assert from 'node:assert/strict'
import {
  createCollectorRegistry,
  createReporter,
  withNormalization,
  withPublication,
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
