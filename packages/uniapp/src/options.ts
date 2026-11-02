import type { InitOptions } from '@weils-monitor/shared'
import type { ResolvedOptions, UniappMonitorOptions } from './types'

const normalizeThreshold = (value: unknown): number => {
  const threshold = Number(value)
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : 0
}

export const resolveOptions = (options: UniappMonitorOptions): ResolvedOptions => ({
  ...options,
  runtimeErrors: options.runtimeErrors !== false,
  frameworkErrors: options.frameworkErrors !== false,
  requests: options.requests !== false,
  requestDurationThreshold: normalizeThreshold(options.requestDurationThreshold),
  performance: options.performance !== false,
  routeChange: options.routeChange !== false,
  pageView: options.pageView !== false,
  memoryWarning: options.memoryWarning !== false,
})

/** 只把 SDK 通用配置写进共享 config，避免 runtime/开关等字段污染全局配置。 */
export const toInitOptions = (options: UniappMonitorOptions): Partial<InitOptions> => {
  const {
    runtime: _runtime,
    runtimeErrors: _runtimeErrors,
    frameworkErrors: _frameworkErrors,
    requests: _requests,
    requestDurationThreshold: _requestDurationThreshold,
    performance: _performance,
    routeChange: _routeChange,
    pageView: _pageView,
    memoryWarning: _memoryWarning,
    ...initOptions
  } = options
  return initOptions
}
