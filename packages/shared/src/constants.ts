import type { InitOptions } from "./types/index"

export const VERSION = '0.0.1' 
// 会话窗口配置
export const SESSION_WINDOW_MAX_DURATION = 5000; // 5 秒
export const SESSION_WINDOW_MAX_GAP = 1000;      // 1 秒

export const config: InitOptions = {
    url: 'http://127.0.0.1:8080/api',
    projectName: 'weils-monitor',
    appId: '123456',
    userId: '123456',
    isImageUpload: false,
    batchSize: 5,
}