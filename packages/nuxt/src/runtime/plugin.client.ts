import { defineNuxtPlugin } from 'nuxt/app'
import type { Plugin } from 'nuxt/app'
import { createMonitor } from '@weils-monitor/vue'
import type { Monitor } from '@weils-monitor/vue'
import type { NuxtMonitorOptions } from '../types'
import { wireNuxtMonitoring } from './wire'

declare module 'nuxt/app' {
  interface NuxtApp {
    $monitor?: Monitor
  }
}

const plugin: Plugin<{ monitor: Monitor }> = defineNuxtPlugin((nuxtApp) => {
  if (typeof window === 'undefined') return

  const options = nuxtApp.$config.public.weilsMonitor as NuxtMonitorOptions | undefined
  if (!options?.url || !options.appId) return

  const {
    clickAttributes = [],
    hydration = true,
    ssr = true,
    frameworkErrors = true,
    ...monitorOptions
  } = options

  const monitor = createMonitor(monitorOptions)
  for (const attribute of clickAttributes) monitor.addClickHandler(attribute)
  nuxtApp.vueApp.use(monitor)

  // 必须在 use(monitor) 之后接入：框架错误采集依赖 Vue 子包已安装的 errorHandler。
  wireNuxtMonitoring(nuxtApp, monitor, { hydration, ssr, frameworkErrors })

  monitor.observer()

  return { provide: { monitor } }
})

export default plugin
