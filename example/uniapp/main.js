import { createSSRApp } from 'vue'
import App from './App.vue'
import { monitor } from './config/monitor'

export function createApp() {
  const app = createSSRApp(App)
  // 小程序端同样通过 app.use 安装 Vue 错误处理器（Vue 2 项目使用 Vue.use(monitor)）。
  app.use(monitor)
  return { app }
}
