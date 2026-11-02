import { config } from '@weils-monitor/shared'
import type { PageInstance, ResolvedRuntime, UniRuntime, UniappRuntime, WxRuntime } from './types'

interface GlobalScope {
  uni?: UniRuntime
  wx?: WxRuntime
  getCurrentPages?: () => PageInstance[]
  performance?: { now?: () => number }
}

const globalScope = globalThis as unknown as GlobalScope

// uni-app 的 Vite 注入插件会把裸标识符 uni / wx 替换为运行时导入：
// mp-weixin 编译为 @dcloudio/uni-mp-weixin 的 uni 对象，H5 编译为 @dcloudio/uni-h5 的 uni。
// 不要改成 globalThis.uni：小程序 app service 并不会把 uni 挂到全局对象上。
declare const uni: UniRuntime | undefined
declare const wx: WxRuntime | undefined

const injectedUni = (): UniRuntime | undefined => {
  if (typeof uni !== 'undefined') return uni
  return globalScope.uni
}

const injectedWx = (): WxRuntime | undefined => {
  if (typeof wx !== 'undefined') return wx
  return globalScope.wx
}

const safe = <T>(work: () => T): T | undefined => {
  try {
    return work()
  } catch {
    return undefined
  }
}

const wxFacades = new WeakMap<object, UniRuntime>()

/**
 * 兜底：极少数宿主/构建器没有注入 uni 时，用 wx 原生 API 组成最小 uni 接口，
 * 保证错误、上下文和 uni.request 上报仍可工作（路由/请求拦截仍需要真实 uni）。
 */
const createWxFacade = (source: WxRuntime | undefined): UniRuntime | undefined => {
  if (!source) return undefined
  const cached = wxFacades.get(source)
  if (cached) return cached

  const facade: UniRuntime = {
    request: typeof source.request === 'function' ? source.request.bind(source) : undefined,
    getSystemInfoSync: () => {
      if (typeof source.getSystemInfoSync === 'function') return source.getSystemInfoSync()
      return {
        ...safe(() => source.getDeviceInfo?.()),
        ...safe(() => source.getAppBaseInfo?.()),
        ...safe(() => source.getWindowInfo?.()),
      }
    },
    getNetworkType: typeof source.getNetworkType === 'function'
      ? source.getNetworkType.bind(source) : undefined,
    onNetworkStatusChange: typeof source.onNetworkStatusChange === 'function'
      ? source.onNetworkStatusChange.bind(source) : undefined,
    onAppHide: typeof source.onAppHide === 'function' ? source.onAppHide.bind(source) : undefined,
    onError: typeof source.onError === 'function' ? source.onError.bind(source) : undefined,
    onUnhandledRejection: typeof source.onUnhandledRejection === 'function'
      ? source.onUnhandledRejection.bind(source) : undefined,
    onPageNotFound: typeof source.onPageNotFound === 'function'
      ? source.onPageNotFound.bind(source) : undefined,
    onMemoryWarning: typeof source.onMemoryWarning === 'function'
      ? source.onMemoryWarning.bind(source) : undefined,
  }
  wxFacades.set(source, facade)
  return facade
}

const fallbackNow = (): number => {
  try {
    const now = globalScope.performance?.now
    if (typeof now === 'function') return now()
  } catch { /* ignore broken polyfills */ }
  return Date.now()
}

const buildRuntime = (override: UniappRuntime): ResolvedRuntime => ({
  // 延迟读取：部分宿主可能在 SDK 初始化后才注入 uni / wx。
  get uni() {
    return override.uni ?? injectedUni() ?? globalScope.uni
      ?? createWxFacade(override.wx ?? injectedWx())
  },
  get wx() { return override.wx ?? injectedWx() },
  getCurrentPages: override.getCurrentPages ?? (() => {
    const pages = globalScope.getCurrentPages
    return typeof pages === 'function' ? pages() : []
  }),
  now: override.now ?? fallbackNow,
})

let defaultRuntime: ResolvedRuntime | undefined
const overrideRuntimes = new WeakMap<UniappRuntime, ResolvedRuntime>()

/** 未注入时返回稳定单例；同一注入对象也复用同一个 ResolvedRuntime。 */
export const resolveRuntime = (override?: UniappRuntime): ResolvedRuntime => {
  if (!override) return (defaultRuntime ??= buildRuntime({}))
  let runtime = overrideRuntimes.get(override)
  if (!runtime) {
    runtime = buildRuntime(override)
    overrideRuntimes.set(override, runtime)
  }
  return runtime
}

export const createId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

/** 每次小程序进程启动生成一个会话 ID；登录态可通过 sessionId 配置覆盖。 */
export const ensureSessionId = (): void => {
  if (!config.sessionId) config.sessionId = createId()
}

export const warnOnce = (() => {
  const warned = new Set<string>()
  return (message: string): void => {
    if (warned.has(message)) return
    warned.add(message)
    try { console.warn(`[weils-monitor] ${message}`) } catch { /* ignore */ }
  }
})()
