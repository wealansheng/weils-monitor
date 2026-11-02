<script>
import { monitor, REPORT_EVENT } from './config/monitor'

export default {
  onLaunch() {
    // 本地调试：观察 SDK 规范化后的事件。
    uni.$on(REPORT_EVENT, (event) => {
      console.log('[monitor]', event.event_type, event.action || event.metric_name || event.error_type)
    })
    // Vue 错误处理器已在 main.js 的 app.use(monitor) 中安装。
    monitor.observer()
  },
}
</script>
