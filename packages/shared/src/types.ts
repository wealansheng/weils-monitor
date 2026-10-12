export interface MonitorOptions {
  dsn: string
  env?: string
}

export type MonitorLevel = 'debug' | 'info' | 'warn' | 'error'