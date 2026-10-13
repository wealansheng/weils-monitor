// src/types/global.d.ts
export {};  // 让文件成为模块

declare global {
  interface Window {
    __WEILS_MONITOR_SDK__: WeilsMonitorSDK;
  }
}
