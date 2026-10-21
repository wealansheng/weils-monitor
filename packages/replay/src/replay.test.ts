import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory, IDBDatabase } from 'fake-indexeddb'
import { gzipSync, strToU8 } from 'fflate'
import { createRecorder } from './index'
import { decode, encode, splitRecord, toBase64 } from './codec'
import { sanitizeEvent } from './privacy'
import { ReplayStore } from './storage'
import { decodeRecordChunks } from './player'

const mock = vi.hoisted(() => ({ options: undefined as any, stop: vi.fn() }))
vi.mock('@rrweb/record', () => ({ record: (options: any) => { mock.options = options; return mock.stop } }))
vi.mock('@rrweb/replay', () => ({ Replayer: vi.fn() }))
const eventId = '81111111-1111-4111-8111-111111111111'
const active: ReturnType<typeof createRecorder>[] = []
const statuses: any[] = []
const snapshot = (timestamp = Date.now()) => [
  { type: 4, timestamp, data: { href: 'https://example.test/?token=secret', width: 1000, height: 600 } },
  { type: 2, timestamp, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { top: 0, left: 0 } } },
]
const metadata: any = { app_id: 'app', project_name: '', session_id: 'session', user_id: '', record_id: eventId,
  page_url: '', route: '/', release: '', environment: '', sdk_version: '', rrweb_version: '2.1.7', protocol_version: 1,
  encoding: 'gzip-base64', started_at: 1000, ended_at: 2000, display_start: 1000, errors: [{ event_id: eventId, timestamp: 1500 }], end_reason: 'window', context_missing: false }
function recorder(options: any = {}) {
  const item = createRecorder({ appId: 'app', sessionId: 'session', persistIntervalMs: 15, afterErrorMs: 25,
    beforeErrorMs: 30, onStatus: value => statuses.push(value), ...options })
  active.push(item); return item
}
async function until(predicate: () => boolean | Promise<boolean>, timeout = 5000) {
  const end = Date.now() + timeout
  while (!(await predicate())) { if (Date.now() > end) throw new Error('Condition timed out'); await new Promise(resolve => setTimeout(resolve, 15)) }
}
beforeEach(() => {
  statuses.length = 0; mock.options = undefined; mock.stop.mockClear()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  vi.stubGlobal('location', new URL('https://example.test/checkout?token=private'))
  const storage = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const chunk = JSON.parse(init.body as string)
    return { ok: true, json: async () => ({ ok: true, record_id: chunk.record_id, chunk_index: chunk.chunk_index, chunk_checksum: chunk.chunk_checksum }) }
  }))
})
afterEach(async () => { await Promise.all(active.splice(0).map(item => item.destroy())); vi.unstubAllGlobals() })

