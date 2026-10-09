-- Players: every child profile on every device, so children can be ranked against all players of
-- the app (General) or their own family (Family). Kept apart from the family's synced rows, because
-- a device that never shares with a family still has players.

-- id is the SHA-256 of the player's secret key, which lives in the child's row on the device (and
-- so on every device of the family): only a device that has the key can change the player, and the
-- id can be shown to anyone. family is set while the child is shared with a family.
-- stars is what the device counts for the child (stars won by playing, not spent ones); rating is
-- the server's own number for later games between players, so devices never set it.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  kid_id BIGINT NOT NULL,
  family TEXT REFERENCES families(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  color INT NOT NULL DEFAULT 0,
  stars INT NOT NULL DEFAULT 0,
  puzzles INT NOT NULL DEFAULT 0,
  rating INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX players_stars ON players (stars DESC);
CREATE INDEX players_family ON players (family, kid_id);
