import type { ReportData } from '@weils-monitor/shared'
import { report } from '../report'

export const observerLCP = (): void => {
  if (!('PerformanceObserver' in window)) return

  let latestEntry: PerformanceEntry | undefined
  let reported = false

  const observer = new PerformanceObserver((entries) => {
    latestEntry = entries.getEntries().at(-1)
  })

  const finalize = (): void => {
    if (reported || !latestEntry) return
    reported = true
    observer.disconnect()

    const value = latestEntry.startTime
    const reportData: ReportData = {
      event_type: 'performance',
      metric_name: 'LCP',
      value,
      rating: value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor',
      start_time: latestEntry.startTime,
    }
    report(reportData)
  }

  observer.observe({ type: 'largest-contentful-paint', buffered: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalize()
  }, { once: true })
  window.addEventListener('pagehide', finalize, { once: true })
}
