import type { InitOptions, QueueReportData } from "./types/index"

export const VERSION = '1.0.1'
// 会话窗口配置
export const SESSION_WINDOW_MAX_DURATION = 5000; // 5 秒
export const SESSION_WINDOW_MAX_GAP = 1000;      // 1 秒

export interface MonitorSharedState {
  config: InitOptions
  queue: QueueReportData[]
}

const defaultConfig: InitOptions = {
    appId: '',
    appKey: '',
    url: 'http://127.0.0.1:8080/api/v1/monitor',
    projectName: 'weils-monitor',
    userId: '',
    release: '',
    environment: 'production',
    sessionId: '',
    traceId: '',
    isImageUpload: false,
    batchSize: 20,
    maxBatchBytes: 50 * 1024,
    sampleRate: 1,
    resourceDurationThreshold: 100,
    debug: false,
}

interface GlobalWithMonitorState {
    __WEILS_MONITOR_STATE__?: MonitorSharedState
}

const scope = globalThis as unknown as GlobalWithMonitorState

/**
 * 同一页面内只允许存在一份配置与队列。
 *
 * pnpm workspace + uni-app/HBuilderX 等构建器可能把 shared 分别打包进多个包，
 * 形成多份模块实例；如果各自持有 config/queue，会出现 setConfig 写入 A、
 * 发送逻辑读取 B（默认 8080）的问题。挂到 globalThis 上可跨模块副本共享。
 */
export const sharedState: MonitorSharedState = scope.__WEILS_MONITOR_STATE__ ??= {
    config: { ...defaultConfig },
    queue: [],
}

export const config: InitOptions = sharedState.config
