#!/usr/bin/env node
/**
 * 校验各 package 的入口声明（main / module / types / exports）指向真实存在的构建产物。
 * 用于防止 `tsup` 产物扩展名与 package.json 声明不一致导致的“找不到模块”。
 *
 * 用法：pnpm build && pnpm run verify:exports
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @returns {string[]} */
function collectEntryPaths(pkg) {
  const entries = new Set()
  for (const field of ['main', 'module', 'types']) {
    if (typeof pkg[field] === 'string') entries.add(pkg[field])
  }
  for (const value of Object.values(pkg.exports ?? {})) {
    if (typeof value === 'string') entries.add(value)
    else if (value && typeof value === 'object') {
      for (const nested of Object.values(value)) {
        if (typeof nested === 'string') entries.add(nested)
      }
    }
  }
  return [...entries]
}

const packagesDir = join(root, 'packages')
const problems = []
let checked = 0

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgDir = join(packagesDir, entry.name)
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) continue

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  const entries = collectEntryPaths(pkg)
  if (entries.length === 0) {
    problems.push(`${pkg.name}: package.json 未声明任何入口`)
    continue
  }

  for (const relPath of entries) {
    const absPath = resolve(pkgDir, relPath)
    if (!existsSync(absPath)) {
      problems.push(`${pkg.name}: ${relPath} 不存在（是否忘记 build？）`)
    }
  }
  checked += 1
}

if (problems.length > 0) {
  console.error('✗ 入口声明校验失败：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(`✓ ${checked} 个 package 的入口声明均指向已存在的产物`)
