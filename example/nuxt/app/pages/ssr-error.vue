<script setup lang="ts">
// 该页面在服务端渲染时抛错，用于演示 @weils-monitor/nuxt 的 nuxt_ssr_error 采集。
// 必须整页加载（例如 app.vue 里的「SSR 渲染错误」按钮走 window.location），
// 客户端路由跳转不会经过服务端渲染，只会走客户端的 app:error / framework_error。
if (import.meta.server) {
  throw createError({
    statusCode: 500,
    statusMessage: 'SSR 演示错误',
    message: 'Nuxt 示例：服务端渲染失败，用于验证 nuxt_ssr_error 上报',
    fatal: true,
  })
}
</script>

<template>
  <section class="route-panel">
    <p class="route-label">SSR 错误演示 /ssr-error</p>
    <h2>服务端渲染失败</h2>
    <p>正常情况下这个页面不会被渲染：服务端渲染阶段抛出的错误会由客户端补报为 <code>nuxt_ssr_error</code>。</p>
  </section>
</template>
