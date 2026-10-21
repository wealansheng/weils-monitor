import { record } from '@rrweb/record'
import type { eventWithTime } from '@rrweb/types'
import type { RecordChunk, RecordError, RecordMetadata, ReplayController, ReplayOptions, ReplayStatus } from '../../shared/src/replay'
import { bytes, decode, encode, splitRecord, uuid } from './codec'
import { sanitizeEvent, sanitizeUrl } from './privacy'
import { ReplayStore, type Stored } from './storage'

export type { RecordChunk, RecordMetadata, ReplayOptions, ReplayController, ReplayStatus } from '../../shared/src/replay'
export interface RecorderOptions extends ReplayOptions {
  appId: string
  sessionId: string
  projectName?: string
  userId?: string | number
  release?: string
  environment?: string
  sdkVersion?: string
}
interface Epoch { id: string; events: eventWithTime[]; size: number; encodedSize: number; keys: string[] }
interface Capture { id: string; errors: RecordError[]; displayStart: number; deadline: number; limit: number; contextMissing: boolean }
interface Checkpoint { metadata: Partial<RecordMetadata>; capture?: Capture; keys: string[] }
interface Upload { chunks: RecordChunk[]; next: number; attempt: number; retryAt: number }
const MB = 1024 * 1024
const positive = (value: number | undefined, fallback: number): number => Number.isFinite(value) && value! > 0 ? value! : fallback
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** A recorder owns one tab's full-snapshot chain; only triggered captures become upload tasks. */
export function createRecorder(options: RecorderOptions): ReplayController {
  const listeners = new Set<(status: ReplayStatus) => void>()
  const notify = (status: ReplayStatus): void => {
    for (const fn of [options.onStatus, ...listeners]) { try { fn?.(status) } catch { /* never interrupt the monitored app */ } }
  }
  const before = positive(options.beforeErrorMs, 30_000)
  const after = positive(options.afterErrorMs, 10_000)
  const duration = positive(options.maxDurationMs, 120_000)
  const maxRaw = Math.min(16 * MB, positive(options.maxRecordBytes, 16 * MB))
  const owner = uuid()
  const store = new ReplayStore(message => notify({ type: 'memory-fallback', message }))
  const stateKey = `state:${owner}`
  let epochs: Epoch[] = []
  let pending: eventWithTime[] = []
  let pendingEpoch = ''
  let pendingSize = 0
  let capture: Capture | undefined
  let stopRecording: (() => void) | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let starting: Promise<void> | undefined
  let chain: Promise<void> = Promise.resolve()
  let flushing: Promise<void> | undefined
  let started = false
  let destroyed = false
  let opened = false
  let releaseOwnerLock: (() => void) | undefined
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  const ownerLockName = (id: string): string => `weils-replay-owner:${id}`
  async function holdOwnerLock(): Promise<void> {
    if (!locks || releaseOwnerLock) return
    await new Promise<void>((resolve, reject) => {
      void locks.request(ownerLockName(owner), async () => {
        await new Promise<void>(release => { releaseOwnerLock = release; resolve() })
      }).catch(reject)
    })
  }
  async function whenOwnerAbsent(id: string, work: () => Promise<void>): Promise<void> {
    if (!locks) { await work(); return }
    await locks.request(ownerLockName(id), { ifAvailable: true }, async lock => { if (lock) await work() })
  }
  let batchNumber = 0
  let haltRequested = false
  const garbage = new Set<string>()
  const tasks = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work)
    chain = next.then(() => {}, error => notify({ type: 'error', message: errorMessage(error) }))
    return next
  }
  const metadata = (): Partial<RecordMetadata> => ({
    app_id: options.appId, project_name: options.projectName || '', session_id: options.sessionId,
    user_id: String(options.userId ?? ''), release: options.release || '', environment: options.environment || 'production',
    sdk_version: options.sdkVersion || '', page_url: sanitizeUrl(location.href), route: location.pathname,
    rrweb_version: '2.1.7', protocol_version: 1, encoding: 'gzip-base64',
  })
  const entity = (key: string, kind: Stored['kind'], data: unknown): Stored => ({
    key, kind, app: options.appId, owner, leaseUntil: Date.now() + 30_000, createdAt: Date.now(), data,
  })
  const allEvents = (): eventWithTime[] => epochs.flatMap(epoch => epoch.events)
  const selectEvents = (events: eventWithTime[], displayStart: number): eventWithTime[] => {
    let index = 0
    for (let i = 0; i < events.length; i++) if (events[i].type === 2 && events[i].timestamp <= displayStart) index = i > 0 && events[i - 1].type === 4 ? i - 1 : i
    return events.slice(index)
  }
  async function persist(): Promise<void> {
    const entries: Stored[] = []
    if (pending.length) {
      const events = pending; const epochId = pendingEpoch
      pending = []; pendingSize = 0
      const encoded = await encode(events)
      const key = `batch:${owner}:${batchNumber++}`
      const epoch = epochs.find(item => item.id === epochId)
      // pending can contain a checkout, but is always associated with the previous chain until this commit.
      if (epoch) { epoch.keys.push(key); epoch.encodedSize += encoded.payload.length }
      entries.push(entity(key, 'batch', encoded.payload))
    }
    const remove: string[] = [...garbage]; garbage.clear()
    if (!capture) {
      const target = Date.now() - before
      const maxRolling = positive(options.maxRollingBytes, 8 * MB)
      while (epochs.length > 1 && (epochs[1].events[0]?.timestamp <= target
        || epochs.reduce((sum, epoch) => sum + epoch.size, 0) > maxRaw - 2048
        || epochs.reduce((sum, epoch) => sum + epoch.encodedSize, 0) > maxRolling)) {
        remove.push(...epochs.shift()!.keys)
      }
      if (epochs.reduce((sum, epoch) => sum + epoch.encodedSize, 0) > maxRolling && !haltRequested) {
        haltRequested = true
        notify({ type: 'dropped', message: 'Full snapshot chain exceeds rolling storage limit' })
        queueMicrotask(() => { void controller.stop().catch(() => {}) })
      }
    }
    entries.push(entity(stateKey, 'state', { metadata: metadata(), capture, keys: epochs.flatMap(epoch => epoch.keys) } satisfies Checkpoint))
    await store.commit(entries, remove)
  }
  async function enqueue(events: eventWithTime[], current: Capture, reason: RecordMetadata['end_reason'], meta = metadata(), sourceStateKey = stateKey): Promise<void> {
    const selected = selectEvents(events, current.displayStart)
    if (!selected.some(event => event.type === 2)) {
      notify({ type: 'dropped', recordId: current.id, message: 'No full snapshot available' }); return
    }
    const endTime = Math.max(selected[selected.length - 1].timestamp, ...current.errors.map(error => error.timestamp), reason === 'recovered' ? 0 : Date.now())
    selected.push({ type: 5, timestamp: endTime, data: { tag: 'weils:record-end', payload: { reason } } })
    const chunks = await splitRecord({ ...meta, record_id: current.id, started_at: Math.min(selected[0].timestamp, current.errors[0].timestamp),
      ended_at: endTime,
      display_start: Math.max(selected[0].timestamp, current.displayStart), errors: current.errors, end_reason: reason,
      context_missing: current.contextMissing || selected[0].timestamp > current.displayStart,
    } as Omit<RecordMetadata, 'checksum' | 'encoded_bytes' | 'raw_bytes' | 'chunk_count'>, selected)
    const rows = await store.list()
    const sourceState = rows.find(row => row.key === sourceStateKey)
    const clearedState = sourceState ? [{ ...sourceState, data: { ...sourceState.data as Checkpoint, capture: undefined } }] : []
    // Final payload + cleared recovery marker are one commit. A crash cannot create a second variant of this recording.
    if (rows.some(row => row.key === `upload:${current.id}`)) { await store.commit(clearedState); return }
    const uploads = rows.filter(row => row.kind === 'upload' && row.app === options.appId)
    const retention = positive(options.retentionMs, 86_400_000)
    const remove = uploads.filter(row => row.createdAt + retention < Date.now()).map(row => row.key)
    let size = uploads.filter(row => !remove.includes(row.key)).reduce((sum, row) => sum + (row.data as Upload).chunks[0].encoded_bytes, 0)
    const maxQueue = positive(options.maxQueueBytes, 50 * MB)
    for (const row of uploads.sort((a, b) => a.createdAt - b.createdAt)) {
      if (size + chunks[0].encoded_bytes <= maxQueue) break
      if (remove.includes(row.key) || row.owner !== owner && row.leaseUntil > Date.now()) continue
      remove.push(row.key); size -= (row.data as Upload).chunks[0].encoded_bytes
    }
    if (remove.length) notify({ type: 'dropped', message: `${remove.length} expired or capacity-limited recordings removed` })
    if (size + chunks[0].encoded_bytes > maxQueue) { notify({ type: 'dropped', recordId: current.id, message: 'Upload queue full' }); return }
    await store.commit([entity(`upload:${current.id}`, 'upload', { chunks, next: 0, attempt: 0, retryAt: 0 } satisfies Upload), ...clearedState], remove)
  }
  async function finish(reason: RecordMetadata['end_reason']): Promise<void> {
    if (!capture) return
    // Preserve the recovery marker until the final upload task is durably stored.
    const current = capture
    await persist()
    await enqueue(allEvents(), current, reason)
    capture = undefined
    await persist()
    void controller.flush()
  }
  async function recover(): Promise<void> {
    const rows = await store.list()
    for (const row of rows.filter(row => row.kind === 'state' && row.app === options.appId && row.owner !== owner && row.leaseUntil <= Date.now())) {
      await whenOwnerAbsent(row.owner, async () => {
      const claimed = await store.claim(row.key, owner)
      if (!claimed) return
      const state = claimed.data as Checkpoint
      if (state.capture) {
        try {
          const events: eventWithTime[] = []
          for (const key of state.keys) {
            const batch = rows.find(item => item.key === key)
            if (!batch) throw new Error('Checkpoint batch missing')
            events.push(...await decode<eventWithTime[]>(batch.data as string))
          }
          await enqueue(events, state.capture, 'recovered', state.metadata, row.key)
        } catch (error) { notify({ type: 'dropped', message: `Recovery failed: ${errorMessage(error)}` }) }
      }
      await store.commit([], [row.key, ...state.keys])
      })
    }
    const referenced = new Set(rows.filter(row => row.kind === 'state').flatMap(row => (row.data as Checkpoint).keys))
    const orphaned = rows.filter(row => row.kind === 'batch' && !referenced.has(row.key) && row.leaseUntil <= Date.now())
    for (const id of new Set(orphaned.map(row => row.owner))) {
      await whenOwnerAbsent(id, () => store.commit([], orphaned.filter(row => row.owner === id).map(row => row.key)))
    }
  }
  async function upload(): Promise<void> {
    const rows = await store.list()
    for (const row of rows.filter(row => row.kind === 'upload' && row.app === options.appId)) {
      if (destroyed) return
      if (row.createdAt + positive(options.retentionMs, 86_400_000) < Date.now()) {
        await store.commit([], [row.key]); notify({ type: 'dropped', message: 'Recording expired' }); continue
      }
      if ((row.data as Upload).retryAt > Date.now()) continue
      let claimed = await store.claim(row.key, owner)
      if (!claimed) continue
      const task = claimed.data as Upload
      try {
        while (task.next < task.chunks.length) {
          claimed = await store.claim(row.key, owner)
          if (!claimed || destroyed) return
          const chunk = task.chunks[task.next]
          const abort = new AbortController()
          const timeout = setTimeout(() => abort.abort(), 10_000)
          try {
            const response = await fetch(options.url || '/api/v1/records', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chunk), signal: abort.signal,
            })
            if (!response.ok) throw new Error(`Recording upload failed (${response.status})`)
            const receipt = await response.json() as { ok?: boolean; record_id?: string; chunk_index?: number; chunk_checksum?: string }
            if (!receipt.ok || receipt.record_id !== chunk.record_id || receipt.chunk_index !== chunk.chunk_index || receipt.chunk_checksum !== chunk.chunk_checksum) throw new Error('Invalid recording receipt')
          } finally { clearTimeout(timeout) }
          task.next++
          await store.commit([{ ...claimed, data: task }])
        }
        await store.commit([], [row.key])
        notify({ type: 'uploaded', recordId: task.chunks[0].record_id })
      } catch (error) {
        task.attempt++
        task.retryAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(task.attempt, 6)) * (0.75 + Math.random() * 0.5)
        await store.commit([{ ...claimed!, leaseUntil: 0, data: task }])
        notify({ type: 'upload-error', recordId: task.chunks[0].record_id, message: errorMessage(error) })
      }
    }
  }
  const onOnline = (): void => { void controller.flush() }
  const onVisibility = (): void => { if (document.visibilityState === 'hidden') void tasks(persist).catch(() => {}) }
  const onPagehide = (): void => { void tasks(() => finish('pagehide')).catch(() => {}) }
  function emit(raw: eventWithTime): void {
    if (destroyed) return
    const event = sanitizeEvent(raw, options)
    const size = bytes(JSON.stringify(event)) + 1 // include the array separator in the raw-byte budget
    let total = epochs.reduce((sum, epoch) => sum + epoch.size, 0) + size
    while (!capture && epochs.length > 1 && total > maxRaw - 2048) {
      const removed = epochs.shift()!
      total -= removed.size; removed.keys.forEach(key => garbage.add(key))
    }
    if (size > maxRaw - 2048 || total > maxRaw - 2048 && (capture || epochs.length <= 1)) {
      notify({ type: 'truncated', recordId: capture?.id, message: 'Recording size limit reached' })
      if (capture) void tasks(() => finish('size_limit')).catch(() => {})
      if (size > maxRaw - 2048 || !capture) { queueMicrotask(() => { void controller.stop().catch(() => {}) }); notify({ type: 'stopped', message: 'Full snapshot chain exceeds size limit' }) }
      return
    }
    if (!epochs.length || event.type === 4) {
      epochs.push({ id: uuid(), events: [], size: 0, encodedSize: 0, keys: [] })
    }
    const epoch = epochs[epochs.length - 1]
    if (pendingEpoch && pendingEpoch !== epoch.id && pending.length) {
      // Queue the old batch before switching epoch; the captured array is isolated in persist().
      const old = pending; const oldId = pendingEpoch
      pending = []; pendingSize = 0
      void tasks(async () => {
        const result = await encode(old)
        const key = `batch:${owner}:${batchNumber++}`
        const previous = epochs.find(item => item.id === oldId)
        if (previous) { previous.keys.push(key); previous.encodedSize += result.payload.length; await store.commit([entity(key, 'batch', result.payload)]) }
      }).catch(() => {})
    }
    epoch.events.push(event); epoch.size += size
    pendingEpoch = epoch.id; pending.push(event); pendingSize += size
    if (pendingSize >= positive(options.maxBatchBytes, 256 * 1024)) void tasks(persist).catch(() => {})
  }
  const controller: ReplayController = {
    async start() {
      if (destroyed || started || typeof window === 'undefined' || typeof document === 'undefined') return
      if (starting) return starting
      starting = (async () => {
        await holdOwnerLock()
        if (!opened) { await store.open(); opened = true; await recover() }
        if (!timer) {
          window.addEventListener('online', onOnline)
          timer = setInterval(() => {
            void tasks(async () => {
              if (started) {
                await persist()
                if (capture && Date.now() >= capture.deadline) await finish(Date.now() >= capture.limit ? 'duration_limit' : 'window')
              }
              await recover()
            }).catch(() => {})
            void controller.flush()
          }, positive(options.persistIntervalMs, 1000))
        }
        let sampled = true
        const rate = Number.isFinite(options.sampleRate) ? Math.max(0, Math.min(1, options.sampleRate!)) : 1
        try {
          const key = `weils-replay-sample:${options.appId}:${options.sessionId}`
          const existing = sessionStorage.getItem(key)
          sampled = existing === null ? Math.random() < rate : existing === '1'
          sessionStorage.setItem(key, sampled ? '1' : '0')
        } catch { sampled = Math.random() < rate }
        if (!sampled) { notify({ type: 'sampled-out' }); await controller.flush(); return }
        if (destroyed) return
        haltRequested = false
        stopRecording = record({
          emit, checkoutEveryNms: positive(options.checkpointIntervalMs, 10_000),
          recordAfter: 'DOMContentLoaded', blockClass: options.blockClass || 'rr-block',
          blockSelector: [options.blockSelector, '.rr-block', '[data-private]', 'canvas'].filter(Boolean).join(','),
          maskTextClass: options.maskTextClass || 'rr-mask', maskTextSelector: [options.maskTextSelector, '.rr-mask', '[contenteditable]'].filter(Boolean).join(','),
          maskAllInputs: true, maskInputOptions: { password: true },
          maskInputFn: (text, element) => element?.getAttribute('type')?.toLowerCase() === 'password'
            ? '*'.repeat(text.length) : options.maskInputFn?.(text, element!) ?? '*'.repeat(text.length),
          maskTextFn: options.maskTextFn,
          slimDOMOptions: 'all', sampling: { mousemove: 50, scroll: 50, input: 'last' },
          recordCanvas: false, recordCrossOriginIframes: false,
          errorHandler: error => { notify({ type: 'error', message: errorMessage(error) }); return true },
        })
        started = true
        window.addEventListener('pagehide', onPagehide)
        document.addEventListener('visibilitychange', onVisibility)
        notify({ type: 'started' })
      })().finally(() => { starting = undefined })
      return starting
    },
    async capture(eventId, timestamp = Date.now()) {
      if (starting) await starting
      if (!started || destroyed) return
      if (!/^[0-9a-f-]{36}$/i.test(eventId)) return
      await tasks(async () => {
        if (capture?.errors.some(error => error.event_id === eventId)) return
        if (capture && capture.errors.length >= 1000) { await finish('size_limit'); notify({ type: 'truncated', message: 'Error marker limit reached' }) }
        if (!capture) {
          capture = { id: uuid(), errors: [], displayStart: timestamp - before,
            deadline: Date.now() + after, limit: timestamp - before + duration,
            contextMissing: !epochs.length || epochs[0].events[0]?.timestamp > timestamp - before }
        }
        capture.errors.push({ event_id: eventId, timestamp })
        capture.deadline = Math.min(capture.limit, Date.now() + after)
        await persist()
      })
    },
    async flush() {
      if (!opened || destroyed) return
      if (flushing) return flushing
      flushing = upload().catch(error => notify({ type: 'upload-error', message: errorMessage(error) })).finally(() => { flushing = undefined })
      return flushing
    },
    async stop() {
      if (starting) await starting
      stopRecording?.(); stopRecording = undefined; started = false
      if (timer) clearInterval(timer)
      timer = undefined
      window.removeEventListener('online', onOnline); window.removeEventListener('pagehide', onPagehide)
      document.removeEventListener('visibilitychange', onVisibility)
      if (opened) {
        await tasks(async () => { await finish('stop'); await persist(); await store.commit([], [stateKey, ...epochs.flatMap(epoch => epoch.keys)]); epochs = []; pending = [] })
        await controller.flush()
      }
      notify({ type: 'stopped' })
      releaseOwnerLock?.(); releaseOwnerLock = undefined
    },
    async destroy() { await controller.stop(); destroyed = true; await flushing; store.close(); listeners.clear() },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  return controller
}
