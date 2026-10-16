import { addPlugin, addServerPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import type { ModuleOptions } from './types'

export type { ModuleOptions, NuxtMonitorOptions } from './types'

const monitorModule: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@weils-monitor/nuxt',
    configKey: 'cyMonitor',
  },
  defaults: {
    url: '',
    appId: '',
    hydration: true,
    ssr: true,
    frameworkErrors: true,
  },
  setup(options, nuxt) {
    nuxt.options.runtimeConfig.public.weilsMonitor = options

    const resolver = createResolver(import.meta.url)
    addPlugin({ src: resolver.resolve('./runtime/plugin.client'), mode: 'client' })

    // 服务端只在需要时注入：它仅负责把渲染耗时写进 Server-Timing 响应头。
    if (options.ssr !== false && nuxt.options.ssr !== false) {
      addServerPlugin(resolver.resolve('./runtime/server/plugin'))
    }
  },
})

export default monitorModule
