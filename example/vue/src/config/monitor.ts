import { createMonitor } from '@weils-monitor/vue';

export const monitor = createMonitor({
  url: '/api/v1/monitor',
  projectName: 'weils-monitor-example',
  appId: 'vue-example',
  release: import.meta.env.VITE_MONITOR_RELEASE || 'local',
  userId: 'visitor',
  isImageUpload: false,
  batchSize: 20,
  maxBatchBytes: 50 * 1024,
  sampleRate: 1,
  replay: {
    // 示例默认开启；设置 VITE_MONITOR_REPLAY=false 可关闭录制。
    enabled: import.meta.env.VITE_MONITOR_REPLAY !== 'false',
    url: '/api/v1/records',
    sampleRate: 1,
    beforeErrorMs: 10_000,
    afterErrorMs: 5_000,
    blockSelector: '.reports-panel',
    onStatus: (status) => console.info('[replay]', status),
  },
  // SDK dispatches weils-monitor:report for every event; debug also logs it.
  debug: false,
});

monitor.addClickHandler('mask-close')
  .addClickHandler('mask-open')
  .addClickHandler('custom-data');
