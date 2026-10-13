import { defineNuxtModule } from '@nuxt/kit'
import type { MonitorOptions } from '@weils-monitor/shared'

export type ModuleOptions = MonitorOptions

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@weils-monitor/nuxt',
    configKey: 'cyMonitor',
  },
  defaults: {
    dsn: '',
  },
  setup(_options, _nuxt) {
    // TODO
  },
})
