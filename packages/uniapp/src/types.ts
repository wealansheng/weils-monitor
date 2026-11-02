import type { InitOptions, QueueReportData } from '@weils-monitor/shared'

/** 微信小程序 `wx.request` 的最小回调结构。 */
export interface UniRequestResult {
  statusCode?: number
  data?: unknown
  errMsg?: string
}

export interface UniRequestOptions {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, string>
  timeout?: number
  success?: (res: UniRequestResult) => void
  fail?: (err: unknown) => void
  complete?: (res: unknown) => void
}

export type UniApiInterceptor = {
  invoke?: (args: Record<string, unknown>) => unknown
  success?: (res: unknown) => void
  fail?: (res: unknown) => void
  complete?: (res: unknown) => void
}

/** uni-app 运行时子集；只声明 SDK 实际使用的 API。 */
export interface UniRuntime {
  request?: (options: UniRequestOptions) => unknown
  addInterceptor?: (api: string, interceptor: UniApiInterceptor) => unknown
  getSystemInfoSync?: () => Record<string, unknown>
  getNetworkType?: (options: { success?: (res: { networkType?: string }) => void }) => unknown
  onNetworkStatusChange?: (callback: (res: { networkType?: string }) => void) => unknown
  onAppHide?: (callback: () => void) => unknown
  onError?: (callback: (error: string) => void) => unknown
  onUnhandledRejection?: (callback: (res: { reason?: unknown }) => void) => unknown
  onPageNotFound?: (callback: (res: PageNotFoundInfo) => void) => unknown
  onMemoryWarning?: (callback: (res: { level?: number }) => void) => unknown
  $emit?: (name: string, payload?: unknown) => unknown
}

export interface WxPerformanceEntry {
  entryType?: string
  name?: string
  startTime?: number
  duration?: number
  path?: string
  packageSize?: number
}

export interface WxPerformanceObserver {
  observe?: (options: { entryTypes: string[] }) => unknown
  disconnect?: () => void
}

export interface WxPerformanceEntryList {
  getEntries: () => WxPerformanceEntry[]
}

export interface WxPerformance {
  createObserver?: (
    callback: (entries: WxPerformanceEntryList | WxPerformanceEntry[]) => void,
  ) => WxPerformanceObserver
}

/** mp-weixin 专有运行时子集。 */
export interface WxRuntime extends UniRuntime {
  getPerformance?: () => WxPerformance | undefined
  getLaunchOptionsSync?: () => { path?: string; query?: Record<string, unknown> } | undefined
  getDeviceInfo?: () => Record<string, unknown>
  getAppBaseInfo?: () => Record<string, unknown>
  getWindowInfo?: () => Record<string, unknown>
}

export interface PageInstance {
  route?: string
  fullPath?: string
  options?: Record<string, unknown>
  $page?: {
    route?: string
    fullPath?: string
    options?: Record<string, unknown>
  }
}

export interface PageNotFoundInfo {
  path?: string
  query?: Record<string, unknown>
  isEntryPage?: boolean
}

/**
 * 可注入的运行时。
 * 生产环境留空即可自动读取 globalThis.uni / globalThis.wx；
 * 单元测试或宿主集成可显式传入 fake 实现。
 */
export interface UniappRuntime {
  uni?: UniRuntime
  wx?: WxRuntime
  getCurrentPages?: () => PageInstance[]
  now?: () => number
}

export interface UniappMonitorOptions extends InitOptions {
  /** 覆盖运行时（测试或宿主注入）；不传则自动解析 globalThis。 */
  runtime?: UniappRuntime
  /** 采集 wx.onError / onUnhandledRejection / onPageNotFound，默认 true。 */
  runtimeErrors?: boolean
  /** 包装 Vue 2 / Vue 3 全局 errorHandler，默认 true。 */
  frameworkErrors?: boolean
  /** 通过 uni.addInterceptor 采集 uni.request，默认 true。 */
  requests?: boolean
  /** request 事件的最小耗时（毫秒），默认 0（全部上报）。 */
  requestDurationThreshold?: number
  /** 采集 wx.getPerformance 的启动/渲染等指标，默认 true。 */
  performance?: boolean
  /** 上报路由切换，默认 true。 */
  routeChange?: boolean
  /** 自动上报页面访问，默认 true；不影响显式调用 trackPageView。 */
  pageView?: boolean
  /** 采集 wx.onMemoryWarning，默认 true。 */
  memoryWarning?: boolean
}

/** 采集器上下文：把 report、运行时和配置解析结果显式传给各采集器。 */
export interface CollectorContext {
  runtime: ResolvedRuntime
  report: (data: QueueReportData) => void
  options: ResolvedOptions
  /** 创建 monitor 的时间，用于 mp_launch 回退指标。 */
  startedAt: number
}

export interface ResolvedRuntime {
  uni?: UniRuntime
  wx?: WxRuntime
  getCurrentPages: () => PageInstance[]
  now: () => number
}

export type ResolvedOptions = UniappMonitorOptions & {
  runtimeErrors: boolean
  frameworkErrors: boolean
  requests: boolean
  requestDurationThreshold: number
  performance: boolean
  routeChange: boolean
  pageView: boolean
  memoryWarning: boolean
}
