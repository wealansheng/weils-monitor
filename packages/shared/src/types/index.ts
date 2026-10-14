export type Rating = 'good' | 'needs-improvement' | 'poor'

export interface MonitorOptions {
  dsn: string
  env?: string
}

export type MonitorEventType =
  | 'performance'
  | 'request'
  | 'resource'
  | 'error'
  | 'stability'
  | 'behavior'

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop'
  model?: string
}

export interface ClientInfo {
  name: string
  version?: string
}

/** docs/字段要求.md 中定义的公共字段。 */
export interface BaseReportData {
  event_type: MonitorEventType
  event_id?: string
  timestamp?: number
  app_id?: string
  release?: string
  environment?: string
  user_id?: string
  session_id?: string
  page_url?: string
  route?: string
  referrer?: string
  device?: DeviceInfo
  browser?: ClientInfo
  os?: ClientInfo
  network?: string
  locale?: string
  screen?: string
  viewport?: string
  sdk_version?: string
  trace_id?: string
}

export interface PerformanceReportData extends BaseReportData {
  event_type: 'performance'
  metric_name: string
  value?: number
  rating?: Rating
  name?: string
  initiator_type?: string
  duration?: number
  transfer_size?: number
  encoded_body_size?: number
  start_time?: number
  dns?: number
  tcp?: number
  ssl?: number
  request?: number
  response?: number
  dom_ready?: number
  load?: number
}

export interface ErrorReportData extends BaseReportData {
  event_type: 'error'
  error_type: string
  message?: string
  name?: string
  stack?: string
  filename?: string
  lineno?: number
  colno?: number
  component?: string
  component_stack?: string
  reason?: string
  resource_url?: string
  resource_type?: string
  tag_name?: string
  url?: string
  method?: string
  status_code?: number
  response_body?: string
  duration?: number
  fingerprint?: string
  breadcrumbs?: unknown[] | Record<string, unknown>
  tags?: Record<string, string>
  extra?: unknown[] | Record<string, unknown>
  props?: unknown[] | Record<string, unknown>
}

export interface RequestReportData extends BaseReportData {
  event_type: 'request'
  url: string
  method: string
  status_code?: number
  duration?: number
  request_size?: number
  response_size?: number
  success?: boolean
  request_body?: string
  response_body?: string
}

export interface ResourceReportData extends BaseReportData {
  event_type: 'resource'
  resource_url: string
  resource_type?: string
  duration?: number
  transfer_size?: number
  cached?: boolean
  status?: number
}

export interface StabilityReportData extends BaseReportData {
  event_type: 'stability'
  issue_type: string
  blank_time?: number
  root_node_count?: number
}

export interface BehaviorTarget {
  selector?: string
  text?: string
  tag?: string
}

export interface BehaviorReportData extends BaseReportData {
  event_type: 'behavior'
  action: string
  from_route?: string
  to_route?: string
  duration?: number
  target?: BehaviorTarget
  category?: string
  properties?: Record<string, unknown>
}

export type QueueReportData =
  | PerformanceReportData
  | ErrorReportData
  | RequestReportData
  | ResourceReportData
  | StabilityReportData
  | BehaviorReportData

// 兼容现有导入名；所有采集器现在都输出协议规定的 snake_case 结构。
export type EntriesReportData = PerformanceReportData
export type LoadReportData = PerformanceReportData
export type AssetsErrorReportData = ErrorReportData
export type JSErrorReportData = ErrorReportData
export type PromiseErrorReportData = ErrorReportData
export type ClickReportData = BehaviorReportData
export type RouteReportData = BehaviorReportData
export type PVReportData = BehaviorReportData
export type HTTPReportData = RequestReportData
export type ReportData = PerformanceReportData
export type CLSReportData = PerformanceReportData
export type INPReportData = PerformanceReportData
export type TTFBReportData = PerformanceReportData
export type VueReportData = ErrorReportData

export interface InitOptions {
  url: string
  appId: string | number
  /** appId 的兼容别名；输出时始终使用 app_id。 */
  appKey?: string
  projectName?: string
  userId?: string | number
  release?: string
  environment?: string
  sessionId?: string
  traceId?: string
  isImageUpload?: boolean
  batchSize?: number
  /** 单个批量包的目标体积上限，默认 50KB。 */
  maxBatchBytes?: number
  /** 本批数据采用的采样率，写入批量包 sample_rate。 */
  sampleRate?: number
  /** 开启后 SDK 会把每条规范化后的数据打印到控制台。 */
  debug?: boolean
}

export interface XHRWithMonitor extends XMLHttpRequest {
  monitorUrl?: string
  monitorMethod?: string
  monitorStartTime?: number
}

export interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

export interface INPEntry extends PerformanceEntry {
  interactionId: number
  duration: number
}

export interface NavigationTimingEntry extends PerformanceEntry {
  responseStart: number
  requestStart: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  redirectStart: number
  redirectEnd: number
  fetchStart: number
  type: string
}

export interface ResourceTimingEntry extends PerformanceEntry {
  responseStart: number
  requestStart: number
  initiatorType: string
}
