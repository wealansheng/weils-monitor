<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface MonitorReport extends Record<string, unknown> {
  event_type: string;
  metric_name?: string;
  error_type?: string;
  action?: string;
  issue_type?: string;
}

interface ReportEntry {
  id: number;
  receivedAt: string;
  report: MonitorReport;
}

const reports = ref<ReportEntry[]>([]);
const selectedId = ref<number | null>(null);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const MAX_REPORTS = 50;
const MAX_RESOURCE_REPORTS = 5;
let nextId = 1;
let copyResetTimer: number | undefined;

const selectedReport = computed(
  () => reports.value.find((entry) => entry.id === selectedId.value) ?? reports.value[0] ?? null,
);

const typeLabel: Record<string, string> = {
  behavior: '用户行为',
  error: '错误',
  performance: '性能',
};

const subTypeLabel: Record<string, string> = {
  click: '页面点击',
  CLS: '累积布局偏移',
  FCP: '首次内容绘制',
  FID: '首次输入延迟',
  FP: '首次绘制',
  route_change: '路由变化',
  INP: '交互到下次绘制',
  js_error: 'JavaScript 错误',
  navigation: '页面加载',
  LCP: '最大内容绘制',
  promise_error: 'Promise 拒绝',
  page_view: '页面访问',
  resource: '资源事件',
  TTFB: '首字节时间',
  framework_error: 'Vue 组件错误',
};

const automaticMonitors = [
  { label: 'TTFB', subType: 'TTFB', note: '主文档响应' },
  { label: 'FP', subType: 'FP', note: '首次绘制' },
  { label: 'FCP', subType: 'FCP', note: '内容绘制' },
  { label: 'LCP', subType: 'LCP', note: '最大内容' },
  { label: 'Load', subType: 'navigation', note: '页面完成' },
  { label: 'FID', subType: 'FID', note: '首次交互' },
  { label: 'CLS', subType: 'CLS', note: '离开页面时结算' },
  { label: 'INP', subType: 'INP', note: '交互后结算' },
] as const;

const capturedSubTypes = computed(
  () => new Set(reports.value.map(({ report }) => getReportKind(report))),
);

const getReportKind = (report: MonitorReport): string =>
  report.metric_name ?? report.error_type ?? report.action ?? report.issue_type ?? report.event_type;

const selectedJson = computed(() =>
  selectedReport.value ? JSON.stringify(selectedReport.value.report, null, 2) : '',
);

const copyLabel = computed(() => {
  if (copyState.value === 'copied') return '已复制';
  if (copyState.value === 'failed') return '复制失败';
  return '复制 JSON';
});

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

  let resourceCount = 0;
  reports.value = [entry, ...reports.value]
    .filter(({ report: currentReport }) => {
      if (currentReport.event_type !== 'performance' || currentReport.metric_name !== 'resource') {
        return true;
      }

      resourceCount += 1;
      return resourceCount <= MAX_RESOURCE_REPORTS;
    })
    .slice(0, MAX_REPORTS);
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

const copySelectedReport = async (): Promise<void> => {
  if (!selectedJson.value) return;

  try {
    await navigator.clipboard.writeText(selectedJson.value);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }

  window.clearTimeout(copyResetTimer);
  copyResetTimer = window.setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
};

watch(selectedId, () => {
  copyState.value = 'idle';
});

onMounted(() => window.addEventListener('weils-monitor:report', onReport));
onBeforeUnmount(() => {
  window.removeEventListener('weils-monitor:report', onReport);
  window.clearTimeout(copyResetTimer);
});
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
        <pre><code><b>import</b> WeilsMonitor <b>from</b> '@weils-monitor/vue'

app.use(WeilsMonitor, options)
WeilsMonitor.performance.observerLCP()
<span class="snippet-note">// 达到条数、体积等任一阈值时自动上报</span></code></pre>
      </div>
    </section>

    <section class="monitor-rail" aria-labelledby="automatic-title">
      <div class="monitor-rail-copy">
        <h2 id="automatic-title">自动性能监测</h2>
        <p>刷新页面后自动采集；FID 会在首次交互后出现，CLS 会在页面进入后台时结算。</p>
      </div>
      <ul aria-label="性能监测状态">
        <li
          v-for="monitor in automaticMonitors"
          :key="monitor.subType"
          :class="{ captured: capturedSubTypes.has(monitor.subType) }"
        >
          <span class="status-dot" aria-hidden="true"></span>
          <strong>{{ monitor.label }}</strong>
          <small>{{ capturedSubTypes.has(monitor.subType) ? '已捕获' : monitor.note }}</small>
        </li>
      </ul>
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

      <div class="reports-panel">
        <div class="section-heading reports-heading">
          <div>
            <h2>实时报告</h2>
            <p role="status" aria-live="polite">{{ reports.length ? `已捕获 ${reports.length} 条事件` : '正在等待 SDK 输出' }}</p>
          </div>
          <div class="report-actions">
            <button
              class="copy-button"
              type="button"
              :disabled="!selectedReport"
              @click="copySelectedReport"
            >
              {{ copyLabel }}
            </button>
            <button class="clear-button" type="button" :disabled="!reports.length" @click="clearReports">清空</button>
          </div>
        </div>

        <div v-if="reports.length" class="report-content">
          <ol class="report-list" aria-label="已捕获的事件">
            <li v-for="entry in reports" :key="entry.id">
              <button
                type="button"
                :class="{ active: selectedReport?.id === entry.id }"
                @click="selectedId = entry.id"
              >
                <span class="event-dot" :data-type="entry.report.event_type"></span>
                <span>
                  <strong>{{ subTypeLabel[getReportKind(entry.report)] ?? getReportKind(entry.report) }}</strong>
                  <small>{{ typeLabel[entry.report.event_type] ?? entry.report.event_type }} · {{ getReportKind(entry.report) }}</small>
                </span>
                <time>{{ entry.receivedAt }}</time>
              </button>
            </li>
          </ol>
          <pre class="report-json"><code>{{ selectedJson }}</code></pre>
        </div>

        <div v-else class="empty-state">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M9 34V14m10 20V22m10 12V9m10 25V18" />
            <path d="M5 39h38" />
          </svg>
          <strong>正在监听监控报告</strong>
          <p>首屏性能数据会自动出现；也可以点击左侧场景，检查错误与行为采集。</p>
        </div>
      </div>
    </section>
  </main>
</template>
