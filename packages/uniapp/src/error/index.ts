import type { ErrorReportData } from '@weils-monitor/shared'
import type { CollectorContext } from '../types'

interface RuntimeErrorSource {
  onError?: (callback: (error: string) => void) => unknown
  onUnhandledRejection?: (callback: (res: { reason?: unknown }) => void) => unknown
  onPageNotFound?: (callback: (res: { path?: string; query?: Record<string, unknown>; isEntryPage?: boolean }) => void) => unknown
}

type VueErrorHandler = (this: unknown, err: unknown, vm: unknown, info: string) => void

interface VueTarget {
  config?: {
    errorHandler?: VueErrorHandler
  }
}

const bind = <Payload>(
  source: RuntimeErrorSource | undefined,
  name: keyof RuntimeErrorSource,
  handler: (payload: Payload) => void,
): void => {
  const register = source?.[name] as ((callback: (payload: Payload) => void) => unknown) | undefined
  if (typeof register !== 'function') return
  try { register.call(source, handler) } catch { /* unsupported runtime */ }
}

const describeStack = (value: string): { name?: string; message: string } => {
  const line = value.split('\n')[0]?.trim() ?? ''
  const separator = line.indexOf(':')
  if (separator > 0) {
    return { name: line.slice(0, separator).trim() || undefined, message: line.slice(separator + 1).trim() || line }
  }
  return { message: line || 'Unknown mini-program error' }
}

const errorReason = (reason: unknown): {
  text: string
  name?: string
  stack?: string
} => {
  if (reason instanceof Error) {
    return { text: reason.message, name: reason.name, stack: reason.stack }
  }
  if (reason && typeof reason === 'object') {
    const record = reason as { message?: unknown; name?: unknown; stack?: unknown }
    return {
      text: String(record.message ?? reason),
      name: typeof record.name === 'string' ? record.name : undefined,
      stack: typeof record.stack === 'string' ? record.stack : undefined,
    }
  }
  return { text: String(reason) }
}

/** 采集小程序运行时错误；同一通道只绑定 wx 或 uni 中存在的第一个实现。 */
export const collectError = (context: CollectorContext): void => {
  if (!context.options.runtimeErrors) return
  const sources = [context.runtime.wx, context.runtime.uni].filter(Boolean) as RuntimeErrorSource[]
  const sourceFor = (name: keyof RuntimeErrorSource): RuntimeErrorSource | undefined =>
    sources.find((source) => typeof source[name] === 'function')

  const errorSource = sourceFor('onError')
  if (errorSource) {
    bind<string>(errorSource, 'onError', (stack) => {
      const value = String(stack ?? '')
      const described = describeStack(value)
      const data: ErrorReportData = {
        event_type: 'error',
        error_type: 'js_error',
        message: described.message,
        name: described.name,
        stack: value || undefined,
        tags: { source: 'onError' },
      }
      context.report(data)
    })
  }

  const rejectionSource = sourceFor('onUnhandledRejection')
  if (rejectionSource) {
    bind<{ reason?: unknown }>(rejectionSource, 'onUnhandledRejection', (res) => {
      const reason = errorReason(res?.reason)
      const data: ErrorReportData = {
        event_type: 'error',
        error_type: 'promise_error',
        reason: reason.text,
        message: reason.text,
        name: reason.name,
        stack: reason.stack,
        tags: { source: 'onUnhandledRejection' },
      }
      context.report(data)
    })
  }

  const notFoundSource = sourceFor('onPageNotFound')
  if (notFoundSource) {
    bind<{ path?: string; query?: Record<string, unknown>; isEntryPage?: boolean }>(
      notFoundSource,
      'onPageNotFound',
      (res) => {
        const path = String(res?.path ?? '')
        const data: ErrorReportData = {
          event_type: 'error',
          error_type: 'page_not_found',
          message: path ? `Page not found: ${path}` : 'Page not found',
          url: path || undefined,
          route: path || undefined,
          tags: { source: 'onPageNotFound' },
          extra: { query: res?.query ?? {}, is_entry_page: Boolean(res?.isEntryPage) },
        }
        context.report(data)
      },
    )
  }
}

const componentName = (vm: unknown): string | undefined => {
  if (!vm || typeof vm !== 'object') return undefined
  const options = (vm as { $options?: { name?: string; __name?: string } }).$options
  return options?.name || options?.__name || undefined
}

const installedTargets = new WeakSet<object>()

/**
 * 包装 Vue 2 / Vue 3 全局错误处理器，保留应用原有 handler。
 * Vue 3 传 app 实例，Vue 2 传 Vue 构造器，两者都有 config.errorHandler。
 */
export const installErrorHandler = (target: unknown, context: CollectorContext): void => {
  if (!context.options.frameworkErrors) return
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return

  const record = target as VueTarget
  if (!record.config || typeof record.config !== 'object') return
  if (installedTargets.has(record)) return
  installedTargets.add(record)

  const previous = record.config.errorHandler
  record.config.errorHandler = function monitoredErrorHandler(
    this: unknown,
    err: unknown,
    vm: unknown,
    info: string,
  ): void {
    try {
      const message = err instanceof Error ? err.message : String(err)
      const data: ErrorReportData = {
        event_type: 'error',
        error_type: 'framework_error',
        message,
        name: err instanceof Error ? err.name : undefined,
        stack: err instanceof Error ? err.stack : undefined,
        component: componentName(vm),
        component_stack: info,
        tags: { source: 'vue' },
      }
      context.report(data)
    } finally {
      previous?.call(this, err, vm, info)
    }
  }
}
