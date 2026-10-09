import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import type { KV } from "./kv";
import { MIGRATIONS } from "./schema";

export type Params = SqlValue[];

const DB_KEY = "sqlite";

/**
 * The app's SQLite database (sql.js, in memory) with its file saved to a key-value store.
 * Writes schedule a save a moment later; `flush()` saves right away (used when the app is hidden).
 */
export class AppDb {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private writeListeners: Array<() => void> = [];

  private constructor(
    private readonly sql: Database,
    private readonly kv: KV,
    private readonly saveDelay: number
  ) {}

  static async open(SQL: SqlJsStatic, kv: KV, opts: { saveDelay?: number } = {}): Promise<AppDb> {
    const bytes = await kv.get<Uint8Array | ArrayBuffer>(DB_KEY);
    let sql: Database;
    try {
      sql = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
      sql.exec("PRAGMA user_version"); // sql.js only notices a damaged file on the first query
    } catch {
      // A damaged file should not lock the child out of the app: keep a copy of it, start over.
      if (bytes) await kv.put(`${DB_KEY}-damaged-${Date.now()}`, bytes);
      sql = new SQL.Database();
    }
    const db = new AppDb(sql, kv, opts.saveDelay ?? 300);
    db.enableForeignKeys();
    const migrated = db.migrate();
    if (migrated || !bytes) await db.flush();
    return db;
  }

  get version(): number {
    return Number(this.sql.exec("PRAGMA user_version")[0].values[0][0]);
  }

  all<T>(query: string, params: Params = []): T[] {
    const st = this.sql.prepare(query);
    try {
      st.bind(params);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      return out;
    } finally {
      st.free();
    }
  }

  one<T>(query: string, params: Params = []): T | null {
    return this.all<T>(query, params)[0] ?? null;
  }

  value<T extends SqlValue>(query: string, params: Params = []): T {
    const st = this.sql.prepare(query);
    try {
      st.bind(params);
      if (!st.step()) throw new Error(`No row for: ${query}`);
      return st.get()[0] as T;
    } finally {
      st.free();
    }
  }

  /** Runs a write and schedules a save. Returns the new row id for INSERTs. */
  run(query: string, params: Params = []): number {
    this.sql.run(query, params);
    this.scheduleSave();
    return Number(this.sql.exec("SELECT last_insert_rowid()")[0].values[0][0]);
  }

  /** Runs several writes atomically. */
  transaction<T>(fn: () => T): T {
    this.sql.run("BEGIN");
    try {
      const result = fn();
      this.sql.run("COMMIT");
      this.scheduleSave();
      return result;
    } catch (e) {
      this.sql.run("ROLLBACK");
      throw e;
    }
  }

  /** Calls `fn` after every write. */
  onWrite(fn: () => void): void {
    this.writeListeners.push(fn);
  }

  /**
   * Runs `fn` in one transaction with foreign keys off and the sync triggers quiet: used to apply
   * rows that came from the family's other devices, which may arrive in any order.
   */
  applyRemote<T>(fn: () => T): T {
    this.sql.run("PRAGMA foreign_keys = OFF");
    try {
      return this.transaction(() => {
        this.sql.run("UPDATE sync_flag SET applying = 1");
        const result = fn();
        this.sql.run("UPDATE sync_flag SET applying = 0");
        return result;
      });
    } finally {
      this.enableForeignKeys();
    }
  }

  /** Keeps a copy of the database file under its own key, e.g. before it is replaced. */
  async backup(label: string): Promise<void> {
    const bytes = this.sql.export();
    this.enableForeignKeys();
    await this.kv.put(`${DB_KEY}-${label}-${Date.now()}`, bytes);
  }

  scheduleSave(): void {
    for (const fn of this.writeListeners) fn();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), this.saveDelay);
  }

  /** Saves the database file now. Saves never overlap, so the last write always wins. */
  flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const bytes = this.sql.export();
    // export() closes and reopens the connection, which resets this pragma.
    this.enableForeignKeys();
    this.saving = this.saving.then(() => this.kv.put(DB_KEY, bytes)).catch((e) => console.error("Saving failed", e));
    return this.saving;
  }

  private enableForeignKeys(): void {
    this.sql.run("PRAGMA foreign_keys = ON");
  }

  private migrate(): boolean {
    const from = this.version;
    for (let v = from; v < MIGRATIONS.length; v++) {
      this.sql.run("BEGIN");
      try {
        for (const stmt of MIGRATIONS[v]) this.sql.run(stmt);
        this.sql.run(`PRAGMA user_version = ${v + 1}`);
        this.sql.run("COMMIT");
      } catch (e) {
        this.sql.run("ROLLBACK");
        throw e;
      }
    }
    return from < MIGRATIONS.length;
  }
}

export function now(): string {
  return new Date().toISOString();
}
