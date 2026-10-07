import { AppDb, now } from "../db/database";

export type StarReason = "puzzle" | "redeem" | "parent";

/** Stars earned for finishing a puzzle. */
export function starsFor(pieces: number): number {
  return pieces * 2;
}

export function starTotal(db: AppDb, kidId: number): number {
  return db.value<number>("SELECT COALESCE(SUM(delta), 0) FROM star_entries WHERE kid_id = ?", [kidId]);
}

export function addStars(db: AppDb, kidId: number, delta: number, reason: StarReason, refId: number | null = null): void {
  db.run("INSERT INTO star_entries (kid_id, delta, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?)", [
    kidId,
    delta,
    reason,
    refId,
    now()
  ]);
}

/** A parent's manual change; never takes the total below zero. Returns the new total. */
export function adjustStars(db: AppDb, kidId: number, delta: number): number {
  const total = starTotal(db, kidId);
  const d = Math.max(-total, delta);
  if (d !== 0) addStars(db, kidId, d, "parent");
  return total + d;
}

/** Records a finished puzzle and its stars in one step. Returns the stars earned. */
export function recordPuzzle(db: AppDb, kidId: number, photoId: number | null, pieces: number): number {
  const stars = starsFor(pieces);
  db.transaction(() => {
    const id = db.run("INSERT INTO puzzles (kid_id, photo_id, pieces, stars, completed_at) VALUES (?, ?, ?, ?, ?)", [
      kidId,
      photoId,
      pieces,
      stars,
      now()
    ]);
    addStars(db, kidId, stars, "puzzle", id);
  });
  return stars;
}
