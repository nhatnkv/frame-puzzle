import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import type { SqlJsStatic } from "sql.js";
import { AppDb } from "../src/db/database";
import { memoryKV } from "../src/db/kv";
import { referencedFiles } from "../src/data/files";
import { addKid, deleteKid } from "../src/data/kids";
import {
  addReward,
  allRedemptions,
  cleanGiftName,
  cleanPrice,
  deleteReward,
  getReward,
  kidRedemptions,
  listRewards,
  redeem,
  setGiven,
  ungivenCount,
  updateReward
} from "../src/data/rewards";
import { addStars, starTotal } from "../src/data/stars";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const openDb = () => AppDb.open(SQL, memoryKV(), { saveDelay: 0 });

describe("gifts", () => {
  it("adds, edits and lists gifts in the order they were added", async () => {
    const db = await openDb();
    const a = addReward(db, " Ice   cream ", 30, null);
    addReward(db, "Teddy bear", 100, "img-1");
    updateReward(db, a, "Ice cream cone", 25);
    expect(listRewards(db).map((g) => [g.name, g.price, g.image_key])).toEqual([
      ["Ice cream cone", 25, null],
      ["Teddy bear", 100, "img-1"]
    ]);
    updateReward(db, a, "Ice cream cone", 25, "img-2");
    expect(getReward(db, a)?.image_key).toBe("img-2");
  });

  it("cleans names and prices", () => {
    expect(() => cleanGiftName("   ")).toThrow();
    expect(cleanGiftName("x".repeat(60))).toHaveLength(40);
    expect(cleanPrice(0)).toBe(1);
    expect(cleanPrice(5000)).toBe(999);
    expect(cleanPrice(Number.NaN)).toBe(1);
    expect(cleanPrice(12.6)).toBe(13);
  });

  it("trades stars for a gift only when the child has enough", async () => {
    const db = await openDb();
    const kid = addKid(db, "Bin", 0, null);
    const g = addReward(db, "Ice cream", 30, "img-g");
    addStars(db, kid, 20, "puzzle");
    expect(redeem(db, kid, g)).toBeNull();
    expect(starTotal(db, kid)).toBe(20);
    addStars(db, kid, 15, "puzzle");
    const r = redeem(db, kid, g)!;
    expect(r).toMatchObject({ kid_id: kid, reward_id: g, name: "Ice cream", price: 30, image_key: "img-g", given_at: null });
    expect(starTotal(db, kid)).toBe(5);
    expect(kidRedemptions(db, kid).map((x) => x.id)).toEqual([r.id]);
  });

  it("keeps a child's gift after the gift is edited or deleted", async () => {
    const db = await openDb();
    const kid = addKid(db, "Bin", 0, null);
    const g = addReward(db, "Ice cream", 10, "img-old");
    addStars(db, kid, 10, "puzzle");
    redeem(db, kid, g);
    updateReward(db, g, "Big ice cream", 50, "img-new");
    deleteReward(db, g);
    expect(listRewards(db)).toEqual([]);
    expect(getReward(db, g)).toBeNull();
    expect(kidRedemptions(db, kid).map((x) => [x.name, x.price, x.image_key])).toEqual([["Ice cream", 10, "img-old"]]);
    // Both pictures stay: the old one is still shown in the child's gifts.
    expect([...referencedFiles(db)].sort()).toEqual(["img-new", "img-old"]);
    // A deleted gift cannot be traded.
    addStars(db, kid, 100, "puzzle");
    expect(redeem(db, kid, g)).toBeNull();
  });

  it("lists not-given gifts first and counts them for the parents", async () => {
    const db = await openDb();
    const a = addKid(db, "Bin", 0, null);
    const b = addKid(db, "Na", 1, null);
    const g = addReward(db, "Sticker", 5, null);
    addStars(db, a, 50, "puzzle");
    addStars(db, b, 50, "puzzle");
    const r1 = redeem(db, a, g)!;
    const r2 = redeem(db, b, g)!;
    const r3 = redeem(db, a, g)!;
    expect(ungivenCount(db)).toBe(3);
    setGiven(db, r3.id, true);
    expect(ungivenCount(db)).toBe(2);
    const list = allRedemptions(db);
    expect(list.map((x) => x.id)).toEqual([r2.id, r1.id, r3.id]);
    expect(list[2].given_at).not.toBeNull();
    setGiven(db, r3.id, false);
    expect(ungivenCount(db)).toBe(3);
    // Deleting a child removes their gifts too.
    deleteKid(db, a);
    expect(allRedemptions(db).map((x) => x.id)).toEqual([r2.id]);
  });
});
