import type { NuxtApp } from 'nuxt/app'
import type { Monitor } from '@weils-monitor/vue'
import { createCollectorRegistry } from '@weils-monitor/core'
import { observeHydration } from './hydration'
import { observeNuxtErrors } from './errors'
import { observeSsrTiming } from './ssr'

export interface NuxtMonitoringOptions {
  /** 水合耗时监控，默认开启。 */
  hydration?: boolean
  /** 服务端渲染耗时监控，默认开启。 */
  ssr?: boolean
  /** Nuxt 框架错误监控，默认开启。 */
  frameworkErrors?: boolean
}

/**
 * 把三项 Nuxt 专属采集能力接入监控实例。
 *
 * 调用前必须已经执行 `nuxtApp.vueApp.use(monitor)`：错误采集需要在 Vue 子包安装好的
 * `errorHandler` 之外再包一层用于去重，Vue 组件错误仍由 Vue 子包上报 `framework_error`。
 *
 * 必须在 `app:beforeMount` 之前调用（模块的客户端插件在 `applyPlugins` 阶段执行，满足该时序），
 * 否则水合开始时间无法记录。
 *
 * 所有指标都通过 `monitor.report` 入队，与 Vue 采集器共用同一套批量发送与退出冲刷规则。
 * 返回取消函数，便于测试或按需停止采集。
 */
export const wireNuxtMonitoring = (
  nuxtApp: NuxtApp,
  monitor: Monitor,
  options: NuxtMonitoringOptions = {},
): (() => void) => {
  const { hydration = true, ssr = true, frameworkErrors = true } = options

  const collectors = createCollectorRegistry()
  if (hydration) collectors.start('hydration', () => observeHydration(nuxtApp, monitor.report))
  if (frameworkErrors) collectors.start('frameworkErrors', () => observeNuxtErrors(nuxtApp, monitor.report))
  if (ssr) collectors.start('ssr', () => observeSsrTiming(monitor.report))
  return () => collectors.stop()
}
