import { SSR_TIMING_NAME } from '../constants'

/**
 * Nitro 服务端插件：测量服务端处理/渲染耗时，并写入 `Server-Timing` 响应头。
 *
 * ```txt
 * Server-Timing: nuxt_ssr;dur=42.7
 * ```
 *
 * 客户端读取该响应头后按 `nuxt_ssr_render` 性能事件上报（见 `../ssr.ts`）。
 * 之所以在服务端只写响应头而不直接上报：SDK 的上报通道（XHR / sendBeacon / Image）
 * 只在浏览器可用，服务端没有可用的传输方式；由客户端上报还能复用同一套队列与批量规则。
 *
 * 两个钩子都来自 Nitro 运行时（`request` / `beforeResponse`，见 nitropack 的
 * `internal/app.mjs`），这里不依赖 `defineNitroPlugin` 自动导入：Nitro 直接以
 * `plugin(nitroApp)` 方式调用默认导出（`runNitroPlugins`），`defineNitroPlugin` 本身
 * 也是恒等函数。这样模块包无需引入 `nitropack` 依赖即可独立构建与类型检查。
 *
 * 注意响应头的读写位置：h3 的路由分支传给 `beforeResponse` 的 response 只有 `{ body }`，
 * 而 Nuxt 的 SSR 渲染器是通过 `setResponseHeader` 把 `content-type` 写在 `event.node.res` 上，
 * 所以这里以 Node 响应为准、`response.headers` 作为回退。也正因为在 `beforeResponse` 时
 * `content-type` 已经存在，可以用它区分 HTML 文档与接口/静态资源响应。
 */

type Hook = (...args: any[]) => unknown

export interface NitroAppLike {
  hooks: {
    hook: (name: string, fn: Hook) => unknown
  }
}

type HeaderValue = string | number | string[] | undefined

interface NodeResponseLike {
  getHeader?: (name: string) => HeaderValue
  setHeader?: (name: string, value: string) => unknown
}

interface H3EventLike {
  node?: { res?: NodeResponseLike }
}

interface NitroResponseLike {
  headers?: Record<string, HeaderValue>
}

const now = (): number => globalThis.performance?.now?.() ?? Date.now()

const normalizeHeader = (value: HeaderValue): string | undefined => {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(', ') : String(value)
}

const readHeader = (
  event: H3EventLike | undefined,
  response: NitroResponseLike | undefined,
  name: string,
): string | undefined => {
  const fromNode = normalizeHeader(event?.node?.res?.getHeader?.(name))
  if (fromNode !== undefined) return fromNode

  const headers = response?.headers
  if (!headers) return undefined
  const key = Object.keys(headers).find((item) => item.toLowerCase() === name)
  return key === undefined ? undefined : normalizeHeader(headers[key])
}

const writeHeader = (
  event: H3EventLike | undefined,
  response: NitroResponseLike | undefined,
  name: string,
  value: string,
): void => {
  // 真正发送的是 Node 响应；只有在拿不到 Node 响应时才写 response.headers，避免出现重复响应头。
  const res = event?.node?.res
  if (typeof res?.setHeader === 'function') {
    res.setHeader(name, value)
    return
  }
  if (response?.headers) response.headers[name] = value
}

const isHtmlResponse = (
  event: H3EventLike | undefined,
  response: NitroResponseLike | undefined,
): boolean => (readHeader(event, response, 'content-type') ?? '').includes('text/html')

/**
 * 创建 SSR 耗时插件。导出工厂函数是为了便于在冒烟脚本里独立构造与断言。
 *
 * @param timingName 写入 `Server-Timing` 的指标名，需与客户端 `SSR_TIMING_NAME` 一致。
 */
export const createSsrTimingPlugin = (
  timingName: string = SSR_TIMING_NAME,
): ((nitroApp: NitroAppLike) => void) => {
  // 用 WeakMap 记录每个请求的开始时间，避免污染 event.context，并随请求对象自动回收。
  const starts = new WeakMap<object, number>()

  return (nitroApp: NitroAppLike): void => {
    nitroApp.hooks.hook('request', (event: object) => {
      if (event && typeof event === 'object') starts.set(event, now())
    })

    nitroApp.hooks.hook('beforeResponse', (event: H3EventLike, response: NitroResponseLike) => {
      const start = event && typeof event === 'object' ? starts.get(event) : undefined
      if (start === undefined) return
      starts.delete(event)

      // 只给 HTML 文档加响应头：接口与静态资源没有水合过程。
      if (!isHtmlResponse(event, response)) return

      const duration = Math.max(0, now() - start)
      const entry = `${timingName};dur=${duration.toFixed(1)}`
      const existing = readHeader(event, response, 'server-timing')
      writeHeader(event, response, 'server-timing', existing ? `${existing}, ${entry}` : entry)
    })
  }
}

export default createSsrTimingPlugin()
