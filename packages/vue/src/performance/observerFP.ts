import type { ReportData } from '@weils-monitor/shared'

// 首次绘制时间 (First Paint, FP)，标准 <= 1s
export const observerFP = (): void => {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    console.warn('浏览器不支持 PerformanceObserver，无法监控 FP')
    return
  }

  const entryHandler: PerformanceObserverCallback = (entries, observer): void => {
    const entry = entries.getEntries().find(({ name }) => name === 'first-paint')
    if (!entry) return

    observer.disconnect()

    const reportData: ReportData = {
      ...entry.toJSON(),
      type: 'performance',
      subType: 'first-paint',
      pageURL: window.location.href,
    }

    console.log(reportData)
    // lazyReportBatch(reportData)
  }

  const observer = new PerformanceObserver(entryHandler)

  try {
    observer.observe({ type: 'paint', buffered: true })
  } catch {
    observer.disconnect()
    console.warn('当前浏览器不支持 FP 监控')
  }
}
