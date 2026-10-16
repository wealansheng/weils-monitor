import type { TTFBReportData } from '@weils-monitor/shared'
import { getTTFBRating } from '@weils-monitor/utils'
import { report } from '../report'

const getNavigationEntry = (): PerformanceNavigationTiming | undefined => {
  const [entry] = window.performance.getEntriesByType('navigation')
  return entry as PerformanceNavigationTiming | undefined
}

/** 监控页面主文档的首次字节时间，并返回清理函数。回调仅用于额外消费，数据始终由 SDK 入队上报。 */
export function observeTTFB(
  callback?: (reportData: TTFBReportData) => void,
): () => void {
  if (typeof window === 'undefined' || !('performance' in window)) {
    console.warn('当前环境不支持 Performance API，无法监控 TTFB')
    return () => {}
  }

  let active = true
  let reported = false
  let observer: PerformanceObserver | null = null
  let loadHandler: (() => void) | null = null

  const stopListening = (): void => {
    observer?.disconnect()
    observer = null

    if (loadHandler) {
      window.removeEventListener('load', loadHandler)
      loadHandler = null
    }
  }

  const reportEntry = (entry: PerformanceNavigationTiming | undefined): boolean => {
    if (!active || reported || !entry || entry.responseStart <= 0) return false

    reported = true
    stopListening()

    const value = Math.max(0, entry.responseStart - entry.startTime)
    const reportData: TTFBReportData = {
      event_type: 'performance',
      metric_name: 'TTFB',
      value,
      rating: getTTFBRating(value),
      start_time: entry.startTime,
    }

    report(reportData)
    callback?.(reportData)

    return true
  }

  const cleanup = (): void => {
    active = false
    stopListening()
  }

  // SDK 延迟初始化时，navigation entry 通常已经存在，可直接上报。
  if (reportEntry(getNavigationEntry())) return cleanup

  if ('PerformanceObserver' in window) {
    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes
    const canObserveNavigation =
      !supportedEntryTypes || supportedEntryTypes.includes('navigation')

    if (canObserveNavigation) {
      try {
        observer = new PerformanceObserver((list) => {
          const entry = list
            .getEntries()
            .find(({ entryType }) => entryType === 'navigation') as
            | PerformanceNavigationTiming
            | undefined

          reportEntry(entry)
        })
        observer.observe({ type: 'navigation', buffered: true })
      } catch {
        observer?.disconnect()
        observer = null
      }
    }
  }

  // 某些浏览器不能观察 navigation，但仍可在 load 后读取 Navigation Timing。
  loadHandler = (): void => {
    reportEntry(getNavigationEntry())
  }

  if (document.readyState === 'complete') {
    queueMicrotask(loadHandler)
  } else {
    window.addEventListener('load', loadHandler, { once: true })
  }

  return cleanup
}
