import type { ReportData } from '@weils-monitor/shared'

// 首次输入延迟 (First Input Delay, FID)，标准 <= 100ms
export const observerFID = (): void => {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    console.warn('浏览器不支持 PerformanceObserver，无法监控 FID')
    return
  }

  const entryHandler: PerformanceObserverCallback = (entries, observer): void => {
    const [entry] = entries.getEntries() as PerformanceEventTiming[]
    if (!entry) return

    observer.disconnect()

    // FID 是用户首次交互发生后，到浏览器开始处理事件之间的延迟。
    const firstInputDelay = Math.max(0, entry.processingStart - entry.startTime)
    const reportData: ReportData = {
      ...entry.toJSON(),
      duration: firstInputDelay,
      type: 'performance',
      subType: 'first-input',
      pageURL: window.location.href,
    }

    console.log(reportData)
    // lazyReportBatch(reportData)
  }

  const observer = new PerformanceObserver(entryHandler)

  try {
    observer.observe({ type: 'first-input', buffered: true })
  } catch {
    observer.disconnect()
    console.warn('当前浏览器不支持 FID 监控')
  }
}
