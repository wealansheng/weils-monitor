import type { StabilityReportData } from '@weils-monitor/shared'
import type { CollectorContext } from '../types'

/** 小程序端稳定性采集：内存告警。空白屏检测依赖 DOM，不适用。 */
export const collectMemoryWarning = (context: CollectorContext): void => {
  if (!context.options.memoryWarning) return

  for (const source of [context.runtime.wx, context.runtime.uni]) {
    const register = source?.onMemoryWarning
    if (typeof register !== 'function') continue
    try {
      register.call(source, () => {
        const data: StabilityReportData = {
          event_type: 'stability',
          issue_type: 'memory_warning',
        }
        context.report(data)
      })
      return
    } catch { /* try the next runtime */ }
  }
}
