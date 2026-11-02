import { config } from '@weils-monitor/shared'
import type { PageInstance, ResolvedRuntime, UniRuntime, UniappRuntime, WxRuntime } from './types'

interface GlobalScope {
  uni?: UniRuntime
  wx?: WxRuntime
  getCurrentPages?: () => PageInstance[]
  performance?: { now?: () => number }
}

const globalScope = globalThis as unknown as GlobalScope

const fallbackNow = (): number => {
  try {
    const now = globalScope.performance?.now
    if (typeof now === 'function') return now()
  } catch { /* ignore broken polyfills */ }
  return Date.now()
}

const buildRuntime = (override: UniappRuntime): ResolvedRuntime => ({
  // 延迟读取全局对象：部分宿主可能在 SDK 初始化后才注入 uni / wx。
  get uni() { return override.uni ?? globalScope.uni },
  get wx() { return override.wx ?? globalScope.wx },
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
