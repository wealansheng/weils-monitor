export interface Stored {
  key: string
  kind: 'batch' | 'state' | 'upload'
  app: string
  owner: string
  leaseUntil: number
  createdAt: number
  data: unknown
}

/** One object store allows a checkpoint and its batch references to commit atomically. */
export class ReplayStore {
  private db?: IDBDatabase
  private memory = new Map<string, Stored>()
  private fallback = false
  constructor(private onFallback: (message: string) => void, private name = 'weils-monitor-replay-v1') {}
  private degrade(error: unknown): void {
    this.db?.close(); this.db = undefined
    if (!this.fallback) this.onFallback(error instanceof Error ? error.message : String(error))
    this.fallback = true
  }
  async open(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
        const request = indexedDB.open(this.name, 1)
        const timeout = setTimeout(() => reject(new Error('IndexedDB open timed out')), 3000)
        request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'key' })
        request.onsuccess = () => {
          clearTimeout(timeout)
          if (this.fallback) { request.result.close(); return }
          resolve(request.result)
        }
        request.onerror = () => { clearTimeout(timeout); reject(request.error) }
        request.onblocked = () => { clearTimeout(timeout); reject(new Error('IndexedDB upgrade blocked')) }
      })
      this.db.onversionchange = () => this.degrade(new Error('IndexedDB version changed'))
      await this.list()
    } catch (error) { this.degrade(error) }
  }
  async list(): Promise<Stored[]> {
    if (!this.db) return [...this.memory.values()]
    try {
      const rows = await new Promise<Stored[]>((resolve, reject) => {
        const tx = this.db!.transaction('entries', 'readonly')
        const request = tx.objectStore('entries').getAll()
        request.onsuccess = () => resolve(request.result as Stored[])
        request.onerror = () => reject(request.error)
      })
      this.memory = new Map(rows.map(row => [row.key, row]))
      return rows
    } catch (error) { this.degrade(error); return [...this.memory.values()] }
  }
  async commit(entries: Stored[], remove: string[] = []): Promise<void> {
    for (const key of remove) this.memory.delete(key)
    for (const row of entries) this.memory.set(row.key, row)
    if (!this.db) return
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        remove.forEach(key => store.delete(key))
        entries.forEach(row => store.put(row))
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('IndexedDB commit failed'))
      })
    } catch (error) { this.degrade(error) }
  }
  /** Read + conditional write in one transaction prevents two tabs claiming the same task. */
  async claim(key: string, owner: string, duration = 30_000): Promise<Stored | undefined> {
    if (!this.db) {
      const row = this.memory.get(key)
      if (!row || row.owner !== owner && row.leaseUntil > Date.now()) return
      const claimed = { ...row, owner, leaseUntil: Date.now() + duration }
      this.memory.set(key, claimed)
      return claimed
    }
    try {
      return await new Promise<Stored | undefined>((resolve, reject) => {
        const tx = this.db!.transaction('entries', 'readwrite')
        const store = tx.objectStore('entries')
        const request = store.get(key)
        let claimed: Stored | undefined
        request.onsuccess = () => {
          const row = request.result as Stored | undefined
          if (!row || row.owner !== owner && row.leaseUntil > Date.now()) return
          claimed = { ...row, owner, leaseUntil: Date.now() + duration }
          store.put(claimed)
        }
        tx.oncomplete = () => { if (claimed) this.memory.set(key, claimed); resolve(claimed) }
        tx.onerror = tx.onabort = () => reject(tx.error)
      })
    } catch (error) { this.degrade(error); return this.claim(key, owner, duration) }
  }
  close(): void { this.db?.close(); this.db = undefined }
}
