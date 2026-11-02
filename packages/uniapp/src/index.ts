import { REPORT_EVENT, createCollectorRegistry } from '@weils-monitor/core/reporter'
import { config } from '@weils-monitor/shared'
import type { BehaviorTarget, QueueReportData } from '@weils-monitor/shared'
import { setConfig } from '@weils-monitor/utils'
import {
  collectPageChange,
  collectPageView,
  track,
  trackClick,
  trackPageView,
  wrapClick,
} from './behavior'
import { collectError, installErrorHandler } from './error'
import { resolveOptions, toInitOptions } from './options'
import { collectLaunch, collectRequest } from './performance'
import { createUnsupportedReplay, getReporter } from './reporter'
import { resolveRuntime, warnOnce } from './runtime'
import { collectMemoryWarning } from './stability'
import type { CollectorContext, UniappMonitorOptions } from './types'

export { REPORT_EVENT }
export * from './types'

const createContext = (options: UniappMonitorOptions): CollectorContext => {
  setConfig(toInitOptions(options))
  const runtime = resolveRuntime(options.runtime)
  const reporter = getReporter(runtime)
  return {
    runtime,
    report: reporter.report,
    options: resolveOptions(options),
    startedAt: runtime.now(),
  }
}

/** 创建 uni-app 监控实例；同一实例重复启动采集器只执行一次。 */
export const createMonitor = (options: UniappMonitorOptions) => {
  const context = createContext(options)
  const collectors = createCollectorRegistry()
  const once = <Result>(name: string, start: () => Result): Result =>
    collectors.start(name, start)
  const report = (data: QueueReportData): void => context.report(data)

  const error = {
    error: (): void => { once('error', () => collectError(context)) },
  }

  const behavior = {
    pv: (): void => { once('pageView', () => collectPageView(context)) },
    pageChange: (): void => { once('pageChange', () => collectPageChange(context)) },
    trackPageView: (): void => trackPageView(context),
    track: (action: string, properties?: Record<string, unknown>, target?: BehaviorTarget): void =>
      track(context, action, properties, target),
    trackClick: (action?: string, target?: BehaviorTarget, properties?: Record<string, unknown>): void =>
      trackClick(context, action, target, properties),
    wrapClick: <Args extends unknown[]>(action: string, handler?: (...args: Args) => unknown) =>
      wrapClick(context, action, handler),
  }

  const performance = {
    observeLaunch: (): void => { once('launch', () => collectLaunch(context)) },
    observeRequest: (): void => { once('request', () => collectRequest(context)) },
  }

  const stability = {
    observeMemoryWarning: (): void => { once('memoryWarning', () => collectMemoryWarning(context)) },
  }

  const monitor = {
    install(target: unknown, installOptions?: Partial<UniappMonitorOptions>): void {
      if (installOptions) {
        const merged = { ...options, ...installOptions }
        setConfig(toInitOptions(merged))
        Object.assign(context.options, resolveOptions(merged))
      }
      installErrorHandler(target, context)
    },
    observer(): void {
      error.error()
      behavior.pageChange()
      behavior.pv()
      performance.observeLaunch()
      performance.observeRequest()
      stability.observeMemoryWarning()
    },
    error,
    behavior,
    performance,
    stability,
    report,
    replay: createUnsupportedReplay(options),
    /** 小程序没有全局点击捕获；保留方法以兼容链式配置。 */
    addClickHandler(_attribute: string) {
      warnOnce('小程序不支持全局点击采集，请使用 behavior.trackClick / behavior.wrapClick')
      return monitor
    },
  }

  return monitor
}

export type UniappMonitor = ReturnType<typeof createMonitor>

/** 使用默认 runtime 上报自定义事件。 */
export const report = (data: QueueReportData): void => {
  getReporter(resolveRuntime()).report(data)
}

let standaloneMonitor: UniappMonitor | undefined

/**
 * 不创建实例、仅安装 Vue 错误处理时使用。
 * 通常直接 `app.use(monitor)` / `Vue.use(monitor)` 即可。
 */
export const install = (
  target: unknown,
  options?: Partial<UniappMonitorOptions>,
): void => {
  if (!standaloneMonitor) {
    standaloneMonitor = createMonitor({
      url: config.url,
      appId: String(config.appId ?? ''),
      projectName: config.projectName,
      ...options,
    } as UniappMonitorOptions)
    standaloneMonitor.install(target)
    return
  }
  standaloneMonitor.install(target, options)
}

export default {
  createMonitor,
  install,
  report,
}
