import { sanitizeQueryString } from '@weils-monitor/core/reporter'
import type { PerformanceReportData, Rating } from '@weils-monitor/shared'
import { whenRouteReady } from '../route'
import { isMonitorEndpoint } from '../transport'
import type { CollectorContext, WxPerformanceEntry } from '../types'

const ENTRY_TYPES = ['navigation', 'render', 'script', 'loadPackage'] as const
const OBSERVED_TYPES = new Set<string>(ENTRY_TYPES)

const rateBoot = (value: number): Rating => {
  if (value <= 1000) return 'good'
  if (value <= 2500) return 'needs-improvement'
  return 'poor'
}

const sanitizeRequestUrl = (url: string): string => {
  const index = url.indexOf('?')
  if (index < 0) return url
  const query = sanitizeQueryString(url.slice(index + 1))
  return query ? `${url.slice(0, index + 1)}${query}` : url.slice(0, index)
}

const reportEntry = (
  context: CollectorContext,
  entry: WxPerformanceEntry,
  seen: Set<string>,
): void => {
  const type = String(entry.entryType ?? '')
  if (!OBSERVED_TYPES.has(type)) return

  const name = String(entry.name ?? type)
  const start = Number(entry.startTime)
  const duration = Number(entry.duration)
  if (!Number.isFinite(duration) || duration < 0) return

  const key = `${type}|${name}|${Number.isFinite(start) ? start : duration}`
  if (seen.has(key)) return
  seen.add(key)

  const data: PerformanceReportData = {
    event_type: 'performance',
    metric_name: `mp_${type}`,
    name,
    value: duration,
    duration,
    start_time: Number.isFinite(start) ? start : undefined,
  }
  if (type === 'navigation' || type === 'render') data.rating = rateBoot(duration)
  context.report(data)
}

/**
 * 启动性能：优先使用 wx.getPerformance().createObserver 的 navigation/render/
 * script/loadPackage 指标；同时上报 SDK 初始化到首路由就绪的 mp_launch。
 */
export const collectLaunch = (context: CollectorContext): void => {
  if (!context.options.performance) return
  const seen = new Set<string>()
  const performance = (() => {
    try { return context.runtime.wx?.getPerformance?.() } catch { return undefined }
  })()

  if (performance && typeof performance.createObserver === 'function') {
    try {
      const observer = performance.createObserver((entryList) => {
        let entries: unknown
        try {
          entries = Array.isArray(entryList) ? entryList : entryList?.getEntries?.()
        } catch { return /* broken host entry list */ }
        if (!Array.isArray(entries)) return
        for (const entry of entries) {
          if (entry && typeof entry === 'object') reportEntry(context, entry, seen)
        }
      })
      observer?.observe?.({ entryTypes: [...ENTRY_TYPES] })
    } catch { /* old base library: fall back to mp_launch only */ }
  }

  whenRouteReady(context.runtime, () => {
    const duration = Math.max(0, context.runtime.now() - context.startedAt)
    context.report({
      event_type: 'performance',
      metric_name: 'mp_launch',
      value: duration,
      duration,
      start_time: 0,
      rating: rateBoot(duration),
    })
  })
}

/** 通过 uni.addInterceptor 采集 uni.request；不采集请求/响应体。 */
export const collectRequest = (context: CollectorContext): void => {
  if (!context.options.requests) return
  const uni = context.runtime.uni
  if (typeof uni?.addInterceptor !== 'function') return

  try {
    uni.addInterceptor('request', {
      invoke(args) {
        if (!args || typeof args !== 'object') return args
        const record = args as Record<string, unknown>
        if (record.__weilsRequest) return record

        const url = typeof record.url === 'string' ? record.url : ''
        if (!url || isMonitorEndpoint(url)) return record
        record.__weilsRequest = true

        const start = context.runtime.now()
        const method = String(record.method ?? 'GET').toUpperCase()
        const originalSuccess = record.success as ((res: unknown) => void) | undefined
        const originalFail = record.fail as ((res: unknown) => void) | undefined
        let finished = false

        const finish = (completed: boolean, result: unknown): void => {
          if (finished) return
          finished = true

          const duration = Math.max(0, context.runtime.now() - start)
          if (duration < context.options.requestDurationThreshold) return

          const rawStatus = Number((result as { statusCode?: unknown } | undefined)?.statusCode)
          const status = Number.isFinite(rawStatus) ? rawStatus : completed ? 200 : 0
          context.report({
            event_type: 'request',
            url: sanitizeRequestUrl(url),
            method,
            status_code: status,
            duration,
            success: completed && status >= 200 && status < 300,
          })
        }

        record.success = function monitoredRequestSuccess(this: unknown, res: unknown): void {
          try { finish(true, res) } finally { originalSuccess?.call(this, res) }
        }
        record.fail = function monitoredRequestFail(this: unknown, res: unknown): void {
          try { finish(false, res) } finally { originalFail?.call(this, res) }
        }
        return record
      },
    })
  } catch { /* this runtime does not support request interceptors */ }
}
