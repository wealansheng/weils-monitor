import { config } from '@weils-monitor/shared'
import type { EntriesReportData } from '@weils-monitor/shared'
import { isMonitorRequest } from '../context'
import { report } from '../report'

/** resource 事件的最小耗时阈值（毫秒）默认值。 */
export const DEFAULT_RESOURCE_DURATION_THRESHOLD = 100

/**
 * 读取 resource 事件的耗时阈值。
 * `0` 表示不过滤；非法值（NaN、负数）回落到默认阈值。
 */
export const getResourceDurationThreshold = (): number => {
  const value = Number(config.resourceDurationThreshold ?? DEFAULT_RESOURCE_DURATION_THRESHOLD)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_RESOURCE_DURATION_THRESHOLD
}

export const observerEntries = (): void => {
  if (document.readyState === 'complete') {
    observerEvent()
  } else {
    window.addEventListener('load', observerEvent, { once: true, capture: true })
  }
}

export const observerEvent = (): void => {
  if (!('PerformanceObserver' in window)) return

  const observer = new PerformanceObserver((list) => {
    const threshold = getResourceDurationThreshold()

    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      // 上报请求本身也会产生 resource timing；不排除会形成无限上报闭环。
      if (isMonitorRequest(entry.name)) continue

      // 低于阈值的资源不上报：开发服务器会为每个模块单独发一次请求（动辄数百条），
      // 缓存命中和极快请求也没有排查价值。阈值由 resourceDurationThreshold 配置。
      if (entry.duration < threshold) continue

      const reportData: EntriesReportData = {
        event_type: 'performance',
        metric_name: 'resource',
        name: entry.name,
        initiator_type: entry.initiatorType,
        duration: entry.duration,
        transfer_size: entry.transferSize,
        encoded_body_size: entry.encodedBodySize,
        start_time: entry.startTime,
      }

      report(reportData)
    }
  })

  observer.observe({ type: 'resource', buffered: true })
}

export default observerEntries
