# cy-monitor

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
| `scripts/` | 仓库维护脚本（清理产物、校验入口声明） |

## 环境要求

- Node.js ^20.19.0 或 >= 22.12.0（与当前锁定的 Nuxt 版本要求一致）
- pnpm 9（根 `package.json` 的 `packageManager` 已锁定为 `pnpm@9.0.0`，新版 pnpm 会自动切换到该版本）

## 常用命令

```bash
pnpm install          # 安装 workspace 依赖
pnpm dev              # 监听全部 packages（不启动 example）
pnpm dev:vue          # 监听 Vue 包并启动 Vue 示例
pnpm dev:nuxt         # 仅监听 Nuxt 包
pnpm dev:uniapp       # 仅监听 uni-app 包
pnpm typecheck        # 全量类型检查（tsc --noEmit）
pnpm build            # 构建全部 package（tsup）
pnpm verify:exports   # 校验 package.json 入口声明指向真实产物
pnpm clean            # 清理各 package 的 dist
pnpm changeset        # 生成变更记录
pnpm version-packages # 依据 changeset 升级版本号
```

## 构建约定

- 每个 package 由 `tsup` 打包，ESM 产物为 `dist/index.mjs`，CJS 产物为 `dist/index.cjs`，类型声明为 `dist/index.d.ts`（`packages/nuxt` 仅输出 ESM 的 `dist/module.mjs`）。
- `package.json` 的 `main` / `module` / `types` / `exports` 必须与上述产物一致，改动 `tsup.config.ts` 的 `outExtension` 或入口后请执行 `pnpm build && pnpm verify:exports`。
- 类型检查统一继承根目录的 `tsconfig.base.json`：其中 `paths` 直接指向各 package 的 `src`，因此 `pnpm typecheck` 无需先构建即可通过。
- 各 package 的 `tsconfig.json` 只做类型检查（`noEmit`），不做产物输出。

## 常见问题

- `pnpm install` 报 esbuild `Expected "x.y.z" but got "a.b.c"`（`postinstall` 失败），通常是本地 pnpm store / 虚拟目录链接不完整导致的，执行 `pnpm install --force` 重新链接即可。
