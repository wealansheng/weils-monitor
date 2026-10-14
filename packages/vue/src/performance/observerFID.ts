import type { ReportData } from '@weils-monitor/shared'
import { report } from '../report'

export const observerFID = (): void => {
  if (!('PerformanceObserver' in window)) return

  const observer = new PerformanceObserver((entries) => {
    const [entry] = entries.getEntries() as PerformanceEventTiming[]
    if (!entry) return

    observer.disconnect()
    const value = Math.max(0, entry.processingStart - entry.startTime)
    const reportData: ReportData = {
      event_type: 'performance',
      metric_name: 'FID',
      value,
      rating: value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor',
      start_time: entry.startTime,
    }
    report(reportData)
  })

  try {
    observer.observe({ type: 'first-input', buffered: true })
  } catch {
    observer.disconnect()
  }
}
