import type { BehaviorReportData, BehaviorTarget } from '@weils-monitor/shared'
import {
  markPageView,
  pageRoute,
  readRouteState,
  routeFromUrl,
  whenRouteReady,
} from '../route'
import type { PageRoute } from '../route'
import type { CollectorContext } from '../types'

const ROUTE_APIS = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'] as const

const messageOf = (value: unknown): string | undefined => {
  if (value && typeof value === 'object') {
    const message = (value as { errMsg?: unknown }).errMsg
    if (typeof message === 'string') return message
  }
  return typeof value === 'string' ? value : undefined
}

const reportPageView = (
  context: CollectorContext,
  route: PageRoute,
  referrer?: string,
): void => {
  if (!markPageView(context.runtime, route, context.runtime.now())) return
  context.report({
    event_type: 'behavior',
    action: 'page_view',
    page_url: route.fullPath || undefined,
    route: route.path || undefined,
    referrer: referrer || undefined,
  })
}

/** 初始页面访问：等待 getCurrentPages 出现首屏页面后上报。 */
export const collectPageView = (context: CollectorContext): void => {
  if (!context.options.pageView) return
  whenRouteReady(context.runtime, () => {
    if (!context.options.pageView) return
    const state = readRouteState(context.runtime)
    reportPageView(context, state.current, state.referrer)
  })
}

/** 拦截 uni 路由 API，上报 route_change 与成功后的 page_view。 */
export const collectPageChange = (context: CollectorContext): void => {
  if (!context.options.routeChange && !context.options.pageView) return
  const uni = context.runtime.uni
  if (typeof uni?.addInterceptor !== 'function') return

  for (const api of ROUTE_APIS) {
    try {
      uni.addInterceptor(api, {
        invoke(args) {
          if (!args || typeof args !== 'object') return args
          const record = args as Record<string, unknown>
          if (record.__weilsRoute) return record
          record.__weilsRoute = true

          const start = context.runtime.now()
          const fromState = readRouteState(context.runtime)
          const from = fromState.current
          let target = typeof record.url === 'string' ? routeFromUrl(record.url) : undefined
          if (api === 'navigateBack') {
            try {
              const pages = context.runtime.getCurrentPages()
              const rawDelta = Math.floor(Number(record.delta ?? 1))
              const delta = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 1
              target = pageRoute(pages[Math.max(0, pages.length - 1 - delta)])
            } catch { /* live page stack at completion is still available as a fallback */ }
          }
          const originalSuccess = record.success as ((res: unknown) => void) | undefined
          const originalFail = record.fail as ((res: unknown) => void) | undefined
          let finished = false

          const finish = (success: boolean, result: unknown): void => {
            if (finished) return
            finished = true

            const duration = Math.max(0, context.runtime.now() - start)
            // 只根据实际页面栈校准公共状态，目标页不能提前写入缓存。
            const state = readRouteState(context.runtime)
            const liveBack = api === 'navigateBack' && state.current.fullPath !== from.fullPath
            const to = liveBack ? state.current : target?.fullPath ? target : state.current
            const page = success ? to : from
            const referrer = success && to.fullPath !== from.fullPath ? from.fullPath : fromState.referrer

            if (context.options.routeChange) {
              const data: BehaviorReportData = {
                event_type: 'behavior',
                action: 'route_change',
                from_route: from.fullPath || undefined,
                to_route: to.fullPath || undefined,
                page_url: page.fullPath || undefined,
                route: page.path || undefined,
                referrer: referrer || undefined,
                duration,
                category: 'navigation',
                ...(success ? {} : { properties: { success: false, message: messageOf(result) } }),
              }
              context.report(data)
            }
            if (success && context.options.pageView) reportPageView(context, to, referrer)
          }

          record.success = function monitoredRouteSuccess(this: unknown, res: unknown): void {
            try { finish(true, res) } finally { originalSuccess?.call(this, res) }
          }
          record.fail = function monitoredRouteFail(this: unknown, res: unknown): void {
            try { finish(false, res) } finally { originalFail?.call(this, res) }
          }
          return record
        },
      })
    } catch { /* this runtime does not support route interceptors */ }
  }
}

/** 手动补报页面访问，覆盖 <navigator>、自定义路由等拦截不到的场景。 */
export const trackPageView = (context: CollectorContext): void => {
  const state = readRouteState(context.runtime)
  reportPageView(context, state.current, state.referrer)
}

/** 自定义行为事件，字段遵循上报协议的 behavior 约定。 */
export const track = (
  context: CollectorContext,
  action: string,
  properties?: Record<string, unknown>,
  target?: BehaviorTarget,
): void => {
  context.report({
    event_type: 'behavior',
    action,
    properties,
    target,
  })
}

export const trackClick = (
  context: CollectorContext,
  action = 'click',
  target?: BehaviorTarget,
  properties?: Record<string, unknown>,
): void => {
  track(context, action, properties, target)
}

export const wrapClick = <Args extends unknown[]>(
  context: CollectorContext,
  action: string,
  handler?: (...args: Args) => unknown,
): ((...args: Args) => unknown) => (...args: Args): unknown => {
  trackClick(context, action)
  return handler?.(...args)
}
