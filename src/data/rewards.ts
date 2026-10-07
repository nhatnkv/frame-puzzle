// Gifts the parents add (shared by the family) and the gifts each child has traded stars for.

import { AppDb, now } from "../db/database";
import { addStars, starTotal } from "./stars";

export interface Reward {
  id: number;
  name: string;
  price: number;
  image_key: string | null;
}

export interface Redemption {
  id: number;
  kid_id: number;
  reward_id: number | null;
  name: string;
  price: number;
  image_key: string | null;
  redeemed_at: string;
  given_at: string | null;
}

export const MAX_PRICE = 999;

/** Gifts a child can see in the shop; deleted gifts stay in the table for the history. */
export function listRewards(db: AppDb): Reward[] {
  return db.all<Reward>("SELECT id, name, price, image_key FROM rewards WHERE active = 1 ORDER BY sort, id");
}

export function getReward(db: AppDb, id: number): Reward | null {
  return db.one<Reward>("SELECT id, name, price, image_key FROM rewards WHERE id = ? AND active = 1", [id]);
}

export function addReward(db: AppDb, name: string, price: number, imageKey: string | null): number {
  const sort = db.value<number>("SELECT COALESCE(MAX(sort), -1) + 1 FROM rewards");
  return db.run("INSERT INTO rewards (name, price, image_key, sort) VALUES (?, ?, ?, ?)", [
    cleanGiftName(name),
    cleanPrice(price),
    imageKey,
    sort
  ]);
}

/** `imageKey` undefined keeps the current picture. Gifts already traded keep their own copy. */
export function updateReward(db: AppDb, id: number, name: string, price: number, imageKey?: string | null): void {
  if (imageKey === undefined) {
    db.run("UPDATE rewards SET name = ?, price = ? WHERE id = ?", [cleanGiftName(name), cleanPrice(price), id]);
  } else {
    db.run("UPDATE rewards SET name = ?, price = ?, image_key = ? WHERE id = ?", [
      cleanGiftName(name),
      cleanPrice(price),
      imageKey,
      id
    ]);
  }
}

/** Hides the gift from the shop. Children who already got it keep it in their list. */
export function deleteReward(db: AppDb, id: number): void {
  db.run("UPDATE rewards SET active = 0 WHERE id = ?", [id]);
}

export function cleanGiftName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!n) throw new Error("A gift needs a name");
  return n;
}

export function cleanPrice(price: number): number {
  const p = Math.round(Number(price));
  return Number.isFinite(p) ? Math.max(1, Math.min(MAX_PRICE, p)) : 1;
}

/**
 * Trades the child's stars for a gift. The name, price and picture are copied, so editing or
 * deleting the gift later keeps the child's history. Returns the redemption, or null when the
 * gift is gone or the child does not have enough stars.
 */
export function redeem(db: AppDb, kidId: number, rewardId: number): Redemption | null {
  let id = 0;
  db.transaction(() => {
    const g = getReward(db, rewardId);
    if (!g || starTotal(db, kidId) < g.price) return;
    id = db.run(
      "INSERT INTO redemptions (kid_id, reward_id, name, price, image_key, redeemed_at) VALUES (?, ?, ?, ?, ?, ?)",
      [kidId, g.id, g.name, g.price, g.image_key, now()]
    );
    addStars(db, kidId, -g.price, "redeem", id);
  });
  return id ? db.one<Redemption>("SELECT * FROM redemptions WHERE id = ?", [id]) : null;
}

/** One child's gifts, newest first. */
export function kidRedemptions(db: AppDb, kidId: number, limit = 20): Redemption[] {
  return db.all<Redemption>("SELECT * FROM redemptions WHERE kid_id = ? ORDER BY redeemed_at DESC, id DESC LIMIT ?", [
    kidId,
    limit
  ]);
}

/** Every child's gifts for the parents: not yet handed out first, then newest first. */
export function allRedemptions(db: AppDb): Redemption[] {
  return db.all<Redemption>("SELECT * FROM redemptions ORDER BY given_at IS NOT NULL, redeemed_at DESC, id DESC");
}

export function setGiven(db: AppDb, id: number, given: boolean): void {
  db.run("UPDATE redemptions SET given_at = ? WHERE id = ?", [given ? now() : null, id]);
}

/** Gifts a parent still has to hand out, across all children. */
export function ungivenCount(db: AppDb): number {
  return db.value<number>("SELECT COUNT(*) FROM redemptions WHERE given_at IS NULL");
}
