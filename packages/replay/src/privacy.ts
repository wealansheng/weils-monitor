import type { ReplayOptions } from '../../shared/src/replay'

const sensitive = /pass(word)?|token|secret|auth|cookie|session|code|otp|phone|email/i
export function sanitizeUrl(value: string, base?: string): string {
  if (/^(data|javascript):/i.test(value)) return ''
  try {
    const url = new URL(value, base || (typeof location !== 'undefined' ? location.href : 'https://redacted.invalid/'))
    url.username = ''; url.password = ''
    for (const key of [...url.searchParams.keys()]) if (sensitive.test(key)) url.searchParams.delete(key)
    // Hash fragments often carry credentials; hash-router paths remain useful without their query.
    url.hash = url.hash.split('?')[0].replace(/(token|secret|password|code)=.*/i, '$1=***')
    return url.toString()
  } catch { return value.split(/[?#]/)[0] }
}
export function sanitizeAttributes(attributes: Record<string, unknown>, drop: string[] = []): void {
  for (const key of Object.keys(attributes)) {
    if (/^on/i.test(key) || /^(nonce|integrity)$/i.test(key) || /^data-(analytics|track|monitor)(-|$)/i.test(key)
      || sensitive.test(key) && !/^(class|style)$/i.test(key) || drop.includes(key)) {
      delete attributes[key]
    } else if (/^(src|href|action|formaction|poster|xlink:href)$/i.test(key) && typeof attributes[key] === 'string') {
      attributes[key] = sanitizeUrl(attributes[key] as string)
    } else if (/^srcset$/i.test(key)) {
      delete attributes[key]
    }
  }
}
/** Apply attribute policy to both serialized full trees and incremental additions/attributes. */
export function sanitizeEvent<T>(event: T, options: ReplayOptions): T {
  const copy = structuredClone(event)
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    if (object.attributes && typeof object.attributes === 'object') sanitizeAttributes(object.attributes as Record<string, unknown>, options.dropAttributes)
    if (typeof object.href === 'string') object.href = sanitizeUrl(object.href)
    for (const child of Object.values(object)) {
      if (Array.isArray(child)) child.forEach(walk)
      else if (child && typeof child === 'object') walk(child)
    }
  }
  walk(copy)
  return copy
}
