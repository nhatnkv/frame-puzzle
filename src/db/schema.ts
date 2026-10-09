// Schema migrations, applied in order and tracked with PRAGMA user_version.
// Image bytes are not stored in SQLite: rows keep a file key into the "files" store (src/db/files.ts),
// so saving the database after every tap stays fast however many photos the family imports.

/** The tables shared with the family, parents before children. Settings stay on each device. */
export const SYNCED_TABLES = ["kids", "photos", "rewards", "redemptions", "star_entries", "puzzles"] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE kids (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      color INTEGER NOT NULL DEFAULT 0,
      photo_key TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL)`,
    `CREATE TABLE photos (
      id INTEGER PRIMARY KEY,
      file_key TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT)`,
    `CREATE TABLE rewards (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price > 0),
      image_key TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE redemptions (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      reward_id INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      image_key TEXT,
      redeemed_at TEXT NOT NULL,
      given_at TEXT)`,
    `CREATE TABLE star_entries (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('puzzle', 'redeem', 'parent')),
      ref_id INTEGER,
      created_at TEXT NOT NULL)`,
    `CREATE TABLE puzzles (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
      pieces INTEGER NOT NULL,
      stars INTEGER NOT NULL,
      completed_at TEXT NOT NULL)`,
    `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE INDEX star_entries_kid ON star_entries(kid_id)`,
    `CREATE INDEX redemptions_kid ON redemptions(kid_id)`
  ],
  // v2: stars lost for a mistake at Ultimate or a hint at Extreme. SQLite cannot change a CHECK, so the table is rebuilt.
  [
    `CREATE TABLE star_entries_v2 (
      id INTEGER PRIMARY KEY,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('puzzle', 'redeem', 'parent', 'mistake', 'hint')),
      ref_id INTEGER,
      created_at TEXT NOT NULL)`,
    `INSERT INTO star_entries_v2 (id, kid_id, delta, reason, ref_id, created_at)
      SELECT id, kid_id, delta, reason, ref_id, created_at FROM star_entries`,
    `DROP TABLE star_entries`,
    `ALTER TABLE star_entries_v2 RENAME TO star_entries`,
    `CREATE INDEX star_entries_kid ON star_entries(kid_id)`
  ],
  // v3: sharing with the family (src/sync/sync.ts). Triggers note every changed row in an outbox
  // that is sent to the server, except while rows from the server are being applied.
  [
    `CREATE TABLE sync_outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      tbl TEXT NOT NULL,
      row_id INTEGER NOT NULL)`,
    `CREATE INDEX sync_outbox_row ON sync_outbox(tbl, row_id)`,
    `CREATE TABLE sync_flag (applying INTEGER NOT NULL)`,
    `INSERT INTO sync_flag (applying) VALUES (0)`,
    `CREATE TABLE sync_files (key TEXT PRIMARY KEY)`,
    ...SYNCED_TABLES.flatMap((t) =>
      (["INSERT", "UPDATE", "DELETE"] as const).map((op) => {
        const row = op === "DELETE" ? "OLD" : "NEW";
        // The pictures that come with the app are added by every device itself.
        const own = t === "photos" ? ` AND ${row}.file_key NOT LIKE 'builtin:%'` : "";
        return `CREATE TRIGGER ${t}_sync_${op.toLowerCase()} AFTER ${op} ON ${t}
          WHEN (SELECT applying FROM sync_flag) = 0${own}
          BEGIN
            DELETE FROM sync_outbox WHERE tbl = '${t}' AND row_id = ${row}.id;
            INSERT INTO sync_outbox (tbl, row_id) VALUES ('${t}', ${row}.id);
          END`;
      })
    )
  ],
  // v4: each child is a player in the rankings (src/rank/players.ts). The key is the player's
  // secret on the server; it is shared with the family like the rest of the child's row.
  [`ALTER TABLE kids ADD COLUMN player_key TEXT`]
];

/** Every column that holds a key into the files store, used to find unreferenced files. */
export const FILE_KEY_COLUMNS: Array<[table: string, column: string]> = [
  ["kids", "photo_key"],
  ["photos", "file_key"],
  ["rewards", "image_key"],
  ["redemptions", "image_key"]
];
