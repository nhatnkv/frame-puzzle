import { AppDb, now } from "../db/database";

export interface Kid {
  id: number;
  name: string;
  color: number;
  photo_key: string | null;
}

/** Soft background and ink colors for avatars without a photo. */
export const KID_COLORS: Array<[bg: string, ink: string]> = [
  ["#DCE9F4", "#3F6F99"],
  ["#FBEFD6", "#9A6A14"],
  ["#E2F1E5", "#477A53"],
  ["#F4E1E4", "#9A4E5C"],
  ["#E8E3F4", "#64578F"]
];

const COLS = "id, name, color, photo_key";

export function listKids(db: AppDb): Kid[] {
  return db.all<Kid>(`SELECT ${COLS} FROM kids ORDER BY sort, id`);
}

export function getKid(db: AppDb, id: number): Kid | null {
  return db.one<Kid>(`SELECT ${COLS} FROM kids WHERE id = ?`, [id]);
}

export function countKids(db: AppDb): number {
  return db.value<number>("SELECT COUNT(*) FROM kids");
}

export function addKid(db: AppDb, name: string, color: number, photoKey: string | null): number {
  const sort = db.value<number>("SELECT COALESCE(MAX(sort), -1) + 1 FROM kids");
  return db.run("INSERT INTO kids (name, color, photo_key, sort, created_at) VALUES (?, ?, ?, ?, ?)", [
    cleanName(name),
    color,
    photoKey,
    sort,
    now()
  ]);
}

/** `photoKey` undefined keeps the current photo. */
export function updateKid(db: AppDb, id: number, name: string, color: number, photoKey?: string | null): void {
  if (photoKey === undefined) db.run("UPDATE kids SET name = ?, color = ? WHERE id = ?", [cleanName(name), color, id]);
  else db.run("UPDATE kids SET name = ?, color = ?, photo_key = ? WHERE id = ?", [cleanName(name), color, photoKey, id]);
}

/** Deletes the child together with their stars, finished puzzles and gifts (ON DELETE CASCADE). */
export function deleteKid(db: AppDb, id: number): void {
  db.run("DELETE FROM kids WHERE id = ?", [id]);
}

export function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ").slice(0, 16);
  if (!n) throw new Error("A child needs a name");
  return n;
}

/** The letter shown on an avatar without a photo: the first letter of the last word. */
export function initial(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words[words.length - 1] ?? "";
  return (Array.from(last)[0] ?? "?").toUpperCase();
}
