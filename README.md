# weils-monitor

前端监控 SDK 的 pnpm monorepo，包含公共类型、工具函数、core 运行时以及 Vue / Nuxt 适配层。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `packages/shared` | 跨端共享的类型与常量（`@weils-monitor/shared`） |
| `packages/utils` | 通用工具函数（`@weils-monitor/utils`） |
| `packages/core` | 浏览器采集器、事件上报流水线与启动注册表（`@weils-monitor/core`） |
| `packages/vue` | Vue 3 插件（`@weils-monitor/vue`） |
| `packages/nuxt` | Nuxt 3 / Nuxt 4 模块（`@weils-monitor/nuxt`） |
| `example/vue` | `@weils-monitor/vue` 的 Vue 3 + Vite 交互演示 |
| `example/nuxt` | `@weils-monitor/nuxt` 的 Nuxt 4 交互演示（使用 Nuxt 4 的 `app/` 目录结构） |
| `scripts/` | 仓库维护脚本（清理产物、校验入口声明） |

## 环境要求

- Node.js `^22.22.3 || ^24.15.0 || >=26.0.0`（与当前锁定的 Nuxt 4 要求一致；`packages/*` 本身仍可在 Node 20 上运行）
- pnpm 9（根 `package.json` 的 `packageManager` 已锁定为 `pnpm@9.0.0`，新版 pnpm 会自动切换到该版本）

## 常用命令

```bash
pnpm install          # 安装 workspace 依赖
pnpm dev              # 监听全部 packages（不启动 example）
pnpm dev:vue          # 监听 Vue 包并启动 Vue 示例
pnpm dev:nuxt         # 构建依赖、监听 Nuxt 包并启动 Nuxt 示例
pnpm dev:core         # 仅监听 core 包
pnpm typecheck        # 全量类型检查（packages 用 tsc，Nuxt 示例用 nuxt typecheck）
pnpm build            # 构建全部 package（tsup）
pnpm verify:exports   # 校验 package.json 入口声明指向真实产物
pnpm smoke:core       # core 工厂、适配器、装饰器与策略冒烟验证
pnpm smoke:timing     # Vue 采集器冒烟验证
pnpm smoke:resource   # resource 阈值过滤冒烟验证
pnpm smoke:nuxt       # Nuxt 专属采集冒烟验证（水合 / SSR / 框架错误）
pnpm clean            # 清理各 package 的 dist
pnpm changeset        # 生成变更记录
pnpm version-packages # 依据 changeset 升级版本号
pnpm release          # 构建、校验并发布尚未发布的新版本
```

## 分层与扩展

`@weils-monitor/core` 负责通用浏览器指标、错误、点击与空白屏采集，以及事件规范化和批量上报。`createReporter(adapter, strategy, decorators)` 使用工厂方法创建上报器：适配器提供页面上下文、事件通知和退出钩子；策略决定事件如何入队及冲刷；装饰器依次规范化事件并通知订阅方。默认实现使用浏览器适配器和批量上报策略。`createCollectorRegistry()` 为采集策略提供按名称启动一次及统一停止的能力。

Vue 包实现组件耗时、路由切换和插件安装；Nuxt 包在 Vue 适配层之上实现水合、SSR 和框架错误采集。`@weils-monitor/vue` 原有的 `createMonitor`、`report` 等入口继续可用。

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

### 资源性能事件

`observerEntries()` 采集 `metric_name: "resource"`，默认只上报 `duration >= 100ms` 的资源，阈值由 `resourceDurationThreshold`（毫秒）配置，设为 `0` 表示不过滤、全量上报。

开发服务器的 Vite 会为每个模块单独发一次请求，一次页面加载可能产生数百条 resource timing（实测 dev 下 250 条，缓存命中的刷新几乎全部低于 100ms）；生产环境同一个页面通常只有十几条。默认阈值用于避免这种噪声打满队列与存储，同时保留真正慢的资源——`metric_name: "resource"` 事件数的构成可直接用「按 `metric_name` 分组统计」核对。

## Nuxt 接入（Nuxt 3 / Nuxt 4）

模块同时支持 Nuxt 3 与 Nuxt 4（`peerDependencies.nuxt` 为 `^3.0.0 || ^4.0.0`，`@nuxt/kit` 同样放宽到 `^3.0.0 || ^4.0.0`，安装时会与宿主 Nuxt 去重到同一份）。示例使用 Nuxt 4，因此页面、插件与资源放在 `app/` 目录下：

```txt
example/nuxt/
├─ app/
│  ├─ app.vue
│  ├─ assets/main.css
│  ├─ pages/{index,details,ssr-error}.vue
│  └─ plugins/custom-monitor.client.ts
├─ server/api/monitor.post.ts
├─ nuxt.config.ts
└─ tsconfig.json          # Nuxt 4 的项目引用（files: [] + references）
```

Nuxt 4 会在 `app/` 非空时自动把 `srcDir` 指向它（见 `@nuxt/schema` 的 `srcDir` 解析），因此 `~/assets/...`、`~/pages` 等别名无需额外配置。

在 `nuxt.config.ts` 中配置与 Vue 子包相同的监控参数：

