import assert from 'node:assert/strict';
import { createRenderer, h, ref } from 'vue';
import { createMonitor } from '../dist/index.mjs';

class FakeWindow extends EventTarget {}
const fakeWindow = new FakeWindow();
fakeWindow.location = { href: 'http://localhost/', pathname: '/' };
fakeWindow.screen = { width: 1280, height: 720 };
fakeWindow.innerWidth = 1280;
fakeWindow.innerHeight = 720;
fakeWindow.performance = globalThis.performance;
fakeWindow.setTimeout = setTimeout;
fakeWindow.clearTimeout = clearTimeout;
fakeWindow.requestAnimationFrame = (callback) =>
  setTimeout(() => callback(performance.now()), 0);

const fakeDocument = new EventTarget();
fakeDocument.readyState = 'complete';
fakeDocument.referrer = '';
fakeDocument.querySelector = () => ({
  textContent: 'rendered',
  children: [],
  querySelectorAll: () => [],
});

globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { userAgent: 'Chrome/120', language: 'zh-CN' },
});

const reports = [];
fakeWindow.addEventListener('weils-monitor:report', (event) => reports.push(event.detail));

const createNode = (tag, text = '') => ({ tag, text, children: [], parent: null });
const renderer = createRenderer({
  createElement: (tag) => createNode(tag),
  createText: (text) => createNode('#text', text),
  createComment: (text) => createNode('#comment', text),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.text = text; node.children = []; },
  patchProp: () => {},
  insert(node, parent, anchor = null) {
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(node);
    else parent.children.splice(index, 0, node);
  },
  remove(node) {
    const siblings = node.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(node), 1);
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => {
    const siblings = node.parent?.children ?? [];
    return siblings[siblings.indexOf(node) + 1] ?? null;
  },
});

const count = ref(0);
const reportDrivenUpdates = ref(0);
const Child = { name: 'Child', render: () => h('span', String(count.value)) };
const Root = {
  name: 'Root',
  render: () => h('div', [h(Child), h('small', String(reportDrivenUpdates.value))]),
};

let beforeEach;
let afterEach;
const router = {
  beforeEach(callback) { beforeEach = callback; },
  afterEach(callback) { afterEach = callback; },
};

const monitor = createMonitor({
  url: '/api/v1/monitor',
  appId: 'timing-smoke',
  batchSize: 100,
  maxBatchBytes: 50 * 1024,
});
const app = renderer.createApp(Root);
app.config.globalProperties.$router = router;
app.use(monitor);
app.mount(createNode('root'));

await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(reports.length, 0, 'install 应暂存首次挂载指标');
monitor.observer();
await new Promise((resolve) => setTimeout(resolve, 30));

const find = (metric) => reports.filter((event) => event.metric_name === metric);
assert.equal(find('vue_first_screen').length, 1, 'observer 晚于 mount 仍须上报首屏');
assert.ok(find('vue_first_screen')[0].value >= 0);
assert.ok(find('vue_component_mount').some((event) => event.name === 'Root'));
assert.ok(find('vue_component_mount').some((event) => event.name === 'Child'));

count.value++;
await new Promise((resolve) => setTimeout(resolve, 30));
assert.ok(find('vue_component_update').some((event) => event.name === 'Child'));

const rootUpdatesBeforeProbe = find('vue_component_update')
  .filter((event) => event.name === 'Root').length;
const onProbeReport = () => { reportDrivenUpdates.value++; };
fakeWindow.addEventListener('weils-monitor:report', onProbeReport);
monitor.report({ event_type: 'behavior', action: 'probe' });
await new Promise((resolve) => setTimeout(resolve, 30));
fakeWindow.removeEventListener('weils-monitor:report', onProbeReport);
const rootUpdatesAfterProbe = find('vue_component_update')
  .filter((event) => event.name === 'Root').length;
assert.equal(rootUpdatesAfterProbe, rootUpdatesBeforeProbe + 1,
  '上报导致的 Vue 更新不能再次触发组件指标循环');

beforeEach({ fullPath: '/next' }, { fullPath: '/' });
await new Promise((resolve) => setTimeout(resolve, 5));
count.value++;
afterEach({ fullPath: '/next' }, { fullPath: '/' });
await new Promise((resolve) => setTimeout(resolve, 30));
const route = reports.find((event) => event.action === 'route_change');
assert.ok(route, 'Vue Router 导航应上报');
assert.equal(route.from_route, '/');
assert.equal(route.to_route, '/next');
assert.ok(route.duration >= 5, '路由耗时应包含异步导航阶段');

const routeCount = reports.filter((event) => event.action === 'route_change').length;
beforeEach({ fullPath: '/blocked' }, { fullPath: '/next' });
afterEach({ fullPath: '/blocked' }, { fullPath: '/next' }, new Error('aborted'));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(reports.filter((event) => event.action === 'route_change').length, routeCount,
  '取消的导航不应上报路由耗时');

globalThis.history = {
  pushState(_state, _title, url) {
    fakeWindow.location.href = new URL(url, fakeWindow.location.href).href;
    fakeWindow.location.pathname = new URL(fakeWindow.location.href).pathname;
  },
  replaceState(_state, _title, url) {
    fakeWindow.location.href = new URL(url, fakeWindow.location.href).href;
    fakeWindow.location.pathname = new URL(fakeWindow.location.href).pathname;
  },
};
const fallbackMonitor = await import('../dist/index.mjs?history-fallback');
fallbackMonitor.default.behavior.pageChange();
history.pushState({}, '', '/fallback');
await new Promise((resolve) => setTimeout(resolve, 30));
const fallbackRoute = reports.find((event) =>
  event.action === 'route_change' && event.to_route === '/fallback');
assert.ok(fallbackRoute, '没有 Vue Router 时 History 导航也应上报');
assert.ok(fallbackRoute.duration >= 0);

console.log('✅ Vue 耗时冒烟验证通过：晚启动补报、首屏、组件挂载/更新、Vue Router 与 History 导航');
