<template>
  <view class="page">
    <text class="title">weils-monitor · uni-app / mp-weixin</text>
    <text class="hint">点击下方按钮，在控制台与 Network 面板观察事件。</text>

    <button class="action" @click="onTrack">手动行为埋点</button>
    <button class="action" @click="onNavigate">navigateTo 跳转详情页</button>
    <button class="action" @click="onRequest">发起 uni.request</button>
    <button class="action" @click="onError">触发 JS 错误</button>
    <button class="action" @click="onReject">触发 Promise 错误</button>
  </view>
</template>

<script setup>
import { demoRequestUrl, monitor } from '../../config/monitor'

const onTrack = () => {
  monitor.behavior.track('example_click', { page: 'index' })
}

const onNavigate = () => {
  uni.navigateTo({ url: '/pages/detail/detail?from=index' })
}

const onRequest = () => {
  uni.request({
    url: demoRequestUrl,
    method: 'GET',
    complete: (res) => console.log('[example request]', res),
  })
}

const onError = () => {
  throw new Error('example js error')
}

const onReject = () => {
  Promise.reject(new Error('example promise error'))
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 48rpx 40rpx;
  background: #f5f6f8;
  box-sizing: border-box;
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 600;
  color: #1f2329;
}

.hint {
  display: block;
  margin: 20rpx 0 40rpx;
  font-size: 26rpx;
  color: #646a73;
}

.action {
  margin-bottom: 24rpx;
  background: #ffffff;
  color: #1f2329;
  border-radius: 16rpx;
}
</style>
