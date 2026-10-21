import { gzip, AsyncGunzip, strToU8, strFromU8 } from 'fflate'
import type { RecordChunk, RecordMetadata } from '../../shared/src/replay'

export const CHUNK_SIZE = 256 * 1024
export const MAX_RAW_BYTES = 16 * 1024 * 1024
export const bytes = (text: string): number => strToU8(text).length
export const uuid = (): string => globalThis.crypto.randomUUID()
export async function sha256(text: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', strToU8(text) as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
}
export function toBase64(data: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    result += String.fromCharCode(...data.subarray(offset, offset + 0x8000))
  }
  return btoa(result)
}
export const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), ch => ch.charCodeAt(0))
export async function encode(data: unknown): Promise<{ payload: string; rawBytes: number }> {
  const raw = strToU8(JSON.stringify(data))
  const compressed = await new Promise<Uint8Array>((resolve, reject) => {
    gzip(raw, { level: 6 }, (error, value) => error ? reject(error) : resolve(value))
  })
  return { payload: toBase64(compressed), rawBytes: raw.length }
}
export async function decode<T>(payload: string, limit = MAX_RAW_BYTES): Promise<T> {
  const data = fromBase64(payload)
  // ISIZE is only an early check. Bound actual streamed output as well, including concatenated members.
  if (data.length < 18 || data[0] !== 31 || data[1] !== 139) throw new Error('Invalid gzip recording')
  const size = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(data.length - 4, true)
  if (size > limit) throw new Error('Recording exceeds decoded size limit')
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    const parts: Uint8Array[] = []
    let total = 0; let offset = 0
    const stream = new AsyncGunzip((error, value, final) => {
      if (error) { stream.terminate(); reject(error); return }
      total += value.length
      if (total > limit) { stream.terminate(); reject(new Error('Recording exceeds decoded size limit')); return }
      parts.push(value)
      if (final) {
        const result = new Uint8Array(total)
        let position = 0
        for (const part of parts) { result.set(part, position); position += part.length }
        stream.terminate(); resolve(result)
      }
    })
    const push = (): void => {
      const end = Math.min(data.length, offset + 1024)
      const part = data.slice(offset, end); offset = end
      stream.push(part, end === data.length)
    }
    stream.ondrain = () => { if (offset < data.length) push() }
    push()
  })
  if (raw.length > limit) throw new Error('Recording exceeds decoded size limit')
  return JSON.parse(strFromU8(raw)) as T
}
export async function splitRecord(metadata: Omit<RecordMetadata, 'checksum' | 'encoded_bytes' | 'raw_bytes' | 'chunk_count'>, events: unknown[]): Promise<RecordChunk[]> {
  const { payload, rawBytes } = await encode(events)
  if (rawBytes > MAX_RAW_BYTES || payload.length > 64 * CHUNK_SIZE) throw new Error('Recording exceeds size limit')
  const common: RecordMetadata = { ...metadata, raw_bytes: rawBytes, encoded_bytes: payload.length,
    checksum: await sha256(payload), chunk_count: Math.ceil(payload.length / CHUNK_SIZE) }
  return Promise.all(Array.from({ length: common.chunk_count }, async (_, chunk_index) => {
    const part = payload.slice(chunk_index * CHUNK_SIZE, (chunk_index + 1) * CHUNK_SIZE)
    return { ...common, chunk_index, payload: part, chunk_checksum: await sha256(part) }
  }))
}
