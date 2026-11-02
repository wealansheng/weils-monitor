import type { BehaviorReportData, BehaviorTarget } from '@weils-monitor/shared'
import {
  currentRoute,
  markPageView,
  readRouteState,
  routeFromUrl,
  setRouteState,
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
  if (!markPageView(route, context.runtime.now())) return
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
  whenRouteReady(context.runtime, (route) => {
    const resolved = route.fullPath ? route : readRouteState(context.runtime).current
    if (!resolved.fullPath) return
    const state = setRouteState(context.runtime, resolved)
    reportPageView(context, resolved, state.referrer)
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
          const from = readRouteState(context.runtime).current
          const target = typeof record.url === 'string' ? routeFromUrl(record.url) : undefined
          const originalSuccess = record.success as ((res: unknown) => void) | undefined
          const originalFail = record.fail as ((res: unknown) => void) | undefined
          let finished = false

          const finish = (success: boolean, result: unknown): void => {
            if (finished) return
            finished = true

            const duration = Math.max(0, context.runtime.now() - start)
            const to = target?.fullPath ? target : currentRoute(context.runtime)
            // 导航失败时当前页面没有变化，不能把 route state 指向失败目标。
            const state = success
              ? setRouteState(context.runtime, to, from)
              : readRouteState(context.runtime)

            if (context.options.routeChange) {
              const data: BehaviorReportData = {
                event_type: 'behavior',
                action: 'route_change',
                from_route: (success && state.referrer ? state.referrer : state.current.fullPath) || undefined,
                to_route: to.fullPath || undefined,
                route: to.path || undefined,
                duration,
                category: 'navigation',
                ...(success ? {} : { properties: { success: false, message: messageOf(result) } }),
              }
              context.report(data)
            }
            if (success) reportPageView(context, to, state.referrer)
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
  const live = currentRoute(context.runtime)
  const resolved = live.fullPath ? live : readRouteState(context.runtime).current
  if (!resolved.fullPath) return
  const state = setRouteState(context.runtime, resolved)
  reportPageView(context, resolved, state.referrer)
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
