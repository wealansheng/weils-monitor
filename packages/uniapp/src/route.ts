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

/** 当前页面路径：优先 getCurrentPages，其次启动参数，最后复用已记录的状态。 */
export const currentRoute = (runtime: ResolvedRuntime): PageRoute => {
  const page = readPage(runtime)
  const route = page?.$page?.route ?? page?.route
  const fullPath = page?.$page?.fullPath ?? page?.fullPath
  const options = page?.$page?.options ?? page?.options

  if (route || fullPath) {
    return routeFromUrl(fullPath || `${normalizePath(route ?? '')}${buildQuery(options)}`)
  }

  try {
    const launch = runtime.wx?.getLaunchOptionsSync?.()
    if (launch?.path) return routeFromUrl(`${launch.path}${buildQuery(launch.query)}`)
  } catch { /* ignore */ }

  return EMPTY_ROUTE
}

let state: RouteState = { current: EMPTY_ROUTE, referrer: '' }

/** 读取路由状态；尚未初始化时用当前页面兜底。 */
export const readRouteState = (runtime: ResolvedRuntime): RouteState => {
  if (!state.current.fullPath) {
    const route = currentRoute(runtime)
    if (route.fullPath) state.current = route
  }
  return state
}

/** 更新当前页面并记录上一页面，供 referrer 使用。 */
export const setRouteState = (
  runtime: ResolvedRuntime,
  to: PageRoute,
  from?: PageRoute,
): RouteState => {
  const current = to.fullPath ? to : currentRoute(runtime)
  const referrer = from?.fullPath ?? (current.fullPath === state.current.fullPath ? state.referrer : state.current.fullPath)
  state = { current, referrer }
  return state
}

let lastPageView = { route: '', at: 0 }

/** 同一 fullPath 1 秒内只上报一次 page_view。 */
export const markPageView = (route: PageRoute, now: number): boolean => {
  if (!route.fullPath) return false
  if (lastPageView.route === route.fullPath && now - lastPageView.at < 1000) return false
  lastPageView = { route: route.fullPath, at: now }
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
