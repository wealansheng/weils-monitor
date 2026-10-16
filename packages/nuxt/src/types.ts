import type { InitOptions, QueueReportData } from '@weils-monitor/shared'

/**
 * `nuxt.config.ts` 中 `nuxtMonitor` 的配置类型。
 *
 * 除 Vue 子包的 `InitOptions` 外，额外提供三个 Nuxt 专属采集开关，默认全部开启，
 * 设为 `false` 即可关闭对应能力。
 */
export interface ModuleOptions extends InitOptions {
  /** 属性名列表：点击命中元素带有该属性时，属性值作为点击事件的 `action`。 */
  clickAttributes?: string[]
  /** 水合耗时监控：`nuxt_hydration`、`nuxt_hydration_complete`。 */
  hydration?: boolean
  /** 服务端渲染耗时监控：`nuxt_ssr_render`。 */
  ssr?: boolean
  /** Nuxt 框架错误监控：`nuxt_error`、`nuxt_chunk_error`、`nuxt_ssr_error`。 */
  frameworkErrors?: boolean
}

/** 运行时通过 `runtimeConfig.public.weilsMonitor` 读到的模块配置。 */
export type NuxtMonitorOptions = ModuleOptions

/**
 * 运行时采集器的上报出口。与 Vue 子包共用同一个队列，
 * 因此 Nuxt 专属指标也遵循相同的批量发送与页面退出冲刷规则。
 */
export type MonitorReport = (data: QueueReportData) => void
