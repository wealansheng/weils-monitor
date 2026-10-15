import { defineNuxtPlugin } from 'nuxt/app'
import type { Plugin } from 'nuxt/app'
import { createMonitor } from '@weils-monitor/vue'
import type { Monitor } from '@weils-monitor/vue'
import type { ModuleOptions } from '../module'

declare module 'nuxt/app' {
  interface NuxtApp {
    $monitor?: Monitor
  }
}

const plugin: Plugin<{ monitor: Monitor }> = defineNuxtPlugin((nuxtApp) => {
  if (typeof window === 'undefined') return

  const options = nuxtApp.$config.public.weilsMonitor as ModuleOptions | undefined
  if (!options?.url || !options.appId) return

  const { clickAttributes = [], ...monitorOptions } = options
  const monitor = createMonitor(monitorOptions)
  for (const attribute of clickAttributes) monitor.addClickHandler(attribute)
  nuxtApp.vueApp.use(monitor)
  monitor.observer()

  return { provide: { monitor } }
})

export default plugin
