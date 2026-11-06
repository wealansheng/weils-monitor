import { config, VERSION } from '@weils-monitor/shared'
import type { QueueReportData, ReplayCaptureOptions, ReplayController, ReplayStatus } from '@weils-monitor/shared'

const triggers = new Set(['js_error', 'promise_error', 'framework_error', 'nuxt_error', 'nuxt_chunk_error'])

/** The synchronous subscription also catches errors emitted while the recorder chunk loads. */
export function createReplayController(): ReplayController {
  let recorder: ReplayController | undefined
  let loading: Promise<void> | undefined
  let disposed = false
  const listeners = new Set<(status: ReplayStatus) => void>()
  const pending: Array<{ id: string; timestamp: number; trigger?: ReplayCaptureOptions }> = []
  const notify = (status: ReplayStatus): void => {
    for (const listener of [config.replay?.onStatus, ...listeners]) { try { listener?.(status) } catch {} }
  }
  const onReport = (event: Event): void => {
    const data = (event as CustomEvent<QueueReportData>).detail
    if (data?.event_type === 'error' && triggers.has(data.error_type) && data.event_id) {
      void controller.capture(data.event_id, data.timestamp).catch(() => {})
    } else if (data?.event_type === 'behavior' && data.properties?.replay_trigger === true && data.event_id) {
      void controller.capture(data.event_id, data.timestamp, { type: 'custom', action: data.action }).catch(() => {})
    }
  }
  const active = config.replay?.enabled === true && typeof window !== 'undefined'
  if (active) {
    if (!config.sessionId) {
      const sessionId = (): string => typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
      try {
        const key = `weils-monitor-session:${config.appId}`
        config.sessionId = sessionStorage.getItem(key) || sessionId()
        sessionStorage.setItem(key, config.sessionId)
      } catch { config.sessionId = sessionId() }
    }
    window.addEventListener('weils-monitor:report', onReport)
  }
  const controller: ReplayController = {
    async start() {
      if (!active || disposed) return
      if (loading) return loading
      if (recorder) return recorder.start()
      loading = (async () => {
        const { createRecorder } = await import('@weils-monitor/replay')
        if (disposed) return
        recorder = createRecorder({ ...config.replay, appId: String(config.appId), sessionId: config.sessionId!,
          projectName: config.projectName, userId: config.userId, release: config.release,
          environment: config.environment, sdkVersion: VERSION, onStatus: notify })
        await recorder.start()
        for (const event of pending.splice(0)) await recorder.capture(event.id, event.timestamp, event.trigger)
      })().catch(error => notify({ type: 'error', message: String(error) })).finally(() => { loading = undefined })
      return loading
    },
    async capture(id, timestamp = Date.now(), trigger) {
      if (!active || disposed) return
      if (!recorder || loading) {
        if (pending.length >= 100) pending.shift()
        pending.push({ id, timestamp, trigger }); return
      }
      await recorder.capture(id, timestamp, trigger)
    },
    async stop() { pending.length = 0; await loading; await recorder?.stop() },
    async flush() { await loading; await recorder?.flush() },
    async destroy() {
      disposed = true; pending.length = 0
      if (active) window.removeEventListener('weils-monitor:report', onReport)
      await loading; await recorder?.destroy(); listeners.clear()
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  return controller
}
