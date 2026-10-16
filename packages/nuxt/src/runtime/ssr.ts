import { getSSRRating } from '@weils-monitor/utils'
import type { PerformanceReportData } from '@weils-monitor/shared'
import type { MonitorReport } from '../types'
import { SSR_METRIC_NAME, SSR_TIMING_NAME } from './constants'

/** 从 Navigation Timing 的 Server-Timing 中读取服务端渲染耗时（毫秒）。 */
export const readSsrDuration = (
  timingName: string = SSR_TIMING_NAME,
): number | undefined => {
  const performanceApi = globalThis.performance
  if (typeof performanceApi?.getEntriesByType !== 'function') return undefined

  const [entry] = performanceApi.getEntriesByType('navigation') as PerformanceNavigationTiming[]
  const timing = entry?.serverTiming?.find((item) => item.name === timingName)
  if (!timing || !Number.isFinite(timing.duration) || timing.duration < 0) return undefined

  return timing.duration
}

/** 上报一条 `nuxt_ssr_render` 性能事件；返回是否取到了服务端耗时。 */
export const reportSsrTiming = (
  report: MonitorReport,
  timingName: string = SSR_TIMING_NAME,
): boolean => {
  const duration = readSsrDuration(timingName)
  if (duration === undefined) return false

  const reportData: PerformanceReportData = {
    event_type: 'performance',
    metric_name: SSR_METRIC_NAME,
    value: duration,
    duration,
    rating: getSSRRating(duration),
  }
  report(reportData)

  return true
}

/**
 * 服务端渲染耗时监控。
 *
 * 服务端只负责把耗时写进 `Server-Timing` 响应头（见 `./server/plugin.ts`），
 * 由客户端读取后上报：SDK 的上报通道（XHR / sendBeacon / Image）只在浏览器可用，
 * 服务端没有可用的传输方式，客户端上报还能复用同一套队列与批量规则。
 *
 * 返回取消函数。部分浏览器在客户端插件执行时尚未填充 `serverTiming`，会在 `load` 时补采一次。
 */
export const observeSsrTiming = (
  report: MonitorReport,
  options: { enabled?: boolean; timingName?: string } = {},
): (() => void) => {
  const { enabled = true, timingName = SSR_TIMING_NAME } = options
  if (!enabled) return () => {}

  if (reportSsrTiming(report, timingName)) return () => {}
  if (typeof window === 'undefined') return () => {}

  const retry = (): void => {
    reportSsrTiming(report, timingName)
  }

  window.addEventListener('load', retry, { once: true })
  return () => window.removeEventListener('load', retry)
}
