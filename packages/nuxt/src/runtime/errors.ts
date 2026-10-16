import type { NuxtApp } from 'nuxt/app'
import type { BehaviorReportData, ErrorReportData } from '@weils-monitor/shared'
import type { MonitorReport } from '../types'

interface ErrorLike {
  message?: string
  name?: string
  stack?: string
  statusCode?: number
  statusMessage?: string
}

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/** Nuxt 的 `createError` 会在 `Error` 实例上挂 `statusCode` / `statusMessage`。 */
const readStatus = (
  record: Record<string, unknown>,
): Pick<ErrorLike, 'statusCode' | 'statusMessage'> => {
  const statusCode = Number(record.statusCode)
  return {
    statusCode: Number.isFinite(statusCode) && statusCode > 0 ? statusCode : undefined,
    statusMessage: typeof record.statusMessage === 'string' ? record.statusMessage : undefined,
  }
}

/** Nuxt 的 `app:error` / `app:chunkError` 可能抛出 `Error`，也可能是 `NuxtError` 普通对象。 */
const asErrorLike = (value: unknown): ErrorLike => {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
      ...readStatus(value as unknown as Record<string, unknown>),
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return {
      message: typeof record.message === 'string' ? record.message : safeStringify(record),
      name: typeof record.name === 'string' ? record.name : undefined,
      stack: typeof record.stack === 'string' ? record.stack : undefined,
      ...readStatus(record),
    }
  }

  return { message: String(value) }
}

/** 动态导入失败时，浏览器会把分块地址写在错误信息里。 */
const CHUNK_URL_PATTERN = /https?:\/\/[^\s'"()]+/

const extractChunkUrl = (message?: string): string | undefined =>
  message?.match(CHUNK_URL_PATTERN)?.[0]

const createTags = (source: string, statusMessage?: string): Record<string, string> => {
  const tags: Record<string, string> = { source }
  if (statusMessage) tags.status_message = statusMessage
  return tags
}

/**
 * Nuxt 框架错误监控。
 *
 * 采集四个 Nuxt 专属错误通道，其中三个输出协议里 `event_type: "error"` 的结构，
 * `app:error:cleared` 输出行为事件：
 *
 * | 来源 | `error_type` | 说明 |
 * | --- | --- | --- |
 * | `app:error` | `nuxt_error` | `createError`、`useAsyncData`/`useFetch`、中间件、插件与挂载错误 |
 * | `app:chunkError` | `nuxt_chunk_error` | 动态导入的分块加载失败 |
 * | 服务端 `payload.error` | `nuxt_ssr_error` | 服务端渲染失败后由客户端补报 |
 * | `app:error:cleared` | —（`behavior`） | 错误页被清除，`action: "nuxt_error_cleared"` |
 *
 * Vue 组件错误不需要在这里重复采集：`@weils-monitor/vue` 安装时包装了 Nuxt 的默认
 * `vueApp.config.errorHandler`，组件错误已上报为 `framework_error`，而 Nuxt 的默认
 * errorHandler 随后还会触发 `app:error` 钩子。本函数位于该链条最外层，先把错误对象
 * 记入去重集合，因此同一次错误只会产生一条 `framework_error`。
 *
 * 返回取消函数。
 */
export const observeNuxtErrors = (
  nuxtApp: NuxtApp,
  report: MonitorReport,
  options: { enabled?: boolean } = {},
): (() => void) => {
  const { enabled = true } = options
  if (!enabled) return () => {}

  /** 已经被其它通道上报过的错误对象，用于避免同一错误重复入队。 */
  const alreadyReported = new WeakSet<object>()
  const vueApp = nuxtApp.vueApp
  const previousHandler = vueApp?.config?.errorHandler

  if (vueApp && typeof previousHandler === 'function') {
    vueApp.config.errorHandler = function (
      this: unknown,
      ...args: Parameters<typeof previousHandler>
    ): void {
      const [err] = args
      if (err && typeof err === 'object') alreadyReported.add(err)
      previousHandler.call(this, ...args)
    }
  }

  // 服务端渲染失败时 Nuxt 把错误写进 payload，客户端启动后补报；
  // 该对象可能再次经 app:error 抛出，先登记去重。
  const payloadError = nuxtApp.payload?.error
  if (payloadError && typeof payloadError === 'object') {
    alreadyReported.add(payloadError)
    const { message, name, stack, statusCode, statusMessage } = asErrorLike(payloadError)
    const reportData: ErrorReportData = {
      event_type: 'error',
      error_type: 'nuxt_ssr_error',
      message,
      name,
      stack,
      status_code: statusCode,
      tags: createTags('ssr', statusMessage),
    }
    report(reportData)
  }

  const stops = [
    nuxtApp.hook('app:error', (error) => {
      if (error && typeof error === 'object' && alreadyReported.has(error)) return

      const { message, name, stack, statusCode, statusMessage } = asErrorLike(error)
      const reportData: ErrorReportData = {
        event_type: 'error',
        error_type: 'nuxt_error',
        message,
        name,
        stack,
        status_code: statusCode,
        tags: createTags('app:error', statusMessage),
      }
      report(reportData)
    }),
    nuxtApp.hook('app:chunkError', ({ error }) => {
      const { message, stack } = asErrorLike(error)
      const reportData: ErrorReportData = {
        event_type: 'error',
        error_type: 'nuxt_chunk_error',
        message,
        stack,
        resource_type: 'chunk',
        resource_url: extractChunkUrl(message),
        tags: createTags('app:chunkError'),
      }
      report(reportData)
    }),
    nuxtApp.hook('app:error:cleared', () => {
      const reportData: BehaviorReportData = {
        event_type: 'behavior',
        action: 'nuxt_error_cleared',
        category: 'nuxt',
      }
      report(reportData)
    }),
  ]

  return () => {
    for (const stop of stops) stop()
  }
}
