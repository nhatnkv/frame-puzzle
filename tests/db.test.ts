import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { SqlJsStatic } from "sql.js";
import { AppDb } from "../src/db/database";
import { FileStore } from "../src/db/files";
import { memoryKV } from "../src/db/kv";
import { MIGRATIONS } from "../src/db/schema";
import { referencedFiles } from "../src/data/files";
import { addKid, cleanName, countKids, deleteKid, getKid, initial, listKids, updateKid } from "../src/data/kids";
import { addPhoto, deletePhoto, listPhotos, touchPhoto } from "../src/data/photos";
import { adjustStars, recordPuzzle, starTotal } from "../src/data/stars";
import { getSetting, setSetting } from "../src/data/settings";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

async function openDb(kv = memoryKV()) {
  return AppDb.open(SQL, kv, { saveDelay: 0 });
}

describe("database", () => {
  it("creates the schema on first open", async () => {
    const db = await openDb();
    expect(db.version).toBe(MIGRATIONS.length);
    expect(countKids(db)).toBe(0);
  });

  it("keeps data after closing and opening again", async () => {
    const kv = memoryKV();
    const db = await openDb(kv);
    const id = addKid(db, "Bin", 1, null);
    recordPuzzle(db, id, null, 9);
    await db.flush();
    const again = await openDb(kv);
    expect(listKids(again).map((k) => k.name)).toEqual(["Bin"]);
    expect(starTotal(again, id)).toBe(18);
  });

  it("keeps foreign keys on after saving", async () => {
    const db = await openDb();
    const id = addKid(db, "Na", 0, null);
    await db.flush();
    recordPuzzle(db, id, null, 4);
    deleteKid(db, id);
    expect(db.value<number>("SELECT COUNT(*) FROM star_entries")).toBe(0);
    expect(db.value<number>("SELECT COUNT(*) FROM puzzles")).toBe(0);
  });

  it("starts fresh if the saved file is damaged", async () => {
    const kv = memoryKV();
    await kv.put("sqlite", new Uint8Array([1, 2, 3, 4]));
    const db = await openDb(kv);
    expect(countKids(db)).toBe(0);
  });
});

describe("children", () => {
  it("adds, edits and lists children in order", async () => {
    const db = await openDb();
    const a = addKid(db, "  Bin  ", 0, null);
    addKid(db, "Na", 3, "img-1");
    updateKid(db, a, "Bin Bin", 2);
    expect(listKids(db).map((k) => [k.name, k.color, k.photo_key])).toEqual([
      ["Bin Bin", 2, null],
      ["Na", 3, "img-1"]
    ]);
    updateKid(db, a, "Bin", 2, "img-2");
    expect(getKid(db, a)?.photo_key).toBe("img-2");
  });

  it("keeps stars per child", async () => {
    const db = await openDb();
    const a = addKid(db, "Bin", 0, null);
    const b = addKid(db, "Na", 1, null);
    recordPuzzle(db, a, null, 4);
    recordPuzzle(db, b, null, 9);
    expect(starTotal(db, a)).toBe(8);
    expect(starTotal(db, b)).toBe(18);
  });

  it("refuses an empty name and shortens long ones", () => {
    expect(() => cleanName("   ")).toThrow();
    expect(cleanName("A very very long child name")).toHaveLength(16);
  });

  it("uses the first letter of the last word as the initial", () => {
    expect(initial("bin")).toBe("B");
    expect(initial("Nguyen Minh An")).toBe("A");
  });
});

describe("stars", () => {
  it("never goes below zero when a parent removes stars", async () => {
    const db = await openDb();
    const id = addKid(db, "Bin", 0, null);
    expect(adjustStars(db, id, 10)).toBe(10);
    expect(adjustStars(db, id, -25)).toBe(0);
    expect(starTotal(db, id)).toBe(0);
  });
});

describe("pictures", () => {
  it("lists the most recently used first and keeps puzzle history after deleting", async () => {
    const db = await openDb();
    const kid = addKid(db, "Bin", 0, null);
    const p1 = addPhoto(db, "f1", 100, 100, "2026-01-01T00:00:00Z");
    const p2 = addPhoto(db, "f2", 100, 100, "2026-01-02T00:00:00Z");
    expect(listPhotos(db).map((p) => p.id)).toEqual([p2, p1]);
    touchPhoto(db, p1);
    expect(listPhotos(db).map((p) => p.id)).toEqual([p1, p2]);
    recordPuzzle(db, kid, p1, 4);
    deletePhoto(db, p1);
    expect(listPhotos(db).map((p) => p.id)).toEqual([p2]);
    expect(db.value<number>("SELECT COUNT(*) FROM puzzles WHERE photo_id IS NULL")).toBe(1);
  });

  it("deletes image files no row uses any more", async () => {
    const db = await openDb();
    const files = new FileStore(memoryKV());
    const keep = await files.put(new Uint8Array([1]));
    const drop = await files.put(new Uint8Array([2]));
    addPhoto(db, keep, 1, 1);
    await new Promise((r) => setTimeout(r, 2));
    expect(await files.sweep(() => referencedFiles(db))).toBe(1);
    expect(await files.get(keep)).toBeDefined();
    expect(await files.get(drop)).toBeUndefined();
  });
});

describe("settings", () => {
  it("stores and overwrites values", async () => {
    const db = await openDb();
    expect(getSetting(db, "sound", "1")).toBe("1");
    setSetting(db, "sound", "0");
    setSetting(db, "sound", "1");
    setSetting(db, "sound", "0");
    expect(getSetting(db, "sound", "1")).toBe("0");
  });
});
