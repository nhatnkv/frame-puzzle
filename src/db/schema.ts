// Schema migrations, applied in order and tracked with PRAGMA user_version.
// Image bytes are not stored in SQLite: rows keep a file key into the "files" store (src/db/files.ts),
// so saving the database after every tap stays fast however many photos the family imports.

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
  ]
];

/** Every column that holds a key into the files store, used to find unreferenced files. */
export const FILE_KEY_COLUMNS: Array<[table: string, column: string]> = [
  ["kids", "photo_key"],
  ["photos", "file_key"],
  ["rewards", "image_key"],
  ["redemptions", "image_key"]
];
