export interface ReplayStatus {
  type: 'started' | 'stopped' | 'sampled-out' | 'memory-fallback' | 'truncated' | 'dropped' | 'upload-error' | 'uploaded' | 'error'
  message?: string
  recordId?: string
}

export interface ReplayOptions {
  enabled?: boolean
  /** Upload the rolling recording on page exit. Defaults to false (retain until a new trigger). */
  onMounted?: boolean
  url?: string
  sampleRate?: number
  beforeErrorMs?: number
  afterErrorMs?: number
  maxDurationMs?: number
  checkpointIntervalMs?: number
  persistIntervalMs?: number
  maxBatchBytes?: number
  maxRollingBytes?: number
  maxQueueBytes?: number
  maxRecordBytes?: number
  retentionMs?: number
  blockClass?: string
  blockSelector?: string
  maskTextClass?: string
  maskTextSelector?: string
  maskInputFn?: (text: string, element: HTMLElement) => string
  maskTextFn?: (text: string, element: HTMLElement | null) => string
  dropAttributes?: string[]
  onStatus?: (status: ReplayStatus) => void
}

export interface RecordError { event_id: string; timestamp: number }
export interface ReplayCaptureOptions { type: 'error' | 'custom'; action?: string }
export type RecordTrigger =
  | { type: 'error' | 'custom'; event_id: string; timestamp: number; action?: string }
  | { type: 'pagehide'; timestamp: number }
export interface RecordMetadata {
  app_id: string
  project_name: string
  session_id: string
  user_id: string
  record_id: string
  page_url: string
  route: string
  release: string
  environment: string
  sdk_version: string
  rrweb_version: string
  protocol_version: 1
  encoding: 'gzip-base64'
  started_at: number
  ended_at: number
  display_start: number
  errors: RecordError[]
  /** Absent on legacy, error-only recordings. */
  triggers?: RecordTrigger[]
  /** May reference a later event that released a retained recording. */
  linked_event_ids?: string[]
  end_reason: 'window' | 'duration_limit' | 'size_limit' | 'stop' | 'pagehide' | 'recovered'
  context_missing: boolean
  raw_bytes: number
  encoded_bytes: number
  checksum: string
  chunk_count: number
}

export interface RecordChunk extends RecordMetadata {
  chunk_index: number
  chunk_checksum: string
  payload: string
}

export interface ReplayController {
  start(): Promise<void>
  stop(): Promise<void>
  capture(eventId: string, timestamp?: number, trigger?: ReplayCaptureOptions): Promise<void>
  flush(): Promise<void>
  destroy(): Promise<void>
  subscribe(listener: (status: ReplayStatus) => void): () => void
}
