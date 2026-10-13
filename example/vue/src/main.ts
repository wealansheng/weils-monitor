import { createApp } from 'vue';
import WeilsMonitor from '@weils-monitor/vue';
import '@fontsource/zcool-xiaowei/400.css';
import App from './App.vue';
import './style.css';

const originalConsoleLog = console.log.bind(console);

console.log = (...args: unknown[]): void => {
  originalConsoleLog(...args);

  const report = args.find(
    (value): value is Record<string, unknown> =>
      typeof value === 'object' && value !== null && 'type' in value && 'subType' in value,
  );

  if (report) {
    window.dispatchEvent(new CustomEvent('weils-monitor:report', { detail: report }));
  }
};

const app = createApp(App);

app.config.errorHandler = (error, _instance, info): void => {
  originalConsoleLog('[example] Vue 捕获到错误', { error, info });
};

app.use(WeilsMonitor, {
  url: '/monitor/report',
  projectName: 'weils-monitor-example',
  appId: 'vue-example',
  userId: 'visitor',
  isImageUpload: false,
  batchSize: 10,
});

WeilsMonitor.error.error();
WeilsMonitor.behavior.click();
WeilsMonitor.behavior.pageChange();
WeilsMonitor.behavior.pv();
WeilsMonitor.performance.observerEntries();
WeilsMonitor.performance.observerFCP();
WeilsMonitor.performance.observerPaint();
WeilsMonitor.performance.observerLCP();
WeilsMonitor.performance.observerLoad();

app.mount('#app');
