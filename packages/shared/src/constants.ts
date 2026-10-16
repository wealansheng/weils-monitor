import type { InitOptions } from "./types/index"

export const VERSION = '1.0.1'
// 会话窗口配置
export const SESSION_WINDOW_MAX_DURATION = 5000; // 5 秒
export const SESSION_WINDOW_MAX_GAP = 1000;      // 1 秒

export const config: InitOptions = {
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
