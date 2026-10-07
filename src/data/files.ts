import type { AppDb } from "../db/database";
import { FILE_KEY_COLUMNS } from "../db/schema";

/** Every file key some row still uses. */
export function referencedFiles(db: AppDb): Set<string> {
  const keys = new Set<string>();
  for (const [table, column] of FILE_KEY_COLUMNS) {
    for (const r of db.all<{ k: string }>(`SELECT ${column} AS k FROM ${table} WHERE ${column} IS NOT NULL`)) keys.add(r.k);
  }
  return keys;
}
