# weils-monitor

前端监控 SDK 的 pnpm monorepo，包含公共类型、工具函数以及 Vue / Nuxt / uni-app 三个框架适配层。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `packages/shared` | 跨端共享的类型与常量（`@weils-monitor/shared`） |
| `packages/utils` | 通用工具函数（`@weils-monitor/utils`） |
| `packages/vue` | Vue 3 插件（`@weils-monitor/vue`） |
| `packages/nuxt` | Nuxt 3 模块（`@weils-monitor/nuxt`） |
| `packages/uniapp` | uni-app 适配层（`@weils-monitor/uniapp`） |
| `example/vue` | `@weils-monitor/vue` 的 Vue 3 + Vite 交互演示 |
| `example/nuxt` | `@weils-monitor/nuxt` 的 Nuxt 3 交互演示 |
| `scripts/` | 仓库维护脚本（清理产物、校验入口声明） |

## 环境要求

- Node.js ^20.19.0 或 >= 22.12.0（与当前锁定的 Nuxt 版本要求一致）
- pnpm 9（根 `package.json` 的 `packageManager` 已锁定为 `pnpm@9.0.0`，新版 pnpm 会自动切换到该版本）

## 常用命令

```bash
pnpm install          # 安装 workspace 依赖
pnpm dev              # 监听全部 packages（不启动 example）
pnpm dev:vue          # 监听 Vue 包并启动 Vue 示例
pnpm dev:nuxt         # 构建依赖、监听 Nuxt 包并启动 Nuxt 示例
pnpm dev:uniapp       # 仅监听 uni-app 包
pnpm typecheck        # 全量类型检查（tsc --noEmit）
pnpm build            # 构建全部 package（tsup）
pnpm verify:exports   # 校验 package.json 入口声明指向真实产物
pnpm clean            # 清理各 package 的 dist
pnpm changeset        # 生成变更记录
pnpm version-packages # 依据 changeset 升级版本号
pnpm release          # 构建、校验并发布尚未发布的新版本
```

## Vue 耗时采集

在 `app.mount()` **之前**安装监控插件和 Vue Router：

```ts
app.use(router)
app.use(monitor)
app.mount('#app')
monitor.observer()
```

`monitor.observer()` 可以在 `mount()` 之后调用：插件安装时会暂存组件首次挂载耗时和首屏结果，启动后补报。若插件本身在 `mount()` 之后才安装，已发生的挂载无法追溯。路由切换只统计启动监控之后发生的导航。

| 上报字段 | 含义 |
| --- | --- |
| `metric_name: "vue_first_screen"` | 从页面导航起点到 Vue 根组件及同步子组件挂载后的下一次绘制，单位毫秒；不等待异步组件、Suspense 或后续接口数据 |
| `metric_name: "vue_component_mount"` | 单个组件从 `beforeMount` 到 `mounted` 的耗时，`name` 为组件名 |
| `metric_name: "vue_component_update"` | 单个组件从 `beforeUpdate` 到 `updated` 的耗时，`name` 为组件名 |
| `action: "route_change"` | Vue Router 从 SDK 注册的全局 `beforeEach` 到新页面 DOM 更新后的绘制；包含此后执行的异步守卫与异步路由组件。未安装 Vue Router 时，从 History URL 变化开始计时；`duration` 单位毫秒 |

组件耗时是生命周期区间，可能包含子组件工作，不等同于纯渲染函数的 CPU 时间。上述事件使用现有队列发送规则；不足一个批次时会在页面隐藏或退出时发送。

## Nuxt 3 接入

在 `nuxt.config.ts` 中配置与 Vue 子包相同的监控参数：

```ts
export default defineNuxtConfig({
  modules: ['@weils-monitor/nuxt'],
  cyMonitor: {
    url: '/api/monitor',
    appId: 'my-nuxt-app',
    projectName: 'my-nuxt-app',
    clickAttributes: ['custom-data'],
  },
})
```

