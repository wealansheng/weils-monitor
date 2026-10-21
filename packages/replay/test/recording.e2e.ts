import { test, expect } from '@playwright/test'

test('records real DOM, inputs, clicks, scroll; masks data before durable storage; plays a single package', async ({ page }) => {
  const chunks: any[] = []
  await page.route('**/api/v1/records', async route => {
    const chunk = route.request().postDataJSON(); chunks.push(chunk)
    await route.fulfill({ json: { ok: true, record_id: chunk.record_id, chunk_index: chunk.chunk_index, chunk_checksum: chunk.chunk_checksum } })
  })
  await page.goto('/fixture.html')
  await page.waitForFunction(() => typeof (window as any).begin === 'function')
  await page.evaluate(() => (window as any).begin())
  await page.locator('#input').fill('input-secret')
  await page.locator('#input').blur()
  await page.locator('#mutate').click()
  await page.mouse.move(180, 200)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(100)
  expect(chunks).toHaveLength(0)
  const local = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => { const req = indexedDB.open('weils-monitor-replay-v1', 1); req.onsuccess = () => resolve(req.result); req.onerror = reject })
    const rows: any[] = await new Promise(resolve => { const req = db.transaction('entries').objectStore('entries').getAll(); req.onsuccess = () => resolve(req.result) }); db.close()
    const events = []
    for (const row of rows.filter(row => row.kind === 'batch')) events.push(...await (window as any).decode(row.data))
    return JSON.stringify(events)
  })
  expect(local).not.toContain('input-secret'); expect(local).not.toContain('password-secret'); expect(local).not.toContain('private-text'); expect(local).not.toContain('blocked-secret')
  await page.evaluate(() => (window as any).recorder.capture('81111111-1111-4111-8111-111111111111'))
  await expect.poll(() => chunks.length).toBe(1)
  expect(chunks[0].chunk_count).toBe(1)
  const result = await page.evaluate(async chunks => {
    const host = document.createElement('div'); document.body.prepend(host)
    const player = await (window as any).createReplayPlayer({ target: host, chunks })
    player.seek(player.duration)
    const frame = host.querySelector('iframe')!
    const content = frame.contentDocument?.body.textContent || ''
    const sandbox = frame.getAttribute('sandbox') || ''
    const value = frame.contentDocument?.querySelector<HTMLInputElement>('#input')?.value
    player.destroy(); return { content, sandbox, value }
  }, chunks)
  expect(result.content).toContain('DOM changed')
  expect(result.value).not.toContain('input-secret')
  expect(result.sandbox).not.toContain('allow-scripts')
})

test('recovers a triggered offline incident after reload and retries when online', async ({ page, context }) => {
  const received: any[] = []
  await page.route('**/api/v1/records', async route => {
    const chunk = route.request().postDataJSON(); received.push(chunk)
    await route.fulfill({ json: { ok: true, record_id: chunk.record_id, chunk_index: chunk.chunk_index, chunk_checksum: chunk.chunk_checksum } })
  })
  await page.goto('/fixture.html'); await page.waitForFunction(() => typeof (window as any).begin === 'function')
  await page.evaluate(() => (window as any).begin({ afterErrorMs: 10_000 }))
  await page.locator('#mutate').click()
  await page.evaluate(() => (window as any).recorder.capture('82222222-2222-4222-8222-222222222222'))
  // Simulate abrupt renderer termination: revoke active leases after navigating away, without stop().
  await page.goto('about:blank'); await page.goto('/fixture.html'); await page.waitForFunction(() => typeof (window as any).begin === 'function')
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise(resolve => { const req = indexedDB.open('weils-monitor-replay-v1', 1); req.onsuccess = () => resolve(req.result) })
    await new Promise<void>(resolve => {
      const tx = db.transaction('entries', 'readwrite'); const store = tx.objectStore('entries'); const req = store.getAll()
      req.onsuccess = () => req.result.forEach(row => { row.leaseUntil = 0; if (row.kind === 'upload') row.data.retryAt = 0; store.put(row) }); tx.oncomplete = () => resolve()
    }); db.close()
  })
  await context.setOffline(true)
  await page.evaluate(() => (window as any).begin())
  await page.waitForTimeout(150)
  await context.setOffline(false)
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise(resolve => { const req = indexedDB.open('weils-monitor-replay-v1', 1); req.onsuccess = () => resolve(req.result) })
    await new Promise<void>(resolve => { const tx = db.transaction('entries', 'readwrite'); const store = tx.objectStore('entries'); const req = store.getAll(); req.onsuccess = () => req.result.filter(row => row.kind === 'upload').forEach(row => { row.data.retryAt = 0; store.put(row) }); tx.oncomplete = () => resolve() }); db.close()
    await (window as any).recorder.flush()
  })
  await expect.poll(() => received.length).toBeGreaterThan(0)
  expect(received[0].errors[0].event_id).toBe('82222222-2222-4222-8222-222222222222')
})
