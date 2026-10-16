import type { NuxtApp } from 'nuxt/app'
import { getHydrationRating } from '@weils-monitor/utils'
import type { PerformanceReportData } from '@weils-monitor/shared'
import type { MonitorReport } from '../types'

const now = (): number => globalThis.performance?.now?.() ?? Date.now()

/**
 * 水合耗时监控。
 *
 * Nuxt 客户端启动顺序（见 nuxt/dist/app/entry.js）为
 * `applyPlugins` → `app:created` → `app:beforeMount` → `vueApp.mount()` → `app:mounted`，
 * 其中 `mount()` 才是 Vue 把服务端 HTML 变成可交互应用的水合阶段，根组件的
 * Suspense 解析完成后触发 `app:suspense:resolve`。因此上报两条指标：
 *
 * - `nuxt_hydration`：`app:beforeMount` → `app:mounted`，纯水合耗时。
 * - `nuxt_hydration_complete`：`app:beforeMount` → `app:suspense:resolve`，
 *   含 Suspense 与 `useAsyncData` 等异步数据就绪的完整首屏耗时。
 *
 * 只有服务端渲染过的页面才存在水合过程；纯 SPA 首屏是全新挂载，不计入水合耗时。
 * 返回取消函数，便于测试或按需停止采集。
 */
export const observeHydration = (
  nuxtApp: NuxtApp,
  report: MonitorReport,
  options: { enabled?: boolean } = {},
): (() => void) => {
  const { enabled = true } = options
  if (!enabled || nuxtApp.payload?.serverRendered !== true) return () => {}

  let start: number | undefined
  let hydrationDone = false
  let completeDone = false

  const emit = (metricName: string, duration: number, startTime: number): void => {
    const reportData: PerformanceReportData = {
      event_type: 'performance',
      metric_name: metricName,
      value: duration,
      duration,
      start_time: startTime,
      rating: getHydrationRating(duration),
    }
    report(reportData)
  }

  const stopBeforeMount = nuxtApp.hook('app:beforeMount', () => {
    start = now()
  })

  const stopMounted = nuxtApp.hook('app:mounted', () => {
    if (start === undefined || hydrationDone) return
    hydrationDone = true
    emit('nuxt_hydration', Math.max(0, now() - start), start)
  })

  const stopSuspense = nuxtApp.hook('app:suspense:resolve', () => {
    if (start === undefined || completeDone) return
    completeDone = true
    emit('nuxt_hydration_complete', Math.max(0, now() - start), start)
  })

  return () => {
    stopBeforeMount()
    stopMounted()
    stopSuspense()
  }
}
