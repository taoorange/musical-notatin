interface SoundfontCacheRecord {
  url: string
  data: ArrayBuffer
  size: number
  updatedAt: number
}

const DB_NAME = 'five-line-staff-soundfont-cache'
const DB_VERSION = 1
const STORE_NAME = 'soundfonts'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const request = action(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function getCachedSoundfont(url: string): Promise<ArrayBuffer | null> {
  if (!url) return null
  try {
    const record = await withStore<SoundfontCacheRecord | undefined>('readonly', (store) =>
      store.get(url),
    )
    return record?.data ?? null
  } catch {
    return null
  }
}

export async function putCachedSoundfont(url: string, data: ArrayBuffer): Promise<void> {
  if (!url || !(data instanceof ArrayBuffer) || data.byteLength === 0) return
  const payload: SoundfontCacheRecord = {
    url,
    data,
    size: data.byteLength,
    updatedAt: Date.now(),
  }
  try {
    await withStore<IDBValidKey>('readwrite', (store) => store.put(payload))
  } catch {
    // 缓存失败不阻断播放
  }
}

