<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type MonitorReport = Record<string, unknown> & {
  event_type: string
  action?: string
  error_type?: string
  metric_name?: string
}

interface ReportEntry {
  id: number
  time: string
  report: MonitorReport
}

const reports = ref<ReportEntry[]>([])
const filter = ref('all')
const selectedId = ref<number | null>(null)
const sdkReady = ref(false)
let nextId = 1
let shownResources = 0

const filters = [
  { value: 'all', label: '全部' },
  { value: 'behavior', label: '行为' },
  { value: 'error', label: '错误' },
  { value: 'performance', label: '性能' },
]

const visibleReports = computed(() => reports.value.filter(({ report }) =>
  filter.value === 'all' || report.event_type === filter.value,
))
const selected = computed(() => visibleReports.value.find(({ id }) => id === selectedId.value) ?? visibleReports.value[0])
const selectedJson = computed(() => selected.value ? JSON.stringify(selected.value.report, null, 2) : '')

const reportName = (report: MonitorReport): string =>
  String(report.action ?? report.error_type ?? report.metric_name ?? report.event_type)

const receiveReport = (event: Event): void => {
  const report = (event as CustomEvent<MonitorReport>).detail
  if (!report || typeof report.event_type !== 'string') return
  // Rendering this panel itself creates component-update measurements.
  if (report.metric_name === 'vue_component_update') return
  if (report.metric_name === 'resource' && shownResources++ >= 5) return

  const entry: ReportEntry = {
    id: nextId++,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    report,
  }
  reports.value = [entry, ...reports.value].slice(0, 50)
  selectedId.value = entry.id
}

const triggerJavaScriptError = (): void => {
  window.setTimeout(() => {
    throw new Error('Nuxt 示例：JavaScript 运行时错误')
  }, 0)
}

const triggerPromiseError = (): void => {
  void Promise.reject(new Error('Nuxt 示例：未处理的 Promise 拒绝'))
}

const triggerResourceError = (): void => {
  const image = new Image()
  image.hidden = true
  image.addEventListener('error', () => image.remove(), { once: true })
  document.body.appendChild(image)
  image.src = `/missing-monitor-demo-${Date.now()}.png`
}

const nuxtApp = useNuxtApp()
const reportCustomEvent = (): void => {
  nuxtApp.$monitor?.report({
    event_type: 'behavior',
    action: 'nuxt_custom_event',
    category: 'demo',
    properties: { source: 'example/nuxt', button: 'custom-report' },
  })
}

const clearReports = (): void => {
  reports.value = []
  selectedId.value = null
}

onMounted(() => {
  const monitorWindow = window as Window & { __WEILS_MONITOR_SDK__?: { vue?: boolean } }
  sdkReady.value = Boolean(monitorWindow.__WEILS_MONITOR_SDK__?.vue)
  window.addEventListener('weils-monitor:report', receiveReport)
})
onBeforeUnmount(() => window.removeEventListener('weils-monitor:report', receiveReport))
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <NuxtLink class="brand" to="/">weils<span>monitor</span><small>/ Nuxt</small></NuxtLink>
      <span class="sdk-status" :class="{ ready: sdkReady }">
        <span class="status-dot" aria-hidden="true"></span>
        {{ sdkReady ? '客户端 SDK 已启动' : '等待客户端 SDK' }}
      </span>
    </header>

    <main>
      <section class="intro">
        <div>
          <h1>在 Nuxt 中<br>看见每一次上报。</h1>
          <p>这个示例通过 <code>@weils-monitor/nuxt</code> 自动安装 Vue 监控。右侧实时展示本页收到的事件，批量数据经 Nuxt 转发到 <code>localhost:8888/api/v1/monitor</code>。</p>
        </div>
        <pre class="install-code"><span>nuxt.config.ts</span><code>modules: ['@weils-monitor/nuxt'],
cyMonitor: {
  url: '/api/monitor',
  appId: 'nuxt-example',
  batchSize: 20,
  clickAttributes: ['custom-data'],
}</code></pre>
      </section>

      <div class="demo-grid">
        <div class="left-column">
          <NuxtPage />

          <section class="actions" aria-labelledby="actions-title">
            <div class="section-heading">
              <h2 id="actions-title">触发监控</h2>
              <span>真实浏览器事件</span>
            </div>
            <button type="button" @click="triggerJavaScriptError"><strong>JavaScript 错误</strong><small>window.onerror</small><span aria-hidden="true">↗</span></button>
            <button type="button" @click="triggerPromiseError"><strong>Promise 拒绝</strong><small>unhandledrejection</small><span aria-hidden="true">↗</span></button>
            <button type="button" @click="triggerResourceError"><strong>资源加载失败</strong><small>不存在的图片地址</small><span aria-hidden="true">↗</span></button>
            <button type="button"><strong>普通点击</strong><small>点击行为采集</small><span aria-hidden="true">↗</span></button>
            <button type="button" custom-data="nuxt_custom_click"><strong>自定义点击</strong><small>custom-data 属性配置</small><span aria-hidden="true">↗</span></button>
            <button type="button" plugin-action="nuxt_plugin_click"><strong>插件扩展点击</strong><small>自定义 client 插件配置</small><span aria-hidden="true">↗</span></button>
            <button type="button" @click="reportCustomEvent"><strong>自定义事件上报</strong><small>$monitor.report()</small><span aria-hidden="true">↗</span></button>
          </section>
        </div>

        <section class="reports" aria-labelledby="reports-title">
          <div class="section-heading">
            <div>
              <h2 id="reports-title">实时报告</h2>
              <p role="status" aria-live="polite">当前会话已捕获 {{ reports.length }} 条</p>
            </div>
            <button class="clear-button" type="button" :disabled="!reports.length" @click="clearReports">清空</button>
          </div>

          <div class="filters" aria-label="按事件类型筛选">
            <button v-for="item in filters" :key="item.value" type="button" :class="{ active: filter === item.value }" @click="filter = item.value; selectedId = null">{{ item.label }}</button>
          </div>

          <div v-if="visibleReports.length" class="report-list">
            <button v-for="entry in visibleReports" :key="entry.id" type="button" :class="{ selected: selected?.id === entry.id }" @click="selectedId = entry.id">
              <span class="report-type" :data-type="entry.report.event_type"></span>
              <span class="report-name"><strong>{{ reportName(entry.report) }}</strong><small>{{ entry.report.event_type }}</small></span>
              <time>{{ entry.time }}</time>
            </button>
          </div>
          <div v-else class="empty-state">{{ reports.length ? '当前筛选下没有事件' : '点击左侧操作，或切换页面，查看监控报告。' }}</div>
          <pre class="json-panel"><code>{{ selectedJson || '// 选择一条报告查看原始 JSON' }}</code></pre>
        </section>
      </div>
    </main>
  </div>
</template>
