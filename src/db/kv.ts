// A tiny async key-value store. The app keeps two of them in IndexedDB: one holds the SQLite
// database file, the other holds image files (photos, gift pictures, child photos).

export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Resolves once the write is committed to disk, not just accepted. */
function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("IndexedDB write aborted"));
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const DB_NAME = "frame-puzzle";
const STORES = ["db", "files"] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;
function openIdb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return opening;
}

export function idbKV(store: StoreName): KV {
  const tx = async (mode: IDBTransactionMode) => (await openIdb()).transaction(store, mode).objectStore(store);
  return {
    async get<T>(key: string) {
      return (await req((await tx("readonly")).get(key))) as T | undefined;
    },
    async put(key, value) {
      const s = await tx("readwrite");
      s.put(value, key);
      await done(s.transaction);
    },
    async del(key) {
      const s = await tx("readwrite");
      s.delete(key);
      await done(s.transaction);
    },
    async keys() {
      return (await req((await tx("readonly")).getAllKeys())).map(String);
    }
  };
}

export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return m.get(key) as T | undefined;
    },
    async put(key, value) {
      m.set(key, value);
    },
    async del(key) {
      m.delete(key);
    },
    async keys() {
      return [...m.keys()];
    }
  };
}
