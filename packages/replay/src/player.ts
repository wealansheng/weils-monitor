import { Replayer } from '@rrweb/replay'
import type { eventWithTime } from '@rrweb/types'
import type { RecordChunk } from '../../shared/src/replay'
import { CHUNK_SIZE, MAX_RAW_BYTES, bytes, decode, sha256 } from './codec'

export async function decodeRecordChunks(chunks: RecordChunk[]): Promise<eventWithTime[]> {
  if (!chunks.length) throw new Error('录制分片为空')
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)
  const first = sorted[0]
  if (first.chunk_count < 1 || first.chunk_count > 64 || sorted.length !== first.chunk_count) throw new Error('录制分片不完整')
  for (const [index, part] of sorted.entries()) {
    const { chunk_index: _i, chunk_checksum: _c, payload: _p, ...metadata } = part
    const { chunk_index: _fi, chunk_checksum: _fc, payload: _fp, ...expected } = first
    if (part.chunk_index !== index || JSON.stringify(metadata) !== JSON.stringify(expected)
      || part.payload.length > CHUNK_SIZE || await sha256(part.payload) !== part.chunk_checksum) throw new Error('录制分片校验失败')
  }
  const payload = sorted.map(part => part.payload).join('')
  if (payload.length !== first.encoded_bytes || first.raw_bytes > MAX_RAW_BYTES || await sha256(payload) !== first.checksum) throw new Error('录制完整性校验失败')
  const events = await decode<eventWithTime[]>(payload)
  if (!Array.isArray(events) || !events.length || !events.some(event => event.type === 2)
    || events.some(event => !Number.isFinite(event.timestamp) || !Number.isInteger(event.type) || !event.data)
    || bytes(JSON.stringify(events)) !== first.raw_bytes) throw new Error('录制事件无效')
  return events
}

export interface ReplayPlayerOptions {
  target: HTMLElement
  events?: eventWithTime[]
  chunks?: RecordChunk[]
  displayStart?: number
}
/** Framework-neutral wrapper; callers own controls, the rrweb iframe stays sandboxed. */
export async function createReplayPlayer(options: ReplayPlayerOptions) {
  const events = options.events || await decodeRecordChunks(options.chunks || [])
  const start = events[0]?.timestamp || 0
  const displayStart = Math.max(start, options.displayStart || options.chunks?.[0]?.display_start || start)
  const replayer = new Replayer(events, { root: options.target, UNSAFE_replayCanvas: false, triggerFocus: false, showWarning: false })
  replayer.pause(displayStart - start)
  return {
    play: (time?: number) => replayer.play(time === undefined ? undefined : Math.max(0, time + displayStart - start)),
    pause: () => replayer.pause(),
    seek: (time: number) => replayer.pause(Math.max(0, time + displayStart - start)),
    setSpeed: (speed: number) => replayer.setConfig({ speed }),
    getCurrentTime: () => Math.max(0, replayer.getCurrentTime() - (displayStart - start)),
    duration: Math.max(0, events[events.length - 1].timestamp - displayStart),
    destroy: () => replayer.destroy(),
  }
}
