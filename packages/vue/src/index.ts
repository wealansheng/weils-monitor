/// <reference path="./global.d.ts" />

import * as performanceCollectors from './performance';
import * as errorCollectors from './error';
import * as behaviorCollectors from './behavior';
import * as stabilityCollectors from './stability';

import { setConfig } from '@weils-monitor/utils';
import { createMonitorCore } from '@weils-monitor/core';
import { VERSION } from '@weils-monitor/shared';
import type { InitOptions, VueReportData } from '@weils-monitor/shared';
import type { App, ComponentPublicInstance } from 'vue';
import { report, setupExitFlush } from './report';
import { installVueTiming, startVueTiming } from './performance/vueTiming';
import type { RouterLike } from './behavior/pageChange';

const installedApps = new WeakSet<App>();

if (typeof window !== 'undefined') {
  window.__WEILS_MONITOR_SDK__ ??= { version: VERSION };
}

/** Install the Vue error handler while preserving an existing application handler. */
export const install = (app: App, options?: Partial<InitOptions>): void => {
  if (options) setConfig(options);
  setupExitFlush();

  const sdk = window.__WEILS_MONITOR_SDK__ ??= { version: VERSION };
  if (installedApps.has(app)) return;
  installedApps.add(app);
  sdk.vue = true;
  installVueTiming(app);

  const previousHandler = app.config.errorHandler;
  app.config.errorHandler = function (
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
    };

    report(reportData);
    previousHandler?.call(this, err, vm, info);
  };
};

export const init = (options: InitOptions): void => {
  setConfig(options);
  setupExitFlush();
};

/** Create the plugin and its collector controls from a configuration module. */
export const createMonitor = (options: InitOptions) => {
  const core = createMonitorCore(options);
  let installedApp: App | undefined;

  const once = <Args extends unknown[], Result>(
    name: string,
    start: (...args: Args) => Result,
  ): ((...args: Args) => Result) => {
    return (...args: Args): Result => core.collectors.start(name, () => start(...args));
  };

  const error = { error: once('error', errorCollectors.error) };
  const behavior = {
    click: once('click', behaviorCollectors.click),
    pageChange: once('pageChange', () => behaviorCollectors.pageChange(
      installedApp?.config.globalProperties.$router as RouterLike | undefined,
    )),
    pv: once('pv', behaviorCollectors.pv),
  };
  const performance = {
    observerEntries: once('observerEntries', performanceCollectors.observerEntries),
    observerFP: once('observerFP', performanceCollectors.observerFP),
    observerFCP: once('observerFCP', performanceCollectors.observerFCP),
    observerLCP: once('observerLCP', performanceCollectors.observerLCP),
    observerLoad: once('observerLoad', performanceCollectors.observerLoad),
    observerCLS: once('observerCLS', performanceCollectors.observerCLS),
    observerFID: once('observerFID', performanceCollectors.observerFID),
    observerINP: once('observerINP', performanceCollectors.observerINP),
    observeTTFB: once('observeTTFB', performanceCollectors.observeTTFB),
    observerLongTask: once('observerLongTask', performanceCollectors.observerLongTask),
  };
  const stability = {
    observerBlankScreen: once('observerBlankScreen', stabilityCollectors.observerBlankScreen),
  };

  const monitor = {
    install: (app: App): void => {
      installedApp = app;
      install(app);
    },
    addClickHandler: (attribute: string) => {
      behaviorCollectors.addClickHandler(attribute);
      return monitor;
    },
    observer: (): void => {
      if (installedApp) startVueTiming(installedApp);
      error.error();
      behavior.click();
      behavior.pageChange();
      behavior.pv();
      for (const start of Object.values(performance)) start();
      stability.observerBlankScreen();
    },
    error,
    behavior,
    performance,
    stability,
    report: core.report,
    replay: core.replay,
  };

  return monitor;
};

export type Monitor = ReturnType<typeof createMonitor>;

export * from './types';
export * from './report';

// Keep the previous default export usable for existing integrations.
export default {
  install,
  performance: performanceCollectors,
  error: errorCollectors,
  behavior: behaviorCollectors,
  stability: stabilityCollectors,
  init,
  report,
};
