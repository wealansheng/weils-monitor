import { copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
copyFileSync(require.resolve('@rrweb/replay/dist/style.css'), new URL('../dist/style.css', import.meta.url))
