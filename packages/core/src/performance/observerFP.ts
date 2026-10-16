import type { ReportData } from '@weils-monitor/shared'
import { report } from '../report'

export const observerFP = (): void => {
  if (!('PerformanceObserver' in window)) return

  const observer = new PerformanceObserver((entries) => {
    const entry = entries.getEntries().find(({ name }) => name === 'first-paint')
    if (!entry) return

    observer.disconnect()
    const reportData: ReportData = {
      event_type: 'performance',
      metric_name: 'FP',
      value: entry.startTime,
      start_time: entry.startTime,
    }
    report(reportData)
  })

  observer.observe({ type: 'paint', buffered: true })
}
