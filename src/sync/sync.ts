// Sharing with the family: every device keeps the whole database, so the app works without a
// network, and swaps changed rows with the family's copy on the server (Postgres, see
// functions/api/sync.ts) whenever it can. The schema's triggers list changed rows in sync_outbox;
// a sync sends them, then applies every row the server has that this device has not seen yet.

import type { AppDb, Params } from "../db/database";
import type { FileStore } from "../db/files";
import { FILE_KEY_COLUMNS, SYNCED_TABLES, type SyncedTable } from "../db/schema";
import { referencedFiles } from "../data/files";
import { getSetting, setSetting } from "../data/settings";
import type { Change, SyncRequest, SyncResponse } from "../../functions/api/sync";

const CODE = "sync.code";
const REV = "sync.rev";
/** Rows sent in one request; the server takes up to 500. */
const BATCH = 200;
/** Wait this long after a change before sending it, so a burst of taps goes in one request. */
const PUSH_DELAY = 2000;
/** While the app is open, ask for the family's changes this often. */
const POLL = 30_000;

export type SyncState = "off" | "syncing" | "ok" | "offline" | "bad-code";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class FamilyCodeError extends Error {}

/** Where the API is: this site on Cloudflare, or the Cloudflare address from the old GitHub Pages copy. */
export function apiBase(host = globalThis.location?.hostname ?? ""): string {
  return host.endsWith("github.io") ? "https://frame-puzzle.pages.dev/api/" : "/api/";
}

/** The code as people read it: ABCD-EFGH-JKLM. */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

export class Sync {
  state: SyncState;
  lastSynced: Date | null = null;
  private running: Promise<boolean> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** True while rows from the server are being written, which must not schedule another sync. */
  private applying = false;
  private listeners: Array<(changed: boolean) => void> = [];

  constructor(
    private readonly db: AppDb,
    private readonly files: FileStore,
    private readonly fetcher: Fetch = (url, init) => fetch(url, init),
    private readonly base = apiBase()
  ) {
    this.state = this.code ? "offline" : "off";
    db.onWrite(() => this.code && !this.applying && this.pending() > 0 && this.later(PUSH_DELAY));
  }

  get code(): string | null {
    return getSetting(this.db, CODE, "") || null;
  }

  /** Called after each sync (`changed` when rows came from other devices) and when the state changes. */
  onUpdate(fn: (changed: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** Syncs now, every few seconds after a change, every half minute while the app is open, and when the network is back. */
  start(): void {
    void this.now();
    setInterval(() => document.visibilityState === "visible" && void this.now(), POLL);
    window.addEventListener("online", () => void this.now());
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void this.now());
  }

  /** Starts a new family with this device's data. Returns the new code. */
  async create(): Promise<string> {
    const r = await this.fetcher(`${this.base}families`, { method: "POST" });
    if (!r.ok) throw new Error(`Could not start a family (${r.status})`);
    const { code } = (await r.json()) as { code: string };
    this.db.transaction(() => {
      setSetting(this.db, CODE, code);
      setSetting(this.db, REV, "0");
      // Everything made before sharing goes up too, once.
      this.db.run("DELETE FROM sync_outbox");
      for (const t of SYNCED_TABLES) {
        const own = t === "photos" ? " WHERE file_key NOT LIKE 'builtin:%'" : "";
        this.db.run(`INSERT INTO sync_outbox (tbl, row_id) SELECT '${t}', id FROM ${t}${own} ORDER BY id`);
      }
    });
    await this.now();
    return code;
  }

  /**
   * Joins the family with this code. This device's own children, gifts and pictures are replaced by
   * the family's (a copy of the old database is kept). Throws FamilyCodeError for an unknown code.
   */
  async join(input: string): Promise<void> {
    const code = input.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[A-Z0-9]{12}$/.test(code)) throw new FamilyCodeError("A family code has 12 letters and digits");
    // Ask before touching anything, so a mistyped code changes nothing.
    const check = await this.request(code, { since: Number.MAX_SAFE_INTEGER, changes: [] });
    if (check === "bad-code") throw new FamilyCodeError("Unknown family code");
    await this.db.backup("before-join");
    this.db.applyRemote(() => {
      for (const t of [...SYNCED_TABLES].reverse()) {
        this.db.run(t === "photos" ? "DELETE FROM photos WHERE file_key NOT LIKE 'builtin:%'" : `DELETE FROM ${t}`);
      }
      this.db.run("DELETE FROM sync_outbox");
      this.db.run("DELETE FROM sync_files");
      setSetting(this.db, CODE, code);
      setSetting(this.db, REV, "0");
    });
    await this.now();
  }

  /** Stops sharing on this device. Its data stays as it is. */
  leave(): void {
    setSetting(this.db, CODE, "");
    this.setState("off");
  }

  pending(): number {
    return this.db.value<number>("SELECT COUNT(*) FROM sync_outbox");
  }

