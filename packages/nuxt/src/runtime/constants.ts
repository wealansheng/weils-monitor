/**
 * 服务端与客户端共用的常量。
 *
 * 客户端插件与服务端 Nitro 插件各自独立打包，`Server-Timing` 的指标名必须两端一致，
 * 因此统一在这里声明。
 */

/** `Server-Timing` 响应头中承载服务端渲染耗时的指标名。 */
export const SSR_TIMING_NAME = 'nuxt_ssr'

/** 服务端渲染耗时上报时使用的 `metric_name`。 */
export const SSR_METRIC_NAME = 'nuxt_ssr_render'
