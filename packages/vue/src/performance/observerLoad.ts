import type { LoadReportData } from '@weils-monitor/shared'
import { report } from '../report'

export const observerLoad = (): void => {
  const collect = (): void => {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (!entry) return

    const reportData: LoadReportData = {
      event_type: 'performance',
      metric_name: 'navigation',
      dns: Math.max(0, entry.domainLookupEnd - entry.domainLookupStart),
      tcp: Math.max(0, entry.connectEnd - entry.connectStart),
      ssl: entry.secureConnectionStart > 0
        ? Math.max(0, entry.connectEnd - entry.secureConnectionStart)
        : 0,
      request: Math.max(0, entry.responseStart - entry.requestStart),
      response: Math.max(0, entry.responseEnd - entry.responseStart),
      dom_ready: Math.max(0, entry.domContentLoadedEventEnd - entry.startTime),
      load: Math.max(0, entry.loadEventEnd - entry.startTime),
    }
    report(reportData)
  }

  if (document.readyState === 'complete') {
    queueMicrotask(collect)
  } else {
    window.addEventListener('load', collect, { once: true })
  }
}
