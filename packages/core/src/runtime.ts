import { config } from '@weils-monitor/shared'
import type { InitOptions, QueueReportData } from '@weils-monitor/shared'
import { flushReportQueue, lazyReportBatch, setConfig } from '@weils-monitor/utils'
import { collectCommonFields } from './context'

export type ReportHandler = (data: QueueReportData) => void
export type ReportDecorator = (next: ReportHandler) => ReportHandler

/** A platform adapter supplies context, visibility, and lifecycle hooks. */
export interface ReportAdapter {
  collect(): Partial<QueueReportData>
  publish(data: QueueReportData): void
  onExit(flush: () => void): void
}

/** A strategy decides how normalized events reach the transport. */
export interface ReportStrategy {
  enqueue(data: QueueReportData, immediate: boolean): void
  flush(): void
}

export const REPORT_EVENT = 'weils-monitor:report'

export const browserAdapter: ReportAdapter = {
  collect: collectCommonFields,
  publish(data) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(REPORT_EVENT, { detail: data }))
    }
  },
  onExit(flush) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    window.addEventListener('pagehide', flush, true)
    window.addEventListener('beforeunload', flush, true)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    }, true)
  },
}

export const batchStrategy: ReportStrategy = {
  enqueue(data, immediate) { void lazyReportBatch(data, immediate) },
  flush() { void flushReportQueue({ transport: 'beacon' }) },
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const createEventId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export const normalizeReportData = (
  data: QueueReportData,
  adapter: ReportAdapter = browserAdapter,
): QueueReportData => {
  const timestamp = Number(data.timestamp)
  return {
    ...adapter.collect(),
    ...data,
    event_id: typeof data.event_id === 'string' && UUID_PATTERN.test(data.event_id)
      ? data.event_id : createEventId(),
    timestamp: Number.isInteger(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    app_id: String(data.app_id || config.appId || config.appKey || ''),
    projectName: String(config.projectName || ''),
  } as QueueReportData
}

/** Decorator: enrich an event once, before any queue or subscriber sees it. */
export const withNormalization = (adapter: ReportAdapter): ReportDecorator =>
  (next) => (data) => next(normalizeReportData(data, adapter))

/** Decorator: publish the final event for local integrations and debugging. */
export const withPublication = (adapter: ReportAdapter): ReportDecorator =>
  (next) => (data) => {
    if (config.debug) console.log('[weils-monitor]', data)
    adapter.publish(data)
    next(data)
  }

/** Factory: compose adapter, transport strategy, and ordered decorators. */
export const createReporter = (
  adapter: ReportAdapter = browserAdapter,
  strategy: ReportStrategy = batchStrategy,
  decorators: ReportDecorator[] = [withNormalization(adapter), withPublication(adapter)],
) => {
  let exitBound = false
  const setupExitFlush = (): void => {
    if (exitBound || (adapter === browserAdapter && typeof window === 'undefined')) return
    adapter.onExit(() => strategy.flush())
    exitBound = true
  }
  const sink: ReportHandler = (data) => {
    setupExitFlush()
    strategy.enqueue(data, data.event_type === 'error' && data.error_type !== 'resource_error')
  }
  const report = decorators.reduceRight((next, decorate) => decorate(next), sink)
  return { report, setupExitFlush }
}

/** Reusable start-once registry for framework-specific collector strategies. */
export const createCollectorRegistry = () => {
  const started = new Map<string, unknown>()
  return {
    start<Result>(name: string, collector: () => Result): Result {
      if (started.has(name)) return started.get(name) as Result
      const result = collector()
      started.set(name, result)
      return result
    },
    stop(): void {
      for (const result of started.values()) {
        if (typeof result === 'function') (result as () => void)()
      }
      started.clear()
    },
  }
}

const defaultReporter = createReporter()
export const report = (data: QueueReportData): void => defaultReporter.report(data)
export const setupExitFlush = (): void => defaultReporter.setupExitFlush()

/** Shared factory initialization; framework packages add their own collectors. */
export const createMonitorCore = (options: InitOptions) => {
  setConfig(options)
  setupExitFlush()
  return { report, collectors: createCollectorRegistry() }
}
