import { createMonitor } from '@weils-monitor/vue';

export const monitor = createMonitor({
  url: '/api/v1/monitor',
  projectName: 'weils-monitor-example',
  appId: 'vue-example',
  userId: 'visitor',
  isImageUpload: false,
  batchSize: 20,
  maxBatchBytes: 50 * 1024,
  sampleRate: 1,
  // SDK dispatches weils-monitor:report for every event; debug also logs it.
  debug: false,
});

monitor.addClickHandler('mask-close')
  .addClickHandler('mask-open')
  .addClickHandler('custom-data');