  /** Syncs now; a call while a sync runs makes it go once more. Resolves true when rows came in. */
  now(): Promise<boolean> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.now();
      }
    });
    return this.running;
  }

  private later(ms: number): void {
    if (this.timer) return;
    this.timer = setTimeout(() => void this.now(), ms);
  }

  private setState(s: SyncState, changed = false): void {
    this.state = s;
    for (const fn of this.listeners) fn(changed);
  }

  private async run(): Promise<boolean> {
    const code = this.code;
    if (!code) return false;
    this.setState("syncing");
    let changed = false;
    try {
      for (let round = 0; round < 1000; round++) {
        const out = this.db.all<{ seq: number; tbl: SyncedTable; row_id: number }>(
          "SELECT seq, tbl, row_id FROM sync_outbox ORDER BY seq LIMIT ?",
          [BATCH]
        );
        const changes: Change[] = out.map((o) => ({
          t: o.tbl,
          id: o.row_id,
          data: this.db.one<Record<string, unknown>>(`SELECT * FROM ${o.tbl} WHERE id = ?`, [o.row_id])
        }));
        await this.uploadFiles(code, changes);
        const since = Number(getSetting(this.db, REV, "0"));
        const res = await this.request(code, { since, changes });
        if (res === "bad-code") {
          this.setState("bad-code");
          return changed;
        }
        if (out.length) this.db.run("DELETE FROM sync_outbox WHERE seq <= ?", [out[out.length - 1].seq]);
        if (res.rows.length) changed = this.apply(res) || changed;
        setSetting(this.db, REV, String(res.rev));
        if (!res.more && out.length < BATCH) break;
      }
      await this.downloadFiles(code);
      this.lastSynced = new Date();
      this.setState("ok", changed);
    } catch (e) {
      console.warn("Sync failed", e);
      this.setState("offline", changed);
    }
    return changed;
  }

  private async request(code: string, body: SyncRequest): Promise<SyncResponse | "bad-code"> {
    const r = await this.fetcher(`${this.base}sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${code}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (r.status === 401) return "bad-code";
    if (!r.ok) throw new Error(`Sync failed (${r.status})`);
    return (await r.json()) as SyncResponse;
  }

  /** Applies rows from the server. Rows this device changed again since are left for it to send. Returns true if anything changed. */
  private apply(res: SyncResponse): boolean {
    const columns = new Map(
      SYNCED_TABLES.map((t) => [t as string, new Set(this.db.all<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name))])
    );
    let changed = false;
    this.applying = true;
    try {
      this.db.applyRemote(() => {
        for (const row of res.rows) {
          const cols = columns.get(row.t);
          if (!cols) continue;
          if (this.db.one("SELECT 1 FROM sync_outbox WHERE tbl = ? AND row_id = ?", [row.t, row.id])) continue;
          const before = this.db.one<Record<string, unknown>>(`SELECT * FROM ${row.t} WHERE id = ?`, [row.id]);
          if (!row.data) {
            if (before) this.db.run(`DELETE FROM ${row.t} WHERE id = ?`, [row.id]);
            changed ||= !!before;
            continue;
          }
          const data = row.data;
          // Columns this version of the app does not know are skipped.
          const keys = Object.keys(data).filter((k) => cols.has(k));
          if (before && keys.every((k) => before[k] === data[k])) continue;
          const set = keys.filter((k) => k !== "id").map((k) => `${k} = excluded.${k}`);
          this.db.run(
            `INSERT INTO ${row.t} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})
             ON CONFLICT (id) DO ${set.length ? `UPDATE SET ${set.join(", ")}` : "NOTHING"}`,
            keys.map((k) => data[k]) as Params
          );
          changed = true;
        }
      });
    } finally {
      this.applying = false;
    }
    return changed;
  }

  private fileKeys(rows: Change[]): string[] {
    const keys = new Set<string>();
    for (const r of rows) {
      for (const [t, col] of FILE_KEY_COLUMNS) {
        const k = r.t === t ? r.data?.[col] : null;
        if (typeof k === "string" && !k.startsWith("builtin:")) keys.add(k);
      }
    }
    return [...keys];
  }

  /** Sends the image files the rows point to, before the rows themselves. */
  private async uploadFiles(code: string, rows: Change[]): Promise<void> {
    for (const key of this.fileKeys(rows)) {
      if (this.db.one("SELECT 1 FROM sync_files WHERE key = ?", [key])) continue;
      const f = await this.files.get(key);
      if (f) {
        const r = await this.fetcher(`${this.base}files/${key}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${code}`, "Content-Type": f.type },
          body: f.bytes
        });
        if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      }
      this.db.run("INSERT OR IGNORE INTO sync_files (key) VALUES (?)", [key]);
    }
  }

  /** Fetches the image files that rows from other devices point to. One that fails is tried again next sync. */
  private async downloadFiles(code: string): Promise<void> {
    const have = new Set(await this.files.keys());
    for (const key of referencedFiles(this.db)) {
      if (have.has(key) || key.startsWith("builtin:")) continue;
      const r = await this.fetcher(`${this.base}files/${key}`, { headers: { Authorization: `Bearer ${code}` } });
      if (!r.ok) continue;
      await this.files.putAs(key, await r.arrayBuffer(), r.headers.get("Content-Type") ?? "image/jpeg");
      this.db.run("INSERT OR IGNORE INTO sync_files (key) VALUES (?)", [key]);
    }
  }
}
