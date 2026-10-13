/// <reference path="./global.d.ts" />

import * as performance from './performance';
import * as error from './error';
import * as behavior from './behavior';

import { setConfig } from '@weils-monitor/utils';
import type { InitOptions, VueReportData } from '@weils-monitor/shared';
import type { App, ComponentPublicInstance } from 'vue';

// 挂载全局对象
window.__WEILS_MONITOR_SDK__ = {
  version: '0.0.1',
};

// 监控vue错误
export const install = (Vue: App, options: Partial<InitOptions>): void => {
  if (window.__WEILS_MONITOR_SDK__.vue) return;
  window.__WEILS_MONITOR_SDK__.vue = true;

  setConfig(options);

  const handler = Vue.config.errorHandler;

  Vue.config.errorHandler = function (
    this: unknown,
    err: unknown,
    vm: ComponentPublicInstance | null,
    info: string,
  ): void {
    const reportData: VueReportData = {
      type: 'error',
      subType: 'vue',
      info,
      error: err instanceof Error ? err.stack : String(err),
      startTime: window.performance.now(),
      pageURL: window.location.href,
    }

    // lazyReportBatch(reportData);
    console.log(reportData);

    if (handler) {
      handler.call(this, err, vm, info);
    }
  };
};

export const init = (options: InitOptions): void => {
  setConfig(options);
};

export * from './types';

export default {
  install,
  performance,
  error,
  behavior,
  init,
};