describe('recording codec and privacy', () => {
  it('round-trips Unicode and validates a single package', async () => {
    const events = snapshot(1000)
    const encoded = await encode(events)
    expect(await decode(encoded.payload)).toEqual(events)
    const chunks = await splitRecord(metadata, events)
    expect(chunks).toHaveLength(1)
    expect(await decodeRecordChunks(chunks)).toEqual(events)
    await expect(decodeRecordChunks([{ ...chunks[0], payload: 'corrupt' }])).rejects.toThrow()
  })
  it('splits incompressible recordings, restores order, rejects missing and duplicate chunks', async () => {
    const noise = Array.from(crypto.getRandomValues(new Uint8Array(60_000)), value => value.toString(16)).join('')
    const events = [...snapshot(1000), ...Array.from({ length: 5 }, (_, i) => ({ type: 5, timestamp: 1100 + i, data: { tag: 'noise', payload: noise.slice(i) + noise.split('').reverse().join('') } }))]
    const chunks = await splitRecord(metadata, events)
    expect(chunks.length).toBeGreaterThan(1)
    expect(await decodeRecordChunks([...chunks].reverse())).toEqual(events)
    await expect(decodeRecordChunks(chunks.slice(1))).rejects.toThrow()
    await expect(decodeRecordChunks([chunks[0], chunks[0], ...chunks.slice(2)])).rejects.toThrow()
  })
  it('rejects decoded size overflow', async () => {
    const payload = toBase64(gzipSync(strToU8('"' + 'x'.repeat(10000) + '"')))
    await expect(decode(payload, 10)).rejects.toThrow('size limit')
  })
  it('sanitizes initial and incremental attributes before storage', () => {
    const result: any = sanitizeEvent({ data: { href: 'https://x.test/?email=private&tab=1', adds: [{ node: { attributes: { 'data-token': 'private', onclick: 'secret()', class: 'active', 'data-v-123': '', src: 'https://x.test/a?token=private&v=1' } } }], attributes: [{ attributes: { nonce: 'secret', href: '/?password=private' } }] } }, {})
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result.data.adds[0].node.attributes).toHaveProperty('data-v-123')
    expect(result.data.adds[0].node.attributes.class).toBe('active')
  })
})
describe('local durability and upload', () => {
  it('does not record sampled-out sessions and configures sampling/masking', async () => {
    await recorder({ sampleRate: 0 }).start()
    expect(mock.options).toBeUndefined()
    expect(statuses.some(status => status.type === 'sampled-out')).toBe(true)
    await recorder({ sessionId: 'other' }).start()
    expect(mock.options.sampling).toEqual({ mousemove: 50, scroll: 50, input: 'last' })
    expect(mock.options.maskAllInputs).toBe(true)
    expect(mock.options.recordCanvas).toBe(false)
  })
  it('persists compressed data but never uploads an untriggered session', async () => {
    const item = recorder({ afterErrorMs: 300 }); await item.start()
    snapshot().forEach(event => mock.options.emit(event))
    const store = new ReplayStore(() => {}); await store.open()
    await until(async () => (await store.list()).some(row => row.kind === 'batch'))
    const rows = await store.list()
    const batch = rows.find(row => row.kind === 'batch')!
    expect(typeof batch.data).toBe('string')
    expect(JSON.stringify(batch.data)).not.toContain('secret')
    await item.flush(); expect(fetch).not.toHaveBeenCalled(); store.close()
  })
  it('merges errors and uploads only after the post-error window', async () => {
    const item = recorder({ afterErrorMs: 300 }); await item.start()
    snapshot().forEach(event => mock.options.emit(event))
    await item.capture(eventId)
    await item.capture('82222222-2222-4222-8222-222222222222')
    await until(() => (fetch as any).mock.calls.length > 0)
    const chunk = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(chunk.errors).toHaveLength(2)
    expect(chunk.page_url).not.toContain('private')
    await until(() => statuses.some(status => status.type === 'uploaded'))
  })
  it('retains data on failed or invalid acknowledgements', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    const item = recorder(); await item.start(); snapshot().forEach(event => mock.options.emit(event)); await item.capture(eventId)
    await until(() => statuses.some(status => status.type === 'upload-error'))
    const store = new ReplayStore(() => {}); await store.open()
    expect((await store.list()).filter(row => row.kind === 'upload')).toHaveLength(1)
    expect((await store.list()).filter(row => row.kind === 'state').every(row => !(row.data as any).capture)).toBe(true)
    store.close()
  })
  it('keeps the same recording and checksums when a failed request is retried', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
    const item = recorder(); await item.start(); snapshot().forEach(event => mock.options.emit(event)); await item.capture(eventId)
    await until(() => statuses.some(status => status.type === 'upload-error'))
    const store = new ReplayStore(() => {}); await store.open()
    const row = (await store.list()).find(row => row.kind === 'upload')!
    ;(row.data as any).retryAt = 0; await store.commit([row])
    await item.flush()
    expect((fetch as any).mock.calls[1][1].body).toBe((fetch as any).mock.calls[0][1].body)
    expect((await store.list()).some(row => row.kind === 'upload')).toBe(false)
    store.close()
  })
  it('trims old epochs while retaining the snapshot required before the display boundary', async () => {
    const item = recorder({ beforeErrorMs: 100, afterErrorMs: 1000 }); await item.start()
    const now = Date.now()
    for (const timestamp of [now - 2000, now - 500, now - 10]) snapshot(timestamp).forEach(event => mock.options.emit(event))
    await item.capture(eventId, now); await item.stop()
    const chunk = JSON.parse((fetch as any).mock.calls[0][1].body)
    const events: any[] = await decode(chunk.payload)
    expect(events[0].timestamp).toBe(now - 500)
    expect(chunk.display_start).toBe(now - 100)
  })
  it('reports a capacity drop rather than keeping an unbounded memory queue', async () => {
    const item = recorder({ maxQueueBytes: 1 }); await item.start()
    snapshot().forEach(event => mock.options.emit(event)); await item.capture(eventId)
    await until(() => statuses.some(status => status.type === 'dropped' && status.message === 'Upload queue full'))
    expect(fetch).not.toHaveBeenCalled()
  })
  it('expires old pending recordings without sending them', async () => {
    const store = new ReplayStore(() => {}); await store.open()
    const chunks = await splitRecord(metadata, snapshot(1000))
    await store.commit([{ key: 'upload:expired', kind: 'upload', app: 'app', owner: 'old', leaseUntil: 0, createdAt: Date.now() - 86_400_001,
      data: { chunks, next: 0, retryAt: 0, attempt: 0 } }])
    await recorder({ sampleRate: 0 }).start()
    expect(fetch).not.toHaveBeenCalled()
    expect((await store.list()).some(row => row.key === 'upload:expired')).toBe(false)
    store.close()
  })
  it('keeps a durable task in memory if an IndexedDB write fails', async () => {
    const failures: string[] = []; const store = new ReplayStore(message => failures.push(message)); await store.open()
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => { throw new DOMException('quota exceeded', 'QuotaExceededError') })
    const row: any = { key: 'upload:quota', kind: 'upload', app: 'app', owner: 'owner', leaseUntil: 0, createdAt: Date.now(), data: { payload: 'already-compressed' } }
    await store.commit([row]); spy.mockRestore()
    expect(failures).toHaveLength(1)
    expect(await store.list()).toEqual([row]); store.close()
  })
  it('recovers only triggered abandoned checkpoints', async () => {
    const store = new ReplayStore(() => {}); await store.open()
    const encoded = await encode(snapshot(1000))
    const row = { app: 'app', owner: 'crashed', leaseUntil: 0, createdAt: Date.now() }
    await store.commit([
      { ...row, key: 'batch:old', kind: 'batch', data: encoded.payload },
      { ...row, key: 'state:old', kind: 'state', data: { metadata, keys: ['batch:old'], capture: { id: eventId, errors: metadata.errors, displayStart: 1000, contextMissing: false } } },
    ])
    await recorder().start()
    await until(() => (fetch as any).mock.calls.length > 0)
    expect(JSON.parse((fetch as any).mock.calls[0][1].body).end_reason).toBe('recovered')
    store.close()
  })
  it('claims tasks atomically across stores and recovers expired leases', async () => {
    const a = new ReplayStore(() => {}); const b = new ReplayStore(() => {}); await a.open(); await b.open()
    await a.commit([{ key: 'task', kind: 'upload', app: 'app', owner: 'old', leaseUntil: 0, createdAt: Date.now(), data: {} }])
    const claims = await Promise.all([a.claim('task', 'a'), b.claim('task', 'b')])
    expect(claims.filter(Boolean)).toHaveLength(1)
    a.close(); b.close()
  })
  it('falls back to memory on IndexedDB failure', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const item = recorder(); await item.start(); snapshot().forEach(event => mock.options.emit(event)); await item.capture(eventId)
    await until(() => statuses.some(status => status.type === 'uploaded'))
    expect(statuses.some(status => status.type === 'memory-fallback')).toBe(true)
  })
})