模块会自动安装 Vue 监控并启动全部采集器。`cyMonitor` 接受 Vue 子包的监控参数；`clickAttributes` 用于把指定 HTML 属性的值作为点击事件的 `action`。运行时插件仅在客户端加载；缺少 `url` 或 `appId` 时不会启动监控。

组件或自定义的 `*.client.ts` 插件可以通过 `useNuxtApp().$monitor` 调用 Vue 子包的 API：

```ts
const { $monitor } = useNuxtApp()
$monitor?.addClickHandler('another-action')
$monitor?.report({
  event_type: 'behavior',
  action: 'custom_event',
  properties: { source: 'nuxt' },
})
```

自定义事件会进入同一上报队列，按批量阈值或页面退出规则发送。服务端渲染期间 `$monitor` 不存在，所以调用时使用可选链。
示例的 `plugins/custom-monitor.client.ts` 还演示了在自定义 Nuxt 插件中追加点击属性。

运行 `pnpm dev:nuxt` 后打开 `http://localhost:3000`，可触发 JavaScript 错误、Promise 拒绝、资源失败、普通点击、自定义点击和自定义事件，也可在首页与详情页之间切换以查看 `route_change`。浏览器向示例的 `/api/monitor` 发送 POST，再由 Nuxt 服务端转发到 `http://localhost:8888/api/v1/monitor`，无需后端开启跨域访问。达到 20 条、严重错误或页面退出时会发送队列中的事件。

## 构建约定

- 每个 package 由 `tsup` 打包，ESM 产物为 `dist/index.mjs`，CJS 产物为 `dist/index.cjs`，类型声明为 `dist/index.d.ts`（`packages/nuxt` 输出 ESM 的 `dist/module.mjs` 和 `dist/runtime/plugin.client.mjs`）。
- `package.json` 的 `main` / `module` / `types` / `exports` 必须与上述产物一致，改动 `tsup.config.ts` 的 `outExtension` 或入口后请执行 `pnpm build && pnpm verify:exports`。
- 类型检查统一继承根目录的 `tsconfig.base.json`：其中 `paths` 直接指向各 package 的 `src`，因此 `pnpm typecheck` 无需先构建即可通过。
- 各 package 的 `tsconfig.json` 只做类型检查（`noEmit`），不做产物输出。

## 发布流程

本仓库使用 Changesets 管理版本和 CHANGELOG。`pnpm release` 只负责构建、校验和发布，不会自动修改 package 版本。

### 1. 创建 changeset

功能或修复完成后执行：

```bash
pnpm changeset
```

选择本次涉及的 package，并按语义化版本规则指定升级级别：

- `patch`：向后兼容的问题修复，例如构建配置或入口修复。
- `minor`：向后兼容的新功能或新导出。
- `major`：存在破坏性 API 或类型变更。

生成的 `.changeset/*.md` 文件需要与代码一起提交。

### 2. 更新版本

准备发布时执行：

```bash
pnpm version-packages
pnpm install
```

该步骤会消费 changeset，更新 package 版本、CHANGELOG、内部依赖版本和锁文件。更新后应检查并提交这些文件。

### 3. 发布

确认 npm 登录状态和发布权限后执行：

```bash
pnpm release
```

发布命令会依次执行 package 构建、入口产物校验和 `changeset publish`。npm 不允许覆盖已经发布的版本，因此发布前必须先完成版本更新。

## 常见问题

- `pnpm install` 报 esbuild `Expected "x.y.z" but got "a.b.c"`（`postinstall` 失败），通常是本地 pnpm store / 虚拟目录链接不完整导致的，执行 `pnpm install --force` 重新链接即可。
- `pnpm release` 提示 `version x.y.z is already published` 或 `No unpublished projects to publish`，说明本地 package 版本与 npm 上已发布版本相同。依次执行 `pnpm changeset`、`pnpm version-packages`、`pnpm install`，提交版本相关文件后再重新发布。
