import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.', testMatch: '*.e2e.ts', timeout: 45_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5188', headless: true },
  webServer: { command: 'pnpm exec vite --config test/vite.config.ts', url: 'http://127.0.0.1:5188/fixture.html', reuseExistingServer: false },
})
