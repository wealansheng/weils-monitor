<template>
  <view class="page">
    <text class="title">详情页</text>
    <text class="hint">进入本页会触发 route_change 与 page_view，返回时同样会记录。</text>
    <button class="action" @click="onBack">返回上一页</button>
  </view>
</template>

<script setup>
const onBack = () => {
  uni.navigateBack()
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
  background: #ffffff;
  color: #1f2329;
  border-radius: 16rpx;
}
</style>
