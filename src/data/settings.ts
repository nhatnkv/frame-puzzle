import type { AppDb } from "../db/database";

export function getSetting(db: AppDb, key: string, fallback: string): string {
  return db.one<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key])?.value ?? fallback;
}

export function setSetting(db: AppDb, key: string, value: string): void {
  db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
    key,
    value
  ]);
}

export function soundOn(db: AppDb): boolean {
  return getSetting(db, "sound", "1") === "1";
}
