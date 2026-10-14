/// <reference path="./global.d.ts" />

import * as performance from './performance';
import * as error from './error';
import * as behavior from './behavior';
import * as stability from './stability';

import { setConfig } from '@weils-monitor/utils';
import { VERSION } from '@weils-monitor/shared';
import type { InitOptions, VueReportData } from '@weils-monitor/shared';
import type { App, ComponentPublicInstance } from 'vue';
import { report, setupExitFlush } from './report';

// 挂载全局对象
window.__WEILS_MONITOR_SDK__ = {
  version: VERSION,
};

// 监控vue错误
export const install = (Vue: App, options: Partial<InitOptions>): void => {
  if (window.__WEILS_MONITOR_SDK__.vue) return;
  window.__WEILS_MONITOR_SDK__.vue = true;

  setConfig(options);
  setupExitFlush();

  const handler = Vue.config.errorHandler;

  Vue.config.errorHandler = function (
    this: unknown,
    err: unknown,
    vm: ComponentPublicInstance | null,
    info: string,
  ): void {
    const reportData: VueReportData = {
      event_type: 'error',
      error_type: 'framework_error',
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
      component: vm?.$options.name,
      component_stack: info,
    }

    report(reportData);

    if (handler) {
      handler.call(this, err, vm, info);
    }
  };
};

export const init = (options: InitOptions): void => {
  setConfig(options);
  setupExitFlush();
};

export * from './types';
export * from './report';

export default {
  install,
  performance,
  error,
  behavior,
  stability,
  init,
  report,
};
