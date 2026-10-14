import type { ReportData } from '@weils-monitor/shared'
import { report } from '../report'

export const observerFCP = (): void => {
  if (!('PerformanceObserver' in window)) return

  const observer = new PerformanceObserver((entries) => {
    const entry = entries.getEntries().find(({ name }) => name === 'first-contentful-paint')
    if (!entry) return

    observer.disconnect()
    const value = entry.startTime
    const reportData: ReportData = {
      event_type: 'performance',
      metric_name: 'FCP',
      value,
      rating: value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor',
      start_time: entry.startTime,
    }
    report(reportData)
  })

  observer.observe({ type: 'paint', buffered: true })
}
