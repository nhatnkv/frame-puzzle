-- The family's shared data. The server does not know the app's tables: every row is kept as JSON
-- under its table name and id, and the app's own SQLite schema checks it on each device.

-- One family per code; id is the SHA-256 of the code, so the database never holds the code itself.
-- rev counts the family's changes: each sync that sends rows takes the next number.
CREATE TABLE families (
  id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- data is NULL for a deleted row, so other devices learn about the delete.
CREATE TABLE rows (
  family TEXT NOT NULL REFERENCES families(id),
  tbl TEXT NOT NULL,
  id INTEGER NOT NULL,
  data TEXT,
  rev INTEGER NOT NULL,
  PRIMARY KEY (family, tbl, id)
);
CREATE INDEX rows_rev ON rows (family, rev);

-- Image files (children's photos, family pictures, gift pictures). Keys are never reused.
CREATE TABLE files (
  family TEXT NOT NULL REFERENCES families(id),
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY (family, key)
);
