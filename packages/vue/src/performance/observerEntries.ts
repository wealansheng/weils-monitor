import type { EntriesReportData } from '@weils-monitor/shared'
import { isMonitorRequest } from '../context'
import { report } from '../report'

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
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      // 上报请求本身也会产生 resource timing；不排除会形成无限上报闭环。
      if (isMonitorRequest(entry.name)) continue

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
