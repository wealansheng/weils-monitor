import {
  VERSION,
  addCache,
  config,
  getCache,
  getCacheSize,
  prependCache,
  takeCache,
} from '@weils-monitor/shared'
import type { QueueReportData } from '@weils-monitor/shared'

export type ReportTransport = 'auto' | 'image' | 'ajax' | 'beacon'

export interface FlushReportOptions {
  transport?: ReportTransport
  /** 是否连未达到条数/体积阈值的数据也立即发送。 */
  includePartial?: boolean
}

export interface ReportEnvelope {
  app_id: string
  projectName: string
  sdk_version: string
  send_time: number
  sample_rate: number
  events: unknown[]
}

const REQUEST_TIMEOUT = 10_000
let flushingPromise: Promise<boolean> | null = null

const getBatchSize = (): number => {
  const value = Math.floor(Number(config.batchSize))
  return Number.isFinite(value) && value > 0 ? value : 20
}

const getMaxBatchBytes = (): number => {
  const value = Math.floor(Number(config.maxBatchBytes))
  return Number.isFinite(value) && value > 0 ? value : 50 * 1024
}

const getSampleRate = (): number => {
  const value = Number(config.sampleRate ?? 1)
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
}

const safeStringify = (data: unknown): string => {
  const seen = new WeakSet<object>()

  return JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString()
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack }
    }
    if (typeof Element !== 'undefined' && value instanceof Element) return value.outerHTML
    if (typeof EventTarget !== 'undefined' && value instanceof EventTarget) {
      return `[${value.constructor.name}]`
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  })
}

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength

export const createReportEnvelope = (data: unknown | unknown[]): ReportEnvelope => ({
  app_id: String(config.appId || config.appKey || ''),
  projectName: String(config.projectName || ''),
  sdk_version: VERSION,
  send_time: Date.now(),
  sample_rate: getSampleRate(),
  events: Array.isArray(data) ? data : [data],
})

/** 序列化为服务端约定的批量事件包。 */
export const serializeReportData = (data: unknown | unknown[]): string =>
  safeStringify(createReportEnvelope(data))

const getQueueBytes = (): number => byteLength(safeStringify(getCache()))

const getNextBatchCount = (): number => {
  const pending = getCache()
  const countLimit = Math.min(getBatchSize(), pending.length)
  const byteLimit = getMaxBatchBytes()
  let count = 0
  let bytes = byteLength(safeStringify(createReportEnvelope([])))

  for (const event of pending.slice(0, countLimit)) {
    const eventBytes = byteLength(safeStringify(event)) + 1
    if (count > 0 && bytes + eventBytes > byteLimit) break
    bytes += eventBytes
    count += 1
  }

  return Math.max(1, count)
}

const createImageUrl = (payload: string): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const url = new URL(config.url, window.location.href)
    url.searchParams.set('data', payload)
    return url.toString()
  } catch {
    return null
  }
}

/** 兼容旧配置的图片上报；标准监控端点默认使用 POST。 */
export const sendByImage = (data: unknown | unknown[]): Promise<boolean> => {
  if (typeof Image === 'undefined') return Promise.resolve(false)
  const url = createImageUrl(serializeReportData(data))
  if (!url) return Promise.resolve(false)

  return new Promise((resolve) => {
    const image = new Image(1, 1)
    let settled = false
    const finish = (success: boolean): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(success)
    }
    const timer = window.setTimeout(() => finish(false), REQUEST_TIMEOUT)
    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    image.src = url
  })
}

export const sendByAjax = (data: unknown | unknown[]): Promise<boolean> => {
  if (typeof XMLHttpRequest === 'undefined') return Promise.resolve(false)
  const payload = serializeReportData(data)

  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    let settled = false
    const finish = (success: boolean): void => {
      if (settled) return
      settled = true
      resolve(success)
    }

    try {
      request.open('POST', config.url, true)
      request.timeout = REQUEST_TIMEOUT
      request.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
      request.onload = () => finish(request.status >= 200 && request.status < 300)
      request.onerror = () => finish(false)
      request.onabort = () => finish(false)
      request.ontimeout = () => finish(false)
      request.send(payload)
    } catch {
      finish(false)
    }
  })
}

export const sendByBeacon = (data: unknown | unknown[]): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false
  const payload = serializeReportData(data)

  try {
    const body: BodyInit = typeof Blob === 'undefined'
      ? payload
      : new Blob([payload], { type: 'application/json;charset=UTF-8' })
    return navigator.sendBeacon(config.url, body)
  } catch {
    return false
  }
}

export const sendReport = async (
  data: unknown | unknown[],
  transport: ReportTransport = 'auto',
): Promise<boolean> => {
  const resolvedTransport = transport === 'auto' ? 'ajax' : transport
  if (resolvedTransport === 'beacon') return sendByBeacon(data)
  if (resolvedTransport === 'image') return sendByImage(data)
  return sendByAjax(data)
}

const hasReachedThreshold = (): boolean =>
  getCacheSize() >= getBatchSize() || getQueueBytes() >= getMaxBatchBytes()

const drainQueue = async (
  includePartial: boolean,
  transport: ReportTransport,
): Promise<boolean> => {
  while (getCacheSize() > 0 && (includePartial || hasReachedThreshold())) {
    const batch = takeCache(getNextBatchCount())
    if (!batch.length) break

    const sent = await sendReport(batch, transport)
    if (!sent) {
      prependCache(batch)
      return false
    }
  }
  return true
}

/** unload 生命周期内同步调用 sendBeacon，避免异步循环只发送首个分片。 */
const drainQueueByBeacon = (includePartial: boolean): boolean => {
  while (getCacheSize() > 0 && (includePartial || hasReachedThreshold())) {
    const batch = takeCache(getNextBatchCount())
    if (!batch.length) break
    if (!sendByBeacon(batch)) {
      prependCache(batch)
      return false
    }
  }
  return true
}

export const flushReportQueue = (
  options: FlushReportOptions = {},
): Promise<boolean> => {
  const { transport = 'auto', includePartial = true } = options
  if (transport === 'beacon') {
    return Promise.resolve(drainQueueByBeacon(includePartial))
  }
  if (flushingPromise) return flushingPromise

  flushingPromise = drainQueue(includePartial, transport).finally(() => {
    flushingPromise = null
  })
  return flushingPromise
}

/** 入队；达到条数、体积阈值或 immediate=true 时触发 flush。 */
export const lazyReportBatch = async (
  data: QueueReportData,
  immediate = false,
): Promise<boolean> => {
  addCache(data)

  if (immediate) {
    await flushReportQueue({ includePartial: true })
    return getCacheSize() === 0 ? true : flushReportQueue({ includePartial: true })
  }
  if (!hasReachedThreshold()) return true
  return flushReportQueue({ includePartial: true })
}

export const sendByImg = sendByImage
export const sendAjax = sendByAjax
export const sendBeacon = sendByBeacon
export const report = sendReport
