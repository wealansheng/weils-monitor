import type { StabilityReportData } from '@weils-monitor/shared'
import { report } from '../report'

export interface BlankScreenOptions {
  /** 首次检查空白屏的等待时间，默认 3000ms。 */
  threshold?: number
  /** 作为应用根节点检查的选择器，默认 #app。 */
  rootSelector?: string
}

/** 启动空白屏检查，返回清理函数。 */
export const observerBlankScreen = (options: BlankScreenOptions = {}): (() => void) => {
  const threshold = Math.max(0, options.threshold ?? 3000)
  const startedAt = Date.now()

  const timer = window.setTimeout(() => {
    const root = document.querySelector(options.rootSelector ?? '#app')
    const rootNodeCount = root?.querySelectorAll('*').length ?? 0
    const hasVisibleContent = Boolean(root?.textContent?.trim() || root?.children.length)

    if (!root || !hasVisibleContent) {
      const reportData: StabilityReportData = {
        event_type: 'stability',
        issue_type: 'blank_screen',
        blank_time: Date.now() - startedAt,
        root_node_count: rootNodeCount,
      }
      report(reportData)
    }
  }, threshold)

  return () => window.clearTimeout(timer)
}
