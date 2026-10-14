import type { RouteReportData } from '@weils-monitor/shared'
import { report } from '../report'

let bound = false

const getRoute = (url: string = window.location.href): string => {
  try {
    const parsed = new URL(url, window.location.href)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url
  }
}

export const pageChange = (): void => {
  if (bound) return
  bound = true

  let previousRoute = getRoute()

  const emitRouteChange = (nextRoute: string): void => {
    if (nextRoute === previousRoute) return

    const reportData: RouteReportData = {
      event_type: 'behavior',
      action: 'route_change',
      from_route: previousRoute,
      to_route: nextRoute,
      route: nextRoute.split(/[?#]/)[0],
    }
    previousRoute = nextRoute
    report(reportData)
  }

  window.addEventListener('hashchange', (event: HashChangeEvent) => {
    const oldRoute = getRoute(event.oldURL)
    previousRoute = oldRoute
    emitRouteChange(getRoute(event.newURL))
  }, true)

  window.addEventListener('popstate', () => emitRouteChange(getRoute()), true)

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function monitoredHistoryMethod(...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args)
      emitRouteChange(getRoute())
      return result
    }
  }
}
