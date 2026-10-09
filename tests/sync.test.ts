import initSqlJs from "sql.js";
import type { SqlJsStatic } from "sql.js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env, PagesFunction } from "../functions/api/_lib";
import * as families from "../functions/api/families";
import * as fileApi from "../functions/api/files/[key]";
import * as playersApi from "../functions/api/players";
import * as rankingApi from "../functions/api/ranking";
import * as syncApi from "../functions/api/sync";
import { addKid, deleteKid, listKids, updateKid } from "../src/data/kids";
import { addPhoto, listPhotos } from "../src/data/photos";
import { addStars, recordPuzzle, starTotal } from "../src/data/stars";
import { AppDb } from "../src/db/database";
import { FileStore } from "../src/db/files";
import { memoryKV } from "../src/db/kv";
import { localPlayers, playerId, Players } from "../src/rank/players";
import { FamilyCodeError, formatCode, Sync, type Fetch } from "../src/sync/sync";

// The API runs against a real Postgres: CI starts one, and locally set TEST_DATABASE_URL, e.g.
// postgres://app@127.0.0.1:54329/postgres. Its tables are emptied before each test.
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";

let SQL: SqlJsStatic;
const admin = DATABASE_URL ? postgres(DATABASE_URL, { max: 1, onnotice: () => {} }) : null;
beforeAll(async () => {
  SQL = await initSqlJs();
  if (!DATABASE_URL) return;
  // @ts-expect-error a plain JavaScript script
  const { migrate } = await import("../scripts/migrate.mjs");
  await migrate(DATABASE_URL);
});
beforeEach(async () => {
  await admin?.unsafe("TRUNCATE players, files, rows, families");
});
afterAll(async () => {
  await admin?.end();
});

/** A server: the API's handlers on the test database. `online` false makes every request fail like a lost network. */
function server() {
  const env: Env = { DATABASE_URL };
  const s = { online: true, fetch: null as unknown as Fetch };
  s.fetch = async (url, init) => {
    if (!s.online) throw new TypeError("Failed to fetch");
    const request = new Request(`https://frame.test${url}`, init);
    const method = request.method;
    let fn: PagesFunction | undefined;
    const params: Record<string, string> = {};
    const file = url.match(/^\/api\/files\/(.+)$/);
    const path = url.split("?")[0];
    if (url === "/api/families" && method === "POST") fn = families.onRequestPost;
    else if (path === "/api/players" && method === "PUT") fn = playersApi.onRequestPut;
    else if (path === "/api/ranking" && method === "GET") fn = rankingApi.onRequestGet;
    else if (url === "/api/sync" && method === "POST") fn = syncApi.onRequestPost;
    else if (file) {
      params.key = file[1];
      fn = method === "PUT" ? fileApi.onRequestPut : fileApi.onRequestGet;
    }
    const closing: Array<Promise<unknown>> = [];
    const res = fn ? await fn({ request, env, params, waitUntil: (p) => closing.push(p) }) : new Response(null, { status: 404 });
    await Promise.all(closing);
    return res;
  };
  return s;
}

async function device(srv: ReturnType<typeof server>) {
  const db = await AppDb.open(SQL, memoryKV(), { saveDelay: 0 });
  const files = new FileStore(memoryKV());
  const sync = new Sync(db, files, (u, i) => srv.fetch(u, i));
  const players = new Players(db, () => sync.code, () => true, (u, i) => srv.fetch(u, i));
  return { db, files, sync, players };
}

