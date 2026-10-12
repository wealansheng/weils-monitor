import { defineNuxtModule } from '@nuxt/kit'
import type { MonitorOptions } from '@cy-monitor/shared'

export type ModuleOptions = MonitorOptions

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@cy-monitor/nuxt',
    configKey: 'cyMonitor',
  },
  defaults: {
    dsn: '',
  },
  setup(_options, _nuxt) {
    // TODO
  },
})
