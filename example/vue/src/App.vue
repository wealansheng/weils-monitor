<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

interface MonitorReport extends Record<string, unknown> {
  type: string;
  subType: string;
}

interface ReportEntry {
  id: number;
  receivedAt: string;
  report: MonitorReport;
}

const reports = ref<ReportEntry[]>([]);
const selectedId = ref<number | null>(null);
let nextId = 1;

const selectedReport = computed(
  () => reports.value.find((entry) => entry.id === selectedId.value) ?? reports.value[0] ?? null,
);

const typeLabel: Record<string, string> = {
  behavior: '用户行为',
  error: '错误',
  performance: '性能',
};

const makeSerializable = (report: MonitorReport): MonitorReport => {
  const seen = new WeakSet<object>();

  return JSON.parse(
    JSON.stringify(report, (_key, value: unknown) => {
      if (value instanceof Element) {
        return `<${value.tagName.toLowerCase()}>`;
      }
      if (value instanceof Window) return '[Window]';
      if (value instanceof Document) return '[Document]';
      if (value instanceof EventTarget) return `[${value.constructor.name}]`;

      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }

      return value;
    }),
  ) as MonitorReport;
};

const onReport = (event: Event): void => {
  const report = makeSerializable((event as CustomEvent<MonitorReport>).detail);
  const entry: ReportEntry = {
    id: nextId++,
    receivedAt: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date()),
    report,
  };

  reports.value = [entry, ...reports.value].slice(0, 30);
  selectedId.value = entry.id;
};

const triggerVueError = (): void => {
  throw new Error('来自演示页的 Vue 组件错误');
};

const triggerPromiseError = (): void => {
  void Promise.reject(new Error('来自演示页的未处理 Promise 错误'));
};

const triggerJavaScriptError = (): void => {
  window.setTimeout(() => {
    throw new Error('来自演示页的 JavaScript 错误');
  });
};

const triggerResourceError = (): void => {
  const image = new Image();
  image.alt = '用于触发资源加载错误的演示图片';
  image.hidden = true;
  image.addEventListener('error', () => image.remove(), { once: true });
  document.body.appendChild(image);
  image.src = `/missing-demo-asset-${Date.now()}.png`;
};

const triggerRouteChange = (): void => {
  window.location.hash = `demo-${Date.now()}`;
};

const clearReports = (): void => {
  reports.value = [];
  selectedId.value = null;
};

onMounted(() => window.addEventListener('weils-monitor:report', onReport));
onBeforeUnmount(() => window.removeEventListener('weils-monitor:report', onReport));
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="weils monitor 演示首页">
        <span class="brand-mark" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </span>
        <span>weils monitor</span>
      </a>
      <div class="connection"><span aria-hidden="true"></span>SDK 已连接</div>
    </header>

    <section class="intro" aria-labelledby="page-title">
      <div>
        <h1 id="page-title">把监控事件<br />亲手触发一遍。</h1>
        <p>
          这是 <code>@weils-monitor/vue</code> 的可运行示例。选择一个场景，然后在下方查看 SDK
          捕获的原始报告；浏览器控制台中也会保留同样的输出。
        </p>
      </div>
      <div class="install-snippet" aria-label="插件安装代码">
        <span>main.ts</span>
        <pre><code><b>import</b> Monitor <b>from</b> '@weils-monitor/vue'

app.use(Monitor, options)</code></pre>
      </div>
    </section>

    <section class="workspace" aria-label="监控事件演示台">
      <div class="actions-panel">
        <div class="section-heading">
          <div>
            <h2>触发场景</h2>
            <p>每个操作都使用浏览器的真实事件机制。</p>
          </div>
          <span class="count">5 项</span>
        </div>

        <div class="action-list">
          <button type="button" @click="triggerVueError">
            <span class="action-index">A</span>
            <span><strong>Vue 组件错误</strong><small>经过 app.config.errorHandler 捕获</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
          <button type="button" @click="triggerPromiseError">
            <span class="action-index">B</span>
            <span><strong>Promise 拒绝</strong><small>触发 unhandledrejection 事件</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
          <button type="button" @click="triggerJavaScriptError">
            <span class="action-index">C</span>
            <span><strong>JavaScript 错误</strong><small>触发 window.onerror 回调</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
          <button type="button" @click="triggerResourceError">
            <span class="action-index">D</span>
            <span><strong>资源加载失败</strong><small>请求一张不存在的图片</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
          <button type="button" @click="triggerRouteChange">
            <span class="action-index">E</span>
            <span><strong>Hash 路由变化</strong><small>记录切换前后的 URL</small></span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
        </div>
      </div>

      <div class="reports-panel" aria-live="polite">
        <div class="section-heading reports-heading">
          <div>
            <h2>实时报告</h2>
            <p>{{ reports.length ? `已捕获 ${reports.length} 条事件` : '等待你的第一次操作' }}</p>
          </div>
          <button class="clear-button" type="button" :disabled="!reports.length" @click="clearReports">清空</button>
        </div>

        <div v-if="reports.length" class="report-content">
          <ol class="report-list" aria-label="已捕获的事件">
            <li v-for="entry in reports" :key="entry.id">
              <button
                type="button"
                :class="{ active: selectedReport?.id === entry.id }"
                @click="selectedId = entry.id"
              >
                <span class="event-dot" :data-type="entry.report.type"></span>
                <span><strong>{{ entry.report.subType }}</strong><small>{{ typeLabel[entry.report.type] ?? entry.report.type }}</small></span>
                <time>{{ entry.receivedAt }}</time>
              </button>
            </li>
          </ol>
          <pre class="report-json"><code>{{ JSON.stringify(selectedReport?.report, null, 2) }}</code></pre>
        </div>

        <div v-else class="empty-state">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M9 34V14m10 20V22m10 12V9m10 25V18" />
            <path d="M5 39h38" />
          </svg>
          <strong>报告会在这里出现</strong>
          <p>点击左侧任一场景。普通点击与首次访问也已在监测。</p>
        </div>
      </div>
    </section>
  </main>
</template>
