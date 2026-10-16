import type { ReportData } from '@weils-monitor/shared'
import { report } from '../report'

/** 采集主线程超过 50ms 的长任务。 */
export const observerLongTask = (): (() => void) => {
  if (!('PerformanceObserver' in window)) return () => {}

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const reportData: ReportData = {
        event_type: 'performance',
        metric_name: 'longtask',
        duration: entry.duration,
        start_time: entry.startTime,
      }
      report(reportData)
    }
  })

  try {
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    observer.disconnect()
  }

  return () => observer.disconnect()
}
