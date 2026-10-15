/**
 * 上报链路冒烟验证（不依赖浏览器）：
 * 验证字段规范化、批量包，以及条数/体积/退出/严重错误四类 flush 条件。
 *
 * 运行前需要先构建：pnpm build
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const distPath = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const dists = {
  shared: distPath('../packages/shared/dist/index.mjs'),
  utils: distPath('../packages/utils/dist/index.mjs'),
  vue: distPath('../packages/vue/dist/index.mjs'),
};

for (const [name, path] of Object.entries(dists)) {
  if (!existsSync(path)) {
    console.error(`缺少 ${name} 构建产物：${path}\n请先执行 pnpm build`);
    process.exit(1);
  }
}

const ajaxRequests = [];
const beacons = [];
const dispatchedEvents = [];

class FakeXMLHttpRequest {
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  send(body) {
    ajaxRequests.push({ method: this.method, url: this.url, body });
    queueMicrotask(() => {
      this.status = 200;
      this.onload?.();
    });
  }
}

class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow();
fakeWindow.location = { href: 'http://localhost:5173/' };
fakeWindow.location.pathname = '/';
fakeWindow.screen = { width: 1920, height: 1080 };
fakeWindow.innerWidth = 1280;
fakeWindow.innerHeight = 720;
fakeWindow.addEventListener('weils-monitor:report', (event) => {
  dispatchedEvents.push(event.detail);
});

const fakeDocument = new EventTarget();
fakeDocument.visibilityState = 'visible';
fakeDocument.readyState = 'complete';
fakeDocument.referrer = '';
fakeDocument.createElement = () => ({});

globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
globalThis.XMLHttpRequest = FakeXMLHttpRequest;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
    language: 'zh-CN',
    sendBeacon(url, body) {
      beacons.push({ url, body });
      return true;
    },
  },
  configurable: true,
  writable: true,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));
const parseBody = async (body) =>
  JSON.parse(typeof body === 'string' ? body : await body.text());

const shared = await import(pathToFileURL(dists.shared).href);
const utils = await import(pathToFileURL(dists.utils).href);
const vue = await import(pathToFileURL(dists.vue).href);

utils.setConfig({
  url: 'http://127.0.0.1:9999/report',
  projectName: 'weils-monitor-smoke',
  appId: 'smoke-app',
  userId: 'smoke-user',
  isImageUpload: false,
  batchSize: 3,
  maxBatchBytes: 50 * 1024,
  sampleRate: 0.5,
  debug: false,
});

const makeReport = (index) => ({
  event_type: 'behavior',
  action: 'page_view',
  properties: { index },
});

// 0. PerformanceObserver 必须忽略 SDK 自己的上报请求，避免无限闭环
const performanceObservers = [];
class FakePerformanceObserver {
  constructor(callback) {
    this.callback = callback;
    this.pending = [];
    performanceObservers.push(this);
  }
  observe(options) { this.options = options; }
  disconnect() {}
  takeRecords() { return this.pending.splice(0); }
  emit(entries) {
    this.callback({ getEntries: () => entries });
  }
}
fakeWindow.PerformanceObserver = FakePerformanceObserver;
globalThis.PerformanceObserver = FakePerformanceObserver;
utils.setConfig({ url: '/api/v1/monitor' });
vue.default.performance.observerEntries();
performanceObservers[0].emit([{
  name: 'http://localhost:5173/api/v1/monitor?transport=beacon',
  initiatorType: 'xmlhttprequest',
  duration: 10,
  transferSize: 100,
  encodedBodySize: 20,
  startTime: 1,
}]);
assert.equal(dispatchedEvents.length, 0, '资源性能采集不能再次采集 SDK 上报请求');
assert.equal(shared.getCacheSize(), 0, 'SDK 上报请求不能进入事件队列');
utils.setConfig({ url: 'http://127.0.0.1:9999/report' });

// 1. 只入队：未到 batchSize 不发请求
vue.report(makeReport(1));
vue.report(makeReport(2));
await flush();
assert.equal(ajaxRequests.length, 0, '未到 batchSize 时不应发送');
assert.equal(shared.getCacheSize(), 2, 'vue 包应把数据放进队列');
assert.equal(dispatchedEvents.length, 2, '每条数据都应派发 weils-monitor:report 事件');
assert.equal(dispatchedEvents[0].projectName, 'weils-monitor-smoke');

// 2. 到 batchSize：由 utils 自动发送一批
vue.report(makeReport(3));
await flush();
assert.equal(ajaxRequests.length, 1, '到达 batchSize 应自动发送一次');
assert.equal(shared.getCacheSize(), 0, '发送后队列应清空');

const batchPayload = await parseBody(ajaxRequests[0].body);
assert.equal(ajaxRequests[0].method, 'POST');
assert.equal(ajaxRequests[0].url, 'http://127.0.0.1:9999/report');
assert.equal(batchPayload.app_id, 'smoke-app');
assert.equal(batchPayload.projectName, 'weils-monitor-smoke');
assert.equal(batchPayload.sdk_version, '1.0.1');
assert.equal(batchPayload.sample_rate, 0.5);
assert.equal(typeof batchPayload.send_time, 'number');
assert.deepEqual(
  batchPayload.events.map((item) => item.properties.index),
  [1, 2, 3],
  '批次内容应按入队顺序',
);
for (const event of batchPayload.events) {
  assert.match(event.event_id, /^[0-9a-f-]{36}$/i);
  assert.equal(event.event_type, 'behavior');
  assert.equal(event.app_id, 'smoke-app');
  assert.equal(event.projectName, 'weils-monitor-smoke');
  assert.equal(typeof event.timestamp, 'number');
  assert.equal(event.page_url, 'http://localhost:5173/');
}

// 3. 页面退出：不足一批的剩余数据用 beacon 冲刷
vue.report(makeReport(4));
await flush();
assert.equal(ajaxRequests.length, 1, '单条数据不应触发 Ajax 发送');

fakeWindow.dispatchEvent(new Event('pagehide'));
await flush();
assert.equal(beacons.length, 1, 'pagehide 应触发 beacon 冲刷');
const beaconPayload = await parseBody(beacons[0].body);
assert.deepEqual(
  beaconPayload.events.map((item) => item.properties.index),
  [4],
);
assert.equal(shared.getCacheSize(), 0);

// 4. 页面进入后台：同样冲刷剩余数据
vue.report(makeReport(5));
await flush();
fakeDocument.visibilityState = 'hidden';
fakeDocument.dispatchEvent(new Event('visibilitychange'));
await flush();
assert.equal(beacons.length, 2, 'visibilitychange 隐藏时应触发 beacon 冲刷');
const hiddenPayload = await parseBody(beacons[1].body);
assert.deepEqual(
  hiddenPayload.events.map((item) => item.properties.index),
  [5],
);

// 5. beforeunload 同样触发 beacon
vue.report(makeReport(6));
await flush();
fakeWindow.dispatchEvent(new Event('beforeunload'));
await flush();
assert.equal(beacons.length, 3, 'beforeunload 应触发 beacon 冲刷');

// 6. 严重错误不等待阈值，立即 Ajax flush
vue.report({
  event_type: 'error',
  error_type: 'js_error',
  message: 'smoke failure',
});
await flush();
assert.equal(ajaxRequests.length, 2, '严重错误应立即 flush');
const errorPayload = await parseBody(ajaxRequests[1].body);
assert.equal(errorPayload.events[0].error_type, 'js_error');

// 7. 体积超过阈值时，即使条数不足也立即 flush
utils.setConfig({ batchSize: 100, maxBatchBytes: 200 });
vue.report({
  event_type: 'behavior',
  action: 'custom',
  properties: { payload: 'x'.repeat(500) },
});
await flush();
assert.equal(ajaxRequests.length, 3, '达到体积阈值应立即 flush');

// 8. CLS 在页面隐藏时结算，并在先前的退出 flush 之后单独发送
utils.setConfig({ batchSize: 100, maxBatchBytes: 50 * 1024 });
vue.default.performance.observerCLS();
const clsObserver = performanceObservers.at(-1);
assert.equal(clsObserver.options.type, 'layout-shift');
clsObserver.emit([
  { startTime: 100, value: 0.08, hadRecentInput: false },
  { startTime: 200, value: 0.5, hadRecentInput: true },
]);
clsObserver.pending.push({ startTime: 300, value: 0.04, hadRecentInput: false });
const beaconsBeforeCLS = beacons.length;
fakeDocument.dispatchEvent(new Event('visibilitychange'));
assert.equal(beacons.length, beaconsBeforeCLS + 1, 'CLS 应在页面隐藏时由 beacon 发送');
const clsPayload = await parseBody(beacons.at(-1).body);
assert.equal(clsPayload.events.length, 1);
assert.equal(clsPayload.events[0].metric_name, 'CLS');
assert.ok(Math.abs(clsPayload.events[0].value - 0.12) < 1e-10);
assert.equal(clsPayload.events[0].rating, 'needs-improvement');
fakeWindow.dispatchEvent(new Event('pagehide'));
assert.equal(beacons.length, beaconsBeforeCLS + 1, 'CLS 不应重复上报');

// 9. 没有布局偏移时也要上报有效的 0 分数，供后端统计正常样本
vue.default.performance.observerCLS();
fakeWindow.dispatchEvent(new Event('pagehide'));
const zeroCLSPayload = await parseBody(beacons.at(-1).body);
assert.equal(zeroCLSPayload.events[0].metric_name, 'CLS');
assert.equal(zeroCLSPayload.events[0].value, 0);
assert.equal(zeroCLSPayload.events[0].rating, 'good');

console.log('✅ 冒烟验证通过：字段规范化、批量包、退出冲刷及 CLS 上报均正常');
