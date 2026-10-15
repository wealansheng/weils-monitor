import { addPlugin, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'
import type { InitOptions } from '@weils-monitor/shared'

export interface ModuleOptions extends InitOptions {
  /** Attributes whose values are reported as custom click actions. */
  clickAttributes?: string[]
}

const monitorModule: NuxtModule<ModuleOptions, ModuleOptions, false> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@weils-monitor/nuxt',
    configKey: 'cyMonitor',
  },
  defaults: {
    url: '',
    appId: '',
  },
  setup(options, nuxt) {
    nuxt.options.runtimeConfig.public.weilsMonitor = options

    const resolver = createResolver(import.meta.url)
    addPlugin({ src: resolver.resolve('./runtime/plugin.client'), mode: 'client' })
  },
})

export default monitorModule
