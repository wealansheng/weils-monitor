export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.$monitor?.addClickHandler('plugin-action')
})
