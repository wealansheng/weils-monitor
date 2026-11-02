import { sanitizeQueryString } from '@weils-monitor/core/reporter'
import type { PageInstance, ResolvedRuntime } from './types'

export interface PageRoute {
  /** 不带 query 的页面路径，例如 /pages/index/index。 */
  path: string
  /** 应用内完整路径，例如 /pages/index/index?tab=1。 */
  fullPath: string
}

export interface RouteState {
  current: PageRoute
  referrer: string
}

const EMPTY_ROUTE: PageRoute = { path: '', fullPath: '' }
const routeStates = new WeakMap<ResolvedRuntime, RouteState>()
const pageViews = new WeakMap<ResolvedRuntime, { route: string; at: number }>()

const normalizePath = (value: string): string => {
  if (!value) return ''
  return value.startsWith('/') ? value : `/${value}`
}

/** 小程序没有域名，page_url 统一使用应用内路径；query 做敏感参数脱敏。 */
export const routeFromUrl = (value: string): PageRoute => {
  if (!value) return EMPTY_ROUTE

  const queryIndex = value.indexOf('?')
  const path = normalizePath((queryIndex >= 0 ? value.slice(0, queryIndex) : value).trim())
  const query = queryIndex >= 0 ? sanitizeQueryString(value.slice(queryIndex + 1)) : ''
  return { path, fullPath: query ? `${path}?${query}` : path }
}

const buildQuery = (options?: Record<string, unknown>): string => {
  if (!options) return ''
  const pairs: string[] = []
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') continue
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return pairs.length ? `?${sanitizeQueryString(pairs.join('&'))}` : ''
}

const readPage = (runtime: ResolvedRuntime): PageInstance | undefined => {
  try {
    const pages = runtime.getCurrentPages()
    return pages[pages.length - 1]
  } catch {
    return undefined
  }
}

/** 页面实例转为已脱敏的应用内路径，也用于导航返回的栈快照。 */
export const pageRoute = (page?: PageInstance): PageRoute => {
  const route = page?.$page?.route ?? page?.route
  const fullPath = page?.$page?.fullPath ?? page?.fullPath
  const options = page?.$page?.options ?? page?.options

  if (route || fullPath) {
    return routeFromUrl(fullPath || `${normalizePath(route ?? '')}${buildQuery(options)}`)
  }
  return EMPTY_ROUTE
}

/** 当前页面路径：实时页面栈优先，空栈保留缓存，仅首次读取回退启动参数。 */
export const currentRoute = (runtime: ResolvedRuntime): PageRoute => {
  const live = pageRoute(readPage(runtime))
  if (live.fullPath) return live

  const cached = routeStates.get(runtime)?.current
  if (cached?.fullPath) return cached

  try {
    const launch = runtime.wx?.getLaunchOptionsSync?.()
    if (launch?.path) return routeFromUrl(`${launch.path}${buildQuery(launch.query)}`)
  } catch { /* ignore */ }

  return EMPTY_ROUTE
}

/** 每次采集核对页面栈；只有页面实际改变时才更新 referrer。 */
export const readRouteState = (runtime: ResolvedRuntime): RouteState => {
  let state = routeStates.get(runtime)
  const current = currentRoute(runtime)
  if (!state || (current.fullPath && current.fullPath !== state.current.fullPath)) {
    state = { current, referrer: state?.current.fullPath ?? '' }
    routeStates.set(runtime, state)
  }
  return state
}

/** 同一 runtime 内，同一 fullPath 1 秒内只上报一次 page_view。 */
export const markPageView = (runtime: ResolvedRuntime, route: PageRoute, now: number): boolean => {
  if (!route.fullPath) return false
  const lastPageView = pageViews.get(runtime)
  if (lastPageView?.route === route.fullPath && now - lastPageView.at < 1000) return false
  pageViews.set(runtime, { route: route.fullPath, at: now })
  return true
}

/** 启动阶段 getCurrentPages 可能尚未就绪，短轮询到首个页面出现。 */
export const whenRouteReady = (
  runtime: ResolvedRuntime,
  callback: (route: PageRoute) => void,
  timeoutMs = 2000,
  intervalMs = 50,
): void => {
  const deadline = Date.now() + timeoutMs
  const check = (): void => {
    const route = currentRoute(runtime)
    if (route.fullPath || Date.now() >= deadline) {
      callback(route)
      return
    }
    setTimeout(check, intervalMs)
  }
  check()
}
