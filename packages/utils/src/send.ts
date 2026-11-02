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

/** 批量事件发送函数；非浏览器宿主（如小程序）可注入自己的传输实现。 */
export type ReportBatchSender = (batch: QueueReportData[]) => boolean | Promise<boolean>

/** 与 core 的 ReportStrategy 结构一致，避免 utils 反向依赖 core。 */
export interface ReportStrategyLike {
  enqueue(data: QueueReportData, immediate: boolean): void
  flush(): void
}

export interface FlushReportOptions {
  transport?: ReportTransport
  /** 是否连未达到条数/体积阈值的数据也立即发送。 */
  includePartial?: boolean
  /** 自定义批量发送实现；提供时忽略 transport。 */
  sender?: ReportBatchSender
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

/** 无 TextEncoder 运行时（部分小程序 JS 引擎）的 UTF-8 字节数回退。 */
const utf8ByteLength = (value: string): number => {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

let textEncoder: TextEncoder | undefined

const byteLength = (value: string): number => {
  if (typeof TextEncoder === 'undefined') return utf8ByteLength(value)
  textEncoder ??= new TextEncoder()
  return textEncoder.encode(value).byteLength
}

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
  sender?: ReportBatchSender,
): Promise<boolean> => {
  while (getCacheSize() > 0 && (includePartial || hasReachedThreshold())) {
    const batch = takeCache(getNextBatchCount())
    if (!batch.length) break

    const sent = sender ? await sender(batch) : await sendReport(batch, transport)
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
  const { transport = 'auto', includePartial = true, sender } = options
  // beacon 是同步退出通道；使用自定义 sender 时必须走异步 drain。
  if (transport === 'beacon' && !sender) {
    return Promise.resolve(drainQueueByBeacon(includePartial))
  }
  if (flushingPromise) return flushingPromise

  flushingPromise = drainQueue(includePartial, transport, sender).finally(() => {
    flushingPromise = null
  })
  return flushingPromise
}

/** 入队；达到条数、体积阈值或 immediate=true 时触发 flush。 */
export const lazyReportBatch = async (
  data: QueueReportData,
  immediate = false,
  sender?: ReportBatchSender,
): Promise<boolean> => {
  addCache(data)

  if (immediate) {
    await flushReportQueue({ includePartial: true, sender })
    return getCacheSize() === 0 ? true : flushReportQueue({ includePartial: true, sender })
  }
  if (!hasReachedThreshold()) return true
  return flushReportQueue({ includePartial: true, sender })
}

/** 用自定义传输实现组装策略对象，供 createReporter 直接使用。 */
export const createReportStrategy = (sender: ReportBatchSender): ReportStrategyLike => ({
  enqueue(data, immediate) { void lazyReportBatch(data, immediate, sender) },
  flush() { void flushReportQueue({ includePartial: true, sender }) },
})

export const sendByImg = sendByImage
export const sendAjax = sendByAjax
export const sendBeacon = sendByBeacon
export const report = sendReport
