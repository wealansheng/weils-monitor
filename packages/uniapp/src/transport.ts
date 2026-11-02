import { config } from '@weils-monitor/shared'
import { createReportStrategy, serializeReportData } from '@weils-monitor/utils'
import type { ReportBatchSender } from '@weils-monitor/utils'
import type { ResolvedRuntime } from './types'

const REQUEST_TIMEOUT = 10_000

const stripQuery = (value: string): string =>
  value.split('#')[0].split('?')[0].replace(/\/+$/, '')

/** 自身上报端点不参与 request 采集，避免形成上报闭环。 */
export const isMonitorEndpoint = (url: string): boolean => {
  if (!url) return false
  const candidatePath = stripQuery(url).replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '')
  const endpointPath = stripQuery(String(config.url ?? '')).replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '')
  if (!candidatePath || !endpointPath) return false
  return candidatePath === endpointPath
}

export const createUniappSender = (runtime: ResolvedRuntime): ReportBatchSender =>
  (batch) => new Promise((resolve) => {
    const request = runtime.uni?.request
    if (typeof request !== 'function') {
      resolve(false)
      return
    }

    let settled = false
    const finish = (success: boolean): void => {
      if (settled) return
      settled = true
      resolve(success)
    }

    try {
      request.call(runtime.uni, {
        url: config.url,
        method: 'POST',
        data: serializeReportData(batch),
        header: { 'content-type': 'application/json' },
        timeout: REQUEST_TIMEOUT,
        success: (res) => {
          const status = Number(res?.statusCode)
          const ok = status >= 200 && status < 300
          if (config.debug) console.log('[weils-monitor] report', status, batch.length)
          finish(ok)
        },
        fail: (err) => {
          if (config.debug) console.warn('[weils-monitor] report failed', config.url, err)
          finish(false)
        },
        // success/fail 至少会调用一个；complete 只作为异常实现的兜底。
        complete: () => finish(false),
      })
    } catch (error) {
      if (config.debug) console.warn('[weils-monitor] report threw', config.url, error)
      finish(false)
    }
  })

export const createUniappStrategy = (runtime: ResolvedRuntime) =>
  createReportStrategy(createUniappSender(runtime))