describe.skipIf(!DATABASE_URL)("sharing with the family", () => {
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

describe.skipIf(!DATABASE_URL)("rankings", () => {
  it("ranks every child of every device by the stars won by playing", async () => {
    const srv = server();
    const a = await device(srv);
    const bin = addKid(a.db, "Bin", 1, null);
    recordPuzzle(a.db, bin, null, 4); // 8
    addStars(a.db, bin, 100, "parent"); // added by hand: not counted
    addStars(a.db, bin, -5, "redeem"); // spent on a gift: still counted
    const b = await device(srv);
    const na = addKid(b.db, "Na", 2, null);
    recordPuzzle(b.db, na, null, 9); // 18
    addStars(b.db, na, -1, "mistake"); // lost: taken off
    const lan = addKid(b.db, "Lan", 3, null); // no stars yet

    const res = await b.players.ranking("general");
    await a.players.push();
    const all = await a.players.ranking("general");
    expect(res.players.map((p) => p.name)).toEqual(["Na", "Lan"]);
    expect(all.players.map((p) => [p.name, p.stars, p.puzzles, p.rank])).toEqual([
      ["Na", 17, 1, 1],
      ["Bin", 8, 1, 2],
      ["Lan", 0, 0, 3]
    ]);
    // A's own player, by its id.
    const [binId] = [...(await a.players.idsByKid()).entries()].find(([, k]) => k === bin)!;
    expect(all.me.map((p) => [p.id, p.rank])).toEqual([[binId, 2]]);
    expect(all.players.some((p) => "kid_id" in p || "family" in p)).toBe(false);
    // No family: the family tab has nobody.
    expect((await a.players.ranking("family")).players).toEqual([]);
    expect(lan).toBeGreaterThan(0);
  });

  it("sends only changes, and removes deleted children", async () => {
    const srv = server();
    const a = await device(srv);
    const bin = addKid(a.db, "Bin", 1, null);
    const na = addKid(a.db, "Na", 2, null);
    await a.players.push();
    const calls: string[] = [];
    const fetch = srv.fetch;
    srv.fetch = (u, i) => (calls.push(`${i?.method ?? "GET"} ${u}`), fetch(u, i));
    await a.players.push();
    expect(calls).toEqual([]);

    recordPuzzle(a.db, bin, null, 4);
    deleteKid(a.db, na);
    await a.players.push();
    expect(calls).toEqual(["PUT /api/players"]);
    const res = await a.players.ranking("general");
    expect(res.players.map((p) => [p.name, p.stars])).toEqual([["Bin", 8]]);
  });

  it("keeps a family's children in the family tab, the same player on every device", async () => {
    const srv = server();
    const a = await device(srv);
    const bin = addKid(a.db, "Bin", 1, null);
    recordPuzzle(a.db, bin, null, 4);
    await a.players.push(); // ranked before sharing
    const code = await a.sync.create();
    const b = await device(srv);
    addKid(b.db, "Old", 0, null);
    await b.players.push(); // B's own child, gone once B joins
    await b.sync.join(code);
    const other = await device(srv);
    recordPuzzle(other.db, addKid(other.db, "Khoa", 0, null), null, 49);
    await other.players.push();

    recordPuzzle(b.db, bin, null, 2); // 4 more on B
    await b.sync.now();
    await a.sync.now();
    const fam = await b.players.ranking("family");
    expect(fam.players.map((p) => [p.name, p.stars, p.rank])).toEqual([["Bin", 12, 1]]);
    await a.players.push();
    const general = await a.players.ranking("general");
    expect(general.players.map((p) => [p.name, p.stars])).toEqual([
      ["Khoa", 98],
      ["Bin", 12]
    ]);
    // Both devices name the same player.
    expect([...(await a.players.idsByKid()).keys()]).toEqual([...(await b.players.idsByKid()).keys()]);
    expect(localPlayers(a.db)[0].key).toBe(localPlayers(b.db)[0].key);
  });

  it("keeps one player per child when two devices of a family gave it different keys", async () => {
    const srv = server();
    const a = await device(srv);
    const bin = addKid(a.db, "Bin", 1, null);
    const code = await a.sync.create();
    const b = await device(srv);
    await b.sync.join(code);
    // Both devices give Bin a key before hearing from each other.
    await a.players.push();
    await b.players.push();
    expect((await a.players.ranking("family")).players).toHaveLength(1);
    await a.sync.now();
    await b.sync.now();
    await a.sync.now();
    await a.players.push();
    await b.players.push();
    const res = await a.players.ranking("general");
    expect(res.players).toHaveLength(1);
    expect(res.players[0].id).toBe(await playerId(localPlayers(b.db)[0].key));
    expect(bin).toBeGreaterThan(0);
  });

  it("refuses bad players and a wrong family code", async () => {
    const srv = server();
    const put = (body: unknown, auth?: string) =>
      srv.fetch("/api/players", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
        body: JSON.stringify(body)
      });
    const good = { key: "0".repeat(32), kid: 1, name: "Bin", color: 0, stars: 1, puzzles: 1 };
    expect((await put({ players: [good], gone: [] })).status).toBe(200);
    expect((await put({ players: [{ ...good, name: "x".repeat(17) }], gone: [] })).status).toBe(400);
    expect((await put({ players: [{ ...good, stars: -1 }], gone: [] })).status).toBe(400);
    expect((await put({ players: [{ ...good, key: "short" }], gone: [] })).status).toBe(400);
    expect((await put({ players: [good], gone: [] }, "AAAA-BBBB-CCCC")).status).toBe(401);
    expect((await srv.fetch("/api/ranking?scope=family")).status).toBe(401);
  });
});
