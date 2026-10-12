#!/usr/bin/env node
/**
 * 跨平台清理脚本（等价于 `pnpm -r exec rm -rf dist node_modules/.cache`）。
 * Windows 的 PowerShell / cmd 没有 `rm -rf`，因此用 Node 实现。
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targets = ['dist', join('node_modules', '.cache')]

const packageDirs = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'packages', entry.name))

let removed = 0

for (const dir of [...packageDirs, root]) {
  for (const target of targets) {
    const fullPath = join(dir, target)
    if (!statSync(fullPath, { throwIfNoEntry: false })?.isDirectory()) continue
    rmSync(fullPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    removed += 1
    console.log(`removed ${relative(root, fullPath)}`)
  }
}

console.log(removed === 0 ? 'nothing to clean' : `clean done (${removed} directories)`)
