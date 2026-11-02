import { createReporter } from '@weils-monitor/core/reporter'
import { config } from '@weils-monitor/shared'
import type { ReplayController, ReplayStatus } from '@weils-monitor/shared'
import { createUniappAdapter } from './adaptor'
import { ensureSessionId, warnOnce } from './runtime'
import { createUniappStrategy } from './transport'
import type { ResolvedRuntime, UniappMonitorOptions } from './types'

type Reporter = ReturnType<typeof createReporter>

const reporters = new WeakMap<ResolvedRuntime, Reporter>()

/** 每个 runtime 复用一个 reporter，避免重复注册 onAppHide / 退出冲刷。 */
export const getReporter = (runtime: ResolvedRuntime): Reporter => {
  const cached = reporters.get(runtime)
  if (cached) return cached

  ensureSessionId()
  const endpoint = String(config.url ?? '')
  if (!/^https?:\/\//i.test(endpoint)) {
    warnOnce(`小程序端 url 需为绝对地址（当前为 ${endpoint || '空'}）`)
  }

  const reporter = createReporter(createUniappAdapter(runtime), createUniappStrategy(runtime))
  reporter.setupExitFlush()
  reporters.set(runtime, reporter)
  return reporter
}

/** 小程序没有 DOM，rrweb 回放不可用；保留同形接口避免共享配置代码报错。 */
export const createUnsupportedReplay = (
  options: UniappMonitorOptions,
): ReplayController => {
  const listeners = new Set<(status: ReplayStatus) => void>()
  const enabled = options.replay?.enabled === true
  let informed = false

  const notify = (status: ReplayStatus): void => {
    try { options.replay?.onStatus?.(status) } catch { /* ignore */ }
    for (const listener of [...listeners]) {
      try { listener(status) } catch { /* ignore */ }
    }
  }
  const inform = (): void => {
    if (informed || !enabled) return
    informed = true
    notify({ type: 'dropped', message: 'Replay 不支持小程序端，已跳过录制' })
  }

  if (enabled) {
    warnOnce('Replay 不支持小程序端（无 DOM），请只在 H5 / Web 端开启')
    inform()
  }

  return {
    async start() { inform() },
    async stop() { /* no-op */ },
    async capture() { /* no-op */ },
    async flush() { /* no-op */ },
    async destroy() { listeners.clear() },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
