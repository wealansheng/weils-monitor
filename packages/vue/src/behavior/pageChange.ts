import type { RouteReportData } from '@weils-monitor/shared'
import { nextTick } from 'vue'
import { afterPaint } from '../performance/afterPaint'
import { report } from '../report'

export interface RouterLike {
  beforeEach(guard: (to: { fullPath: string }, from: { fullPath: string }) => void): unknown
  afterEach(hook: (
    to: { fullPath: string },
    from: { fullPath: string },
    failure?: unknown,
  ) => void): unknown
}

let bound = false

const now = (): number => globalThis.performance?.now?.() ?? Date.now()

const getRoute = (url: string = window.location.href): string => {
  try {
    const parsed = new URL(url, window.location.href)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

const reportRouteChange = (from: string, to: string, start: number): void => {
  void nextTick().then(() => afterPaint(() => {
    const duration = Math.max(0, now() - start)
    const reportData: RouteReportData = {
      event_type: 'behavior',
      action: 'route_change',
      from_route: from,
      to_route: to,
      route: to.split(/[?#]/)[0],
      duration,
    }
    report(reportData)
  }))
}

/**
 * Prefer Vue Router guards so duration includes asynchronous guards and
 * component loading. The History API fallback measures from the URL change.
 */
export const pageChange = (router?: RouterLike): void => {
  if (bound) return
  bound = true

  if (router && typeof router.beforeEach === 'function' &&
      typeof router.afterEach === 'function') {
    const starts = new Map<string, number>()
    router.beforeEach((to, from) => {
      if (to.fullPath !== from.fullPath) starts.set(to.fullPath, now())
    })
    router.afterEach((to, from, failure) => {
      const start = starts.get(to.fullPath)
      starts.delete(to.fullPath)
      if (failure || start === undefined || to.fullPath === from.fullPath) return
      reportRouteChange(from.fullPath, to.fullPath, start)
    })
    return
  }

  let previousRoute = getRoute()
  const emitRouteChange = (nextRoute: string, start: number): void => {
    if (nextRoute === previousRoute) return
    const from = previousRoute
    previousRoute = nextRoute
    reportRouteChange(from, nextRoute, start)
  }

  window.addEventListener('hashchange', (event: HashChangeEvent) => {
    if (previousRoute === getRoute(event.newURL)) return
    previousRoute = getRoute(event.oldURL)
    emitRouteChange(getRoute(event.newURL), now())
  }, true)

  window.addEventListener('popstate', () => emitRouteChange(getRoute(), now()), true)

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function monitoredHistoryMethod(...args: Parameters<History[typeof method]>) {
      const start = now()
      const result = original.apply(this, args)
      emitRouteChange(getRoute(), start)
      return result
    }
  }
}
