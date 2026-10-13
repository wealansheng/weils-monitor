import type { WeilsMonitorSDK } from './types';

declare global {
  interface Window {
    __WEILS_MONITOR_SDK__: WeilsMonitorSDK;
  }
}
