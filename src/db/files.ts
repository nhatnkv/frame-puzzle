import type { KV } from "./kv";

// Image files (JPEG bytes) live in their own store. Keys are never reused: editing a picture
// writes a new file, so a redeemed gift keeps showing the picture it had when it was redeemed.

export interface StoredFile {
  type: string;
  bytes: ArrayBuffer;
}

/** When a key was made, from the timestamp inside it. */
function createdAt(key: string): number {
  const t = parseInt(key.split("-")[1] ?? "", 36);
  return Number.isFinite(t) ? t : 0;
}

export class FileStore {
  private urls = new Map<string, string>();

  constructor(private readonly kv: KV) {}

  async put(bytes: ArrayBuffer | Uint8Array, type = "image/jpeg"): Promise<string> {
    const key = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const copy = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes.slice(0);
    await this.kv.put(key, { type, bytes: copy } satisfies StoredFile);
    return key;
  }

  async get(key: string): Promise<StoredFile | undefined> {
    return this.kv.get<StoredFile>(key);
  }

  /** An object URL for <img src>, cached until the file is deleted. */
  async url(key: string): Promise<string | null> {
    const cached = this.urls.get(key);
    if (cached) return cached;
    const f = await this.get(key);
    if (!f) return null;
    const u = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
    this.urls.set(key, u);
    return u;
  }

  async del(key: string): Promise<void> {
    const u = this.urls.get(key);
    if (u) {
      URL.revokeObjectURL(u);
      this.urls.delete(key);
    }
    await this.kv.del(key);
  }

  /**
   * Deletes every file that no database row points to any more (an edited photo's old file, a
   * deleted child's photo). Files written after the sweep started are left alone, because their
   * row may not be saved yet.
   */
  async sweep(referenced: () => Set<string>): Promise<number> {
    const started = Date.now();
    const keys = await this.kv.keys();
    const refs = referenced();
    let removed = 0;
    for (const key of keys) {
      if (refs.has(key) || createdAt(key) >= started) continue;
      await this.del(key);
      removed++;
    }
    return removed;
  }
}
