import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import {
  createCollectorRegistry,
  createReporter,
  withNormalization,
  withPublication,
  parseErrorStack,
  enrichErrorStack,
  normalizeReportData,
  sanitizeQueryString,
} from '../dist/index.mjs'
import { config, getCacheSize } from '@weils-monitor/shared'
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

// 无 URL/URLSearchParams 的纯字符串脱敏，供小程序使用。
assert.equal(sanitizeQueryString('token=abc&page=2&password=x&q=hello'), 'page=2&q=hello')
assert.equal(sanitizeQueryString(''), '')
assert.equal(sanitizeQueryString('a=1&&b=2'), 'a=1&b=2')

// 无 replay / DOM 依赖的 reporter 子入口同时提供 ESM 与 CJS。
const reporterEsm = await import('../dist/reporter.mjs')
assert.equal(typeof reporterEsm.createReporter, 'function')
assert.equal(reporterEsm.REPORT_EVENT, 'weils-monitor:report')
assert.equal(typeof reporterEsm.sanitizeQueryString, 'function')
const reporterCjs = await import('node:module').then(({ createRequire }) => createRequire(import.meta.url)('../dist/reporter.cjs'))
assert.equal(typeof reporterCjs.createReporter, 'function')
assert.equal(reporterCjs.REPORT_EVENT, 'weils-monitor:report')

// error-stack-parser / stackframe 必须内联到 core 产物：
// 小程序等非 Rollup 运行时无法解析残留的 require('stackframe')。
const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const bundleCode = readdirSync(distDir)
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => readFileSync(join(distDir, name), 'utf8'))
  .join('\n')
assert.ok(!/require\(["']stackframe["']\)/.test(bundleCode), 'core ESM 产物不能残留 require("stackframe")')
assert.ok(!/require\(["']error-stack-parser["']\)/.test(bundleCode), 'core ESM 产物不能残留 error-stack-parser require')
assert.ok(!/from\s+["']stackframe["']/.test(bundleCode), 'core ESM 产物不能外部导入 stackframe')

const cjsCode = readdirSync(distDir)
  .filter((name) => name.endsWith('.cjs'))
  .map((name) => readFileSync(join(distDir, name), 'utf8'))
  .join('\n')
assert.ok(!/require\(["']stackframe["']\)/.test(cjsCode), 'core CJS 产物不能外部 require stackframe')
console.log('✅ 纯字符串脱敏、reporter 子入口（ESM/CJS）与 stackframe 内联验证通过')

// 多份 shared 模块实例（pnpm/uni-app 构建器可能重复打包）必须共享 config/queue。
const sharedSource = fileURLToPath(new URL('../../shared/dist/index.mjs', import.meta.url))
const tempDir = mkdtempSync(join(tmpdir(), 'weils-shared-'))
const duplicatePath = join(tempDir, 'shared-copy.mjs')
try {
  copyFileSync(sharedSource, duplicatePath)
  const duplicate = await import(pathToFileURL(duplicatePath).href)
  assert.equal(duplicate.config, config, '重复打包的 shared 必须复用同一 config 对象')
  setConfig({ url: 'https://shared-state.test/monitor' })
  assert.equal(duplicate.config.url, 'https://shared-state.test/monitor', 'setConfig 必须影响所有 shared 副本')
  duplicate.addCache({ event_type: 'behavior', action: 'shared-state' })
  assert.equal(getCacheSize(), 1, '重复打包的 shared 必须复用同一队列')
  duplicate.clearCache()
  assert.equal(getCacheSize(), 0)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
console.log('✅ 多份 shared 实例的 config/queue 单例验证通过')
