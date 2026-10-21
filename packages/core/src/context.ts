import { VERSION, config } from '@weils-monitor/shared'
import type { BaseReportData, ClientInfo, DeviceInfo } from '@weils-monitor/shared'

const SENSITIVE_QUERY_KEY = /pass(word)?|token|secret|auth|cookie|session|code|otp|phone|email/i

export const sanitizeUrl = (value: string): string => {
  if (!value) return ''

  try {
    const url = new URL(value, window.location.href)
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return value.split('?')[0]
  }
}

/**
 * 判断资源是否为 SDK 自身的上报端点。
 * 忽略 query/hash，兼容 beacon/image 等传输方式附加参数后的同一路径。
 */
export const isMonitorRequest = (value: string): boolean => {
  try {
    const candidate = new URL(value, window.location.href)
    const normalizePath = (path: string): string => path.replace(/\/+$/, '') || '/'
    return [config.url, config.replay?.enabled ? config.replay.url || '/api/v1/records' : undefined]
      .filter((url): url is string => Boolean(url)).some(url => {
        const endpoint = new URL(url, window.location.href)
        return candidate.origin === endpoint.origin && normalizePath(candidate.pathname) === normalizePath(endpoint.pathname)
      })
  } catch {
    return value === config.url
  }
}

const matchClient = (userAgent: string): ClientInfo => {
  const candidates: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]

  for (const [name, pattern] of candidates) {
    const match = userAgent.match(pattern)
    if (match) return { name, version: match[1] }
  }

  return { name: 'Unknown' }
}

const matchOS = (userAgent: string): ClientInfo => {
  const windows = userAgent.match(/Windows NT ([\d.]+)/)
  if (windows) return { name: 'Windows', version: windows[1] }

  const android = userAgent.match(/Android ([\d.]+)/)
  if (android) return { name: 'Android', version: android[1] }

  const ios = userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/)
  if (ios) return { name: 'iOS', version: ios[1].replace(/_/g, '.') }

  const macOS = userAgent.match(/Mac OS X ([\d_]+)/)
  if (macOS) return { name: 'macOS', version: macOS[1].replace(/_/g, '.') }

  if (/Linux/.test(userAgent)) return { name: 'Linux' }
  return { name: 'Unknown' }
}

const getDevice = (userAgent: string): DeviceInfo => ({
  type: /iPad|Tablet|PlayBook/i.test(userAgent)
    ? 'tablet'
    : /Mobi|Android|iPhone/i.test(userAgent)
      ? 'mobile'
      : 'desktop',
})

interface NavigatorWithConnection extends Navigator {
  connection?: { effectiveType?: string; type?: string }
  mozConnection?: { effectiveType?: string; type?: string }
  webkitConnection?: { effectiveType?: string; type?: string }
}

const getNetworkType = (): string | undefined => {
  const currentNavigator = navigator as NavigatorWithConnection
  const connection =
    currentNavigator.connection ??
    currentNavigator.mozConnection ??
    currentNavigator.webkitConnection
  return connection?.effectiveType ?? connection?.type
}

/** 采集协议中的浏览器公共字段；配置项仍使用 camelCase，对外上报统一转 snake_case。 */
export const collectCommonFields = (): Omit<BaseReportData, 'event_type'> => {
  const userAgent = navigator.userAgent ?? ''

  return {
    app_id: String(config.appId || config.appKey || ''),
    projectName: String(config.projectName || ''),
    release: config.release || undefined,
    environment: config.environment || 'production',
    user_id: config.userId === undefined || config.userId === '' ? undefined : String(config.userId),
    session_id: config.sessionId || undefined,
    page_url: sanitizeUrl(window.location.href),
    route: window.location.pathname,
    referrer: sanitizeUrl(document.referrer),
    device: getDevice(userAgent),
    browser: matchClient(userAgent),
    os: matchOS(userAgent),
    network: getNetworkType(),
    locale: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    sdk_version: VERSION,
    trace_id: config.traceId || undefined,
  }
}
