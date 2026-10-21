import { test, expect } from '@playwright/test'

test('does not recover another live tab when background throttling expires its heartbeat', async ({ context }) => {
  const a = await context.newPage(); const b = await context.newPage()
  await a.goto('/fixture.html'); await a.waitForFunction(() => typeof (window as any).begin === 'function')
  await a.evaluate(() => (window as any).begin({ afterErrorMs: 60_000, persistIntervalMs: 60_000 }))
  await a.evaluate(() => (window as any).recorder.capture('83333333-3333-4333-8333-333333333333'))
  await b.goto('/fixture.html'); await b.waitForFunction(() => typeof (window as any).begin === 'function')
  await b.evaluate(async () => {
    const db: IDBDatabase = await new Promise(resolve => { const req = indexedDB.open('weils-monitor-replay-v1'); req.onsuccess = () => resolve(req.result) })
    await new Promise<void>(resolve => {
      const tx = db.transaction('entries', 'readwrite'); const store = tx.objectStore('entries'); const req = store.getAll()
      req.onsuccess = () => req.result.forEach(row => { row.leaseUntil = 0; store.put(row) }); tx.oncomplete = () => resolve()
    }); db.close()
    await (window as any).begin()
  })
  const result = await b.evaluate(async () => {
    const db: IDBDatabase = await new Promise(resolve => { const req = indexedDB.open('weils-monitor-replay-v1'); req.onsuccess = () => resolve(req.result) })
    const rows: any[] = await new Promise(resolve => { const req = db.transaction('entries').objectStore('entries').getAll(); req.onsuccess = () => resolve(req.result) }); db.close()
    return { uploads: rows.filter(row => row.kind === 'upload').length, triggered: rows.filter(row => row.kind === 'state' && row.data.capture).length }
  })
  expect(result).toEqual({ uploads: 0, triggered: 1 })
})
