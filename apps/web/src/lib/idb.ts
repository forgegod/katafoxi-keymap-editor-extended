/**
 * Shared IndexedDB open / request / transaction helpers.
 * Draft and host-layout stores each keep their own DB name, version, and schema.
 */

export type OpenDbOptions = {
  name: string
  version: number
  upgrade?: (db: IDBDatabase, event: IDBVersionChangeEvent) => void
  /** Runs after a successful open (e.g. legacy migration) before the promise resolves. */
  afterOpen?: (db: IDBDatabase) => Promise<void>
}

export function openDb(options: OpenDbOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(options.name, options.version)
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'))
    request.onsuccess = () => {
      const db = request.result
      if (!options.afterOpen) {
        resolve(db)
        return
      }
      void options.afterOpen(db).then(() => resolve(db), reject)
    }
    if (options.upgrade) {
      request.onupgradeneeded = event => {
        options.upgrade!(request.result, event)
      }
    }
  })
}

export function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IDB request failed'))
  })
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'))
  })
}
