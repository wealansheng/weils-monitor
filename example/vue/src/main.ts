import { createApp } from 'vue';
import WeilsMonitor from '@weils-monitor/vue';
import '@fontsource/zcool-xiaowei/400.css';
import App from './App.vue';
import './style.css';

const app = createApp(App);

app.config.errorHandler = (error, _instance, info): void => {
  // 演示台只做兜底打印，真正的上报由 @weils-monitor/vue 的 errorHandler 完成。
  console.log('[example] Vue 捕获到错误', { error, info });
};

app.use(WeilsMonitor, {
  url: '/api/v1/monitor',
  projectName: 'weils-monitor-example',
  appId: 'vue-example',
  userId: 'visitor',
  isImageUpload: false,
  batchSize: 20,
  maxBatchBytes: 50 * 1024,
  sampleRate: 1,
  // SDK 会在每条数据入队时打印日志，并派发 weils-monitor:report 事件。
  debug: false,
});

// 先挂载页面，确保演示台已经开始监听 SDK 输出，再启动各类监控。
// Paint / Navigation 等 PerformanceObserver 均启用了 buffered，不会漏掉首屏数据。
app.mount('#app');

WeilsMonitor.error.error();
WeilsMonitor.behavior.click();
WeilsMonitor.behavior.pageChange();
WeilsMonitor.behavior.pv();

WeilsMonitor.performance.observerEntries();
WeilsMonitor.performance.observerFP();
WeilsMonitor.performance.observerFCP();
WeilsMonitor.performance.observerLCP();
WeilsMonitor.performance.observerLoad();
WeilsMonitor.performance.observerCLS();
WeilsMonitor.performance.observerFID();
WeilsMonitor.performance.observerINP();
WeilsMonitor.performance.observeTTFB();
WeilsMonitor.performance.observerLongTask();
WeilsMonitor.stability.observerBlankScreen();

// 达到 20 条、50KB、严重错误或页面退出任一条件即发送批量事件包。
