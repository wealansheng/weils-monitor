# @weils-monitor/core

## 1.3.0

### Minor Changes

- 添加错误录制回放
- Add opt-in lazy-loaded error replay with rrweb, masked input capture, compressed IndexedDB checkpoints, resumable chunk uploads and a separate sandboxed player entry.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @weils-monitor/shared@1.3.0
  - @weils-monitor/utils@1.2.0
  - @weils-monitor/replay@1.1.0

## 1.2.0

### Minor Changes

- Report generated stack frames for browser and framework errors using error-stack-parser, preserve caller-provided locations, and enrich Nitro SSR errors for private source-map symbolication.

### Patch Changes

- 捕获&解析,上报错误堆栈
- Updated dependencies
- Updated dependencies
  - @weils-monitor/shared@1.2.0
  - @weils-monitor/utils@1.1.1

## 1.1.0

### Minor Changes

- 34b86da: Extract framework-independent collectors and the report pipeline into core. Vue and Nuxt now register their framework-specific collectors through the core factory and collector registry. Remove the uniapp package from the workspace.
- 34b86da: add core modules

### Patch Changes

- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [34b86da]
- Updated dependencies [5690cf1]
  - @weils-monitor/shared@1.1.0
  - @weils-monitor/utils@1.1.0
