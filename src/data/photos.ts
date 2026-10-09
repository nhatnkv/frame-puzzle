import { AppDb, now } from "../db/database";
import { newId } from "../db/ids";

export interface Photo {
  id: number;
  file_key: string;
  width: number;
  height: number;
}

/** File key prefix of the pictures that come with the app; the rest of the key is the picture's name. */
export const BUILTIN = "builtin:";

/** A picture that comes with the app. */
export interface BuiltinPicture {
  name: string;
  url: string;
  width: number;
  height: number;
}

export function isBuiltin(p: Photo): boolean {
  return p.file_key.startsWith(BUILTIN);
}

/** Every picture, most recently used first. */
export function listPhotos(db: AppDb): Photo[] {
  return db.all<Photo>(
    "SELECT id, file_key, width, height FROM photos ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC"
  );
}

export function getPhoto(db: AppDb, id: number): Photo | null {
  return db.one<Photo>("SELECT id, file_key, width, height FROM photos WHERE id = ?", [id]);
}

export function addPhoto(db: AppDb, fileKey: string, width: number, height: number, createdAt = now()): number {
  return db.run("INSERT INTO photos (id, file_key, width, height, created_at) VALUES (?, ?, ?, ?, ?)", [
    newId(),
    fileKey,
    width,
    height,
    createdAt
  ]);
}

export function touchPhoto(db: AppDb, id: number): void {
  db.run("UPDATE photos SET last_used_at = ? WHERE id = ?", [now(), id]);
}

/** Finished puzzles keep their history; their photo_id becomes NULL. Pictures that come with the app stay. */
export function deletePhoto(db: AppDb, id: number): void {
  db.run("DELETE FROM photos WHERE id = ? AND file_key NOT LIKE 'builtin:%'", [id]);
}

/**
 * Keeps the pictures that come with the app in the library: adds the ones it does not have yet,
 * listed after the family's own pictures and in the given order, and removes any the app no longer
 * ships.
 */
export function syncBuiltins(db: AppDb, pictures: BuiltinPicture[]): void {
  const keys = pictures.map((p) => BUILTIN + p.name);
  const have = new Set(db.all<{ k: string }>("SELECT file_key AS k FROM photos WHERE file_key LIKE 'builtin:%'").map((r) => r.k));
  if (keys.length === have.size && keys.every((k) => have.has(k))) return;
  db.transaction(() => {
    for (const k of have) if (!keys.includes(k)) db.run("DELETE FROM photos WHERE file_key = ?", [k]);
    pictures.forEach((p, i) => {
      if (have.has(keys[i])) return;
      // An old date keeps them after the family's pictures until they are played.
      addPhoto(db, keys[i], p.width, p.height, new Date(Date.UTC(2020, 0, 1) - i * 1000).toISOString());
    });
  });
}
