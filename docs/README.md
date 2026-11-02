# 文档索引

| 文档 | 内容 |
| --- | --- |
| [README](../README.md) | 项目介绍、各包选择、快速开始、开发命令 |
| [uni-app / 微信小程序](uniapp.md) | mp-weixin 接入、事件映射、限制与验收清单 |
| [常见问题与排障](troubleshooting.md) | 8080/8888、数据未上报、IPv6 后端、错误类型、Nuxt 类型缓存 |
| [上报字段协议](字段要求.md) | 批量信封、公共字段、六类事件与小程序指标 |
| [Replay 接入与排障](replay.md) | 录制协议、上传、管理与三项目联调 |
| [Source Map 定位](source-map.md) | 私有 map 上传、错误堆栈还原 |
| [Vue 监控需求记录](新增需求.md) | 历史需求与 Vue `createMonitor` 验收说明 |

各包自己的接入说明：

- [`@weils-monitor/vue`](../packages/vue/README.md)
- [`@weils-monitor/nuxt`](../packages/nuxt/README.md)
- [`@weils-monitor/uniapp`](../packages/uniapp/README.md)
- [`@weils-monitor/core`](../packages/core/README.md)
- [`@weils-monitor/shared`](../packages/shared/README.md)
- [`@weils-monitor/utils`](../packages/utils/README.md)
- [`@weils-monitor/replay`](../packages/replay/README.md)

## 示例

- [`example/vue`](../example/vue/README.md)：Vue 3 + Vite，Replay 录制与上传
- [`example/nuxt`](../example/nuxt/README.md)：Nuxt 4，SSR/水合指标与 Replay
- [`example/uniapp`](../example/uniapp/README.md)：uni-app / 微信小程序，HBuilderX + 微信开发者工具
