import { REPORT_EVENT } from '@weils-monitor/core/reporter'
import type { ReportAdapter } from '@weils-monitor/core/reporter'
import { VERSION, config } from '@weils-monitor/shared'
import type { ClientInfo, DeviceInfo, QueueReportData } from '@weils-monitor/shared'
import { readRouteState } from './route'
import type { ResolvedRuntime } from './types'

const safe = <T>(work: () => T): T | undefined => {
  try {
    return work()
  } catch {
    return undefined
  }
}

const parseOs = (system: string): ClientInfo | undefined => {
  if (!system) return undefined
  const match = /^(iOS|Android|Windows|macOS|Linux|OpenHarmony|HarmonyOS)\s*([\d._]+)?/i.exec(system)
  if (!match) return { name: system }
  return { name: match[1], version: match[2]?.replace(/_/g, '.') || undefined }
}

const readSystemInfo = (runtime: ResolvedRuntime): Record<string, unknown> => {
  const device = safe(() => runtime.wx?.getDeviceInfo?.()) ?? {}
  const system = safe(() => runtime.uni?.getSystemInfoSync?.()) ?? {}
  return { ...device, ...system }
}

const readDevice = (info: Record<string, unknown>): DeviceInfo | undefined => {
  const width = Number(info.screenWidth)
  if (!Number.isFinite(width) && !info.model && !info.brand) return undefined

  const deviceType = String(info.deviceType ?? '')
  const platform = String(info.platform ?? '').toLowerCase()
  const type: DeviceInfo['type'] =
    deviceType === 'pad' ? 'tablet'
      : deviceType === 'phone' ? 'mobile'
        : platform === 'devtools' || platform === 'windows' || platform === 'mac' || platform === 'linux'
          ? 'desktop'
          : width >= 600 ? 'tablet' : 'mobile'
  const model = [info.brand, info.model].filter(Boolean).join(' ').trim()
  return { type, model: model || undefined }
}

const readBrowser = (
  runtime: ResolvedRuntime,
  info: Record<string, unknown>,
): ClientInfo | undefined => {
  if (runtime.wx) {
    const version = String(info.version ?? '')
    return { name: 'WeChat', version: version || undefined }
  }
  if (runtime.uni) {
    const version = String(info.uniVersion ?? '')
    return { name: 'uni-app', version: version || undefined }
  }
  return undefined
}

const dimension = (value: unknown): string | undefined => {
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? String(size) : undefined
}

export const createUniappAdapter = (runtime: ResolvedRuntime): ReportAdapter => {
  let info: Record<string, unknown> | undefined
  let network: string | undefined
  let networkPrimed = false

  const systemInfo = (): Record<string, unknown> => (info ??= readSystemInfo(runtime))

  const primeNetwork = (): void => {
    if (networkPrimed) return
    const uni = runtime.uni
    if (!uni) return
    networkPrimed = true
    safe(() => uni.getNetworkType?.({
      success: (res) => { if (res?.networkType) network = res.networkType },
    }))
    safe(() => uni.onNetworkStatusChange?.((res) => {
      if (res?.networkType) network = res.networkType
    }))
  }

  return {
    collect() {
      primeNetwork()
      const current = systemInfo()
      const os = parseOs(String(current.system ?? ''))
      const device = readDevice(current)
      const browser = readBrowser(runtime, current)
      const locale = String(current.language ?? '').replace(/_/g, '-') || undefined
      const screenWidth = dimension(current.screenWidth)
      const screenHeight = dimension(current.screenHeight)
      const windowWidth = dimension(current.windowWidth)
      const windowHeight = dimension(current.windowHeight)
      const routeState = readRouteState(runtime)

      return {
        app_id: String(config.appId || config.appKey || ''),
        projectName: String(config.projectName || ''),
        release: config.release || undefined,
        environment: config.environment || 'production',
        user_id: config.userId === undefined || config.userId === '' ? undefined : String(config.userId),
        session_id: config.sessionId || undefined,
        trace_id: config.traceId || undefined,
        page_url: routeState.current.fullPath || undefined,
        route: routeState.current.path || undefined,
        referrer: routeState.referrer || undefined,
        device,
        browser,
        os,
        network,
        locale,
        screen: screenWidth && screenHeight ? `${screenWidth}x${screenHeight}` : undefined,
        viewport: windowWidth && windowHeight ? `${windowWidth}x${windowHeight}` : undefined,
        sdk_version: VERSION,
      } as Partial<QueueReportData>
    },
    publish(data) {
      try {
        runtime.uni?.$emit?.(REPORT_EVENT, data)
      } catch { /* local subscribers must never break reporting */ }
    },
    onExit(flush) {
      const source = runtime.wx ?? runtime.uni
      const onAppHide = source?.onAppHide
      if (typeof onAppHide === 'function') {
        try { onAppHide.call(source, flush) } catch { /* ignore */ }
      }
    },
  }
}
