import { AppDb, now } from "../db/database";

export interface Photo {
  id: number;
  file_key: string;
  width: number;
  height: number;
}

/** Every imported picture, most recently used first. */
export function listPhotos(db: AppDb): Photo[] {
  return db.all<Photo>(
    "SELECT id, file_key, width, height FROM photos ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC"
  );
}

export function getPhoto(db: AppDb, id: number): Photo | null {
  return db.one<Photo>("SELECT id, file_key, width, height FROM photos WHERE id = ?", [id]);
}

export function addPhoto(db: AppDb, fileKey: string, width: number, height: number, createdAt = now()): number {
  return db.run("INSERT INTO photos (file_key, width, height, created_at) VALUES (?, ?, ?, ?)", [
    fileKey,
    width,
    height,
    createdAt
  ]);
}

export function touchPhoto(db: AppDb, id: number): void {
  db.run("UPDATE photos SET last_used_at = ? WHERE id = ?", [now(), id]);
}

/** Finished puzzles keep their history; their photo_id becomes NULL. */
export function deletePhoto(db: AppDb, id: number): void {
  db.run("DELETE FROM photos WHERE id = ?", [id]);
}
