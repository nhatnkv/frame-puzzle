import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import type { SqlJsStatic, SqlValue } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { D1Database, D1PreparedStatement, Env, PagesFunction } from "../functions/api/_lib";
import * as families from "../functions/api/families";
import * as fileApi from "../functions/api/files/[key]";
import * as syncApi from "../functions/api/sync";
import { addKid, deleteKid, listKids, updateKid } from "../src/data/kids";
import { addPhoto, listPhotos } from "../src/data/photos";
import { addStars, recordPuzzle, starTotal } from "../src/data/stars";
import { AppDb } from "../src/db/database";
import { FileStore } from "../src/db/files";
import { memoryKV } from "../src/db/kv";
import { FamilyCodeError, formatCode, Sync, type Fetch } from "../src/sync/sync";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** Enough of D1 for the API, on an in-memory SQLite database with the server's migrations. */
function fakeD1(): D1Database {
  const sql = new SQL.Database();
  sql.exec(readFileSync("migrations/0001_family_sync.sql", "utf8"));
  const toSql = (v: unknown): SqlValue => (v instanceof ArrayBuffer ? new Uint8Array(v) : (v as SqlValue));
  const stmt = (query: string, values: unknown[] = []): D1PreparedStatement => {
    const all = <T>() => {
      const st = sql.prepare(query);
      st.bind(values.map(toSql));
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      st.free();
      return out;
    };
    return {
      bind: (...v) => stmt(query, v),
      first: async <T>() => all<T>()[0] ?? null,
      all: async <T>() => ({ results: all<T>() }),
      run: async () => all()
    };
  };
  return {
    prepare: (q) => stmt(q),
    async batch(list) {
      sql.run("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        sql.run("COMMIT");
        return out;
      } catch (e) {
        sql.run("ROLLBACK");
        throw e;
      }
    }
  };
}

/** A server: the API's handlers on a fake D1. `online` false makes every request fail like a lost network. */
function server() {
  const env: Env = { DB: fakeD1() };
  const s = { online: true, fetch: null as unknown as Fetch };
  s.fetch = async (url, init) => {
    if (!s.online) throw new TypeError("Failed to fetch");
    const request = new Request(`https://frame.test${url}`, init);
    const method = request.method;
    let fn: PagesFunction | undefined;
    const params: Record<string, string> = {};
    const file = url.match(/^\/api\/files\/(.+)$/);
    if (url === "/api/families" && method === "POST") fn = families.onRequestPost;
    else if (url === "/api/sync" && method === "POST") fn = syncApi.onRequestPost;
    else if (file) {
      params.key = file[1];
      fn = method === "PUT" ? fileApi.onRequestPut : fileApi.onRequestGet;
    }
    return fn ? fn({ request, env, params }) : new Response(null, { status: 404 });
  };
  return s;
}

async function device(srv: ReturnType<typeof server>) {
  const db = await AppDb.open(SQL, memoryKV(), { saveDelay: 0 });
  const files = new FileStore(memoryKV());
  return { db, files, sync: new Sync(db, files, (u, i) => srv.fetch(u, i)) };
}

describe("sharing with the family", () => {
  it("brings a new device everything, pictures included", async () => {
    const srv = server();
    const a = await device(srv);
    const key = await a.files.put(new Uint8Array([1, 2, 3]));
    const kid = addKid(a.db, "Bin", 1, key);
    recordPuzzle(a.db, kid, null, 9);
    addPhoto(a.db, "builtin:farm", 10, 10);

    const code = await a.sync.create();
    expect(code).toMatch(/^[A-Z2-9]{12}$/);
    expect(formatCode(code)).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(a.sync.state).toBe("ok");
    expect(a.sync.pending()).toBe(0);

    const b = await device(srv);
    addKid(b.db, "Old", 0, null);
    await b.sync.join(formatCode(code).toLowerCase());
    expect(listKids(b.db).map((k) => [k.id, k.name])).toEqual([[kid, "Bin"]]);
    expect(starTotal(b.db, kid)).toBe(18);
    expect(new Uint8Array((await b.files.get(key))!.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    // The app's own pictures are not shared; each device adds them itself.
    expect(listPhotos(b.db).some((p) => p.file_key === "builtin:farm")).toBe(false);
    expect(b.sync.pending()).toBe(0);
  });

  it("keeps stars earned offline and adds up stars from two devices", async () => {
    const srv = server();
    const a = await device(srv);
    const kid = addKid(a.db, "Bin", 1, null);
    const code = await a.sync.create();
    const b = await device(srv);
    await b.sync.join(code);

    srv.online = false;
    recordPuzzle(b.db, kid, null, 4); // 8 stars on B, offline
    await b.sync.now();
    expect(b.sync.state).toBe("offline");
    expect(b.sync.pending()).toBeGreaterThan(0);
    srv.online = true;

    addStars(a.db, kid, 5, "parent");
    expect(await a.sync.now()).toBe(false);
    expect(await b.sync.now()).toBe(true);
    expect(await a.sync.now()).toBe(true);
    expect(starTotal(a.db, kid)).toBe(13);
    expect(starTotal(b.db, kid)).toBe(13);
  });

  it("shares edits and deletes, and a newer local edit wins over an older one from the server", async () => {
    const srv = server();
    const a = await device(srv);
    const bin = addKid(a.db, "Bin", 1, null);
    const na = addKid(a.db, "Na", 2, null);
    recordPuzzle(a.db, na, null, 4);
    const code = await a.sync.create();
    const b = await device(srv);
    await b.sync.join(code);

    deleteKid(a.db, na); // also deletes Na's stars and puzzles on A
    updateKid(a.db, bin, "Binh", 1);
    await a.sync.now();
    updateKid(b.db, bin, "Bin B", 3); // changed on B before it hears about A's edit
    await b.sync.now();
    expect(listKids(b.db).map((k) => k.name)).toEqual(["Bin B"]);
    expect(b.db.value<number>("SELECT COUNT(*) FROM star_entries")).toBe(0);
    await a.sync.now();
    expect(listKids(a.db).map((k) => k.name)).toEqual(["Bin B"]);
  });

  it("sends and fetches many rows in several rounds", async () => {
    const srv = server();
    const a = await device(srv);
    const kid = addKid(a.db, "Bin", 1, null);
    a.db.transaction(() => {
      for (let i = 0; i < 450; i++) addStars(a.db, kid, 1, "parent");
    });
    const code = await a.sync.create();
    expect(a.sync.pending()).toBe(0);
    const b = await device(srv);
    await b.sync.join(code);
    expect(starTotal(b.db, kid)).toBe(450);
  });

  it("refuses an unknown code and keeps this device's data", async () => {
    const srv = server();
    const b = await device(srv);
    addKid(b.db, "Bin", 1, null);
    await expect(b.sync.join("AAAA-BBBB-CCCC")).rejects.toBeInstanceOf(FamilyCodeError);
    await expect(b.sync.join("short")).rejects.toBeInstanceOf(FamilyCodeError);
    expect(listKids(b.db).map((k) => k.name)).toEqual(["Bin"]);
    expect(b.sync.code).toBeNull();
  });
});