```ts
export default defineNuxtConfig({
  modules: ['@weils-monitor/nuxt'],
  cyMonitor: {
    url: '/api/monitor',
    appId: 'my-nuxt-app',
    projectName: 'my-nuxt-app',
    clickAttributes: ['custom-data'],
    hydration: true,
    ssr: true,
    frameworkErrors: true,
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
示例的 `app/plugins/custom-monitor.client.ts` 还演示了在自定义 Nuxt 插件中追加点击属性；它用 `useNuxtApp()` 而不是插件回调参数取 `$monitor`，因为在 Nuxt 3 上回调参数是内部未导出的 `_NuxtApp`（对公开 `NuxtApp` 的增强在那里不可见），而 `useNuxtApp()` 在 Nuxt 3 / 4 上都返回公开 `NuxtApp`。

### Nuxt 专属采集

模块的客户端插件额外接入三项能力，默认全部开启，可用同名开关单独关闭：

| 开关 | 默认 | 采集内容 |
| --- | --- | --- |
| `hydration` | `true` | 水合耗时 |
| `ssr` | `true` | 服务端渲染耗时 |
| `frameworkErrors` | `true` | Nuxt 框架错误 |

| 上报 | 触发时机与说明 |
| --- | --- |
| `metric_name: "nuxt_hydration"` | `app:beforeMount` → `app:mounted`，Vue 把服务端 HTML 水合成可交互应用的耗时 |
| `metric_name: "nuxt_hydration_complete"` | `app:beforeMount` → `app:suspense:resolve`，额外包含 Suspense 与 `useAsyncData` 等异步数据就绪 |
| `metric_name: "nuxt_ssr_render"` | 服务端在 HTML 响应写入 `Server-Timing: nuxt_ssr;dur=…`，客户端读取 Navigation Timing 后上报 |
| `error_type: "nuxt_error"` | `app:error`：`createError`、`useAsyncData`/`useFetch`、中间件、插件与挂载错误；`status_code` 取自 `error.statusCode` |
| `error_type: "nuxt_chunk_error"` | `app:chunkError`：动态导入的分块加载失败，`resource_type` 为 `chunk` |
| `error_type: "nuxt_ssr_error"` | 服务端渲染失败后，客户端启动时从 `payload.error` 补报 |
| `action: "nuxt_error_cleared"` | `app:error:cleared`，错误页被清除，`event_type` 为 `behavior` |

- 两个水合指标只在服务端渲染过的页面上产生；纯 SPA 首屏是全新挂载，没有水合过程。
- 服务端只在 HTML 响应里写 `Server-Timing`，由客户端负责上报：SDK 的上报通道（XHR / sendBeacon / Image）只在浏览器可用。浏览器不支持 `PerformanceServerTiming` 时会跳过该指标。
- Vue 组件错误不会重复上报：`@weils-monitor/vue` 安装时已把组件错误上报为 `framework_error`，Nuxt 默认 `errorHandler` 随后触发的 `app:error` 会被自动去重。
- 水合与 SSR 指标的阈值：水合 200ms/500ms（对齐 INP），服务端渲染 300ms/1000ms，用于 `rating` 字段。

运行 `pnpm dev:nuxt` 后打开 `http://localhost:3000`（示例运行在 Nuxt 4 上），可触发 JavaScript 错误、Promise 拒绝、资源失败、普通点击、自定义点击、自定义事件和 Nuxt 应用错误，也可在首页与详情页之间切换以查看 `route_change`。浏览器向示例的 `/api/monitor` 发送 POST，再由 Nuxt 服务端转发到 `http://localhost:8888/api/v1/monitor`，无需后端开启跨域访问。达到 20 条、严重错误或页面退出时会发送队列中的事件。

每次整页加载都会自动产生 `nuxt_hydration`、`nuxt_hydration_complete` 与 `nuxt_ssr_render`。示例另外提供「Nuxt 应用错误」「清除错误状态」按钮和 `/ssr-error` 页面，分别演示 `nuxt_error`、`nuxt_error_cleared` 与 `nuxt_ssr_error`；`/ssr-error` 必须整页加载（示例按钮用 `window.location` 跳转），客户端路由跳转不经过服务端渲染。`nuxt_chunk_error` 只在动态导入真正失败时出现，示例未提供按钮：Nuxt 自身的 `app:chunkError` 处理会重新加载页面。

## 构建约定

- 每个 package 由 `tsup` 打包，ESM 产物为 `dist/index.mjs`，CJS 产物为 `dist/index.cjs`，类型声明为 `dist/index.d.ts`（`packages/nuxt` 没有 `index` 入口：`main`/`types` 指向 `dist/module.mjs` / `dist/module.d.ts`，运行时入口为 `dist/runtime/plugin.client.mjs`、`dist/runtime/server/plugin.mjs` 与 `dist/runtime/{wire,hydration,ssr,errors}.mjs`，由模块通过文件路径注入，不经过 `exports`）。
- `package.json` 的 `main` / `module` / `types` / `exports` 必须与上述产物一致，改动 `tsup.config.ts` 的 `outExtension` 或入口后请执行 `pnpm build && pnpm verify:exports`。
- 类型检查统一继承根目录的 `tsconfig.base.json`：其中 `paths` 直接指向各 package 的 `src`，因此 `pnpm typecheck` 无需先构建即可通过。
- 各 package 的 `tsconfig.json` 只做类型检查（`noEmit`），不做产物输出。
- `example/nuxt` 用 Nuxt 4 的项目引用 tsconfig（`"files": []` + 四个 `references`），`nuxt typecheck` 会以 `vue-tsc -b` 同时检查 app 与 server 项目；vue-tsc 会打印一条 `Resolve plugin path failed: vue-router/volar/sfc-route-blocks` 的告警，这是 Nuxt 4 生成的 `vueCompilerOptions.plugins` 与 pnpm 严格链接布局之间的上游问题，不影响退出码。

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
