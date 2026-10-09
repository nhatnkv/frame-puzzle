import { fail, family, pgArray, sha256, withDb, type PagesFunction } from "./_lib";

/** Most players one request may send: one device's children. */
export const MAX_PLAYERS = 50;

export interface PlayerUpdate {
  /** The player's secret key, from the child's row. */
  key: string;
  /** The child's row id, which is the same on every device of the family. */
  kid: number;
  name: string;
  color: number;
  stars: number;
  puzzles: number;
}

export interface PlayersRequest {
  players: PlayerUpdate[];
  /** Keys of players whose child was deleted. */
  gone: string[];
}

const KEY = /^[0-9a-f]{32}$/;
const count = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 2 ** 31 - 1;

function valid(p: PlayerUpdate): boolean {
  return (
    typeof p?.key === "string" &&
    KEY.test(p.key) &&
    Number.isSafeInteger(p.kid) &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    p.name.length <= 16 &&
    Number.isInteger(p.color) &&
    p.color >= 0 &&
    p.color < 100 &&
    count(p.stars) &&
    count(p.puzzles)
  );
}

// PUT /api/players: adds or updates this device's players and removes deleted ones. With a family
// code in the Authorization header the players join that family's ranking; without one they are
// only in the general ranking (a player keeps the family it had).
export const onRequestPut: PagesFunction = ({ request, env, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    let fam: string | null = null;
    if (request.headers.get("Authorization")) {
      const f = await family(request, db);
      if (f instanceof Response) return f;
      fam = f;
    }
    let body: PlayersRequest;
    try {
      body = await request.json();
    } catch {
      return fail(400, "Not JSON");
    }
    const players = Array.isArray(body.players) ? body.players : [];
    const gone = Array.isArray(body.gone) ? body.gone : [];
    if (players.length + gone.length > MAX_PLAYERS || !players.every(valid) || !gone.every((k) => typeof k === "string" && KEY.test(k))) {
      return fail(400, "Bad players");
    }
    const ids = await Promise.all(players.map((p) => sha256(p.key)));
    const goneIds = await Promise.all(gone.map((k) => sha256(k)));

    await db.begin(async (tx) => {
      if (goneIds.length) await tx.query("DELETE FROM players WHERE id = ANY($1::text[])", [pgArray(goneIds)]);
      if (!players.length) return;
      const params: unknown[] = [fam];
      const values = players.map((p, i) => {
        params.push(ids[i], String(p.kid), p.name.trim(), p.color, p.stars, p.puzzles);
        const n = params.length;
        return `($${n - 5}, $${n - 4}::bigint, $1, $${n - 3}, $${n - 2}::int, $${n - 1}::int, $${n}::int)`;
      });
      await tx.query(
        `INSERT INTO players (id, kid_id, family, name, color, stars, puzzles) VALUES ${values.join(", ")}
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color, stars = excluded.stars,
           puzzles = excluded.puzzles, family = COALESCE(excluded.family, players.family), updated_at = now()`,
        params
      );
      // Two devices of a family can each give a child a key before they sync; the key that reached
      // the family's rows wins, and the child's other player goes.
      if (fam) {
        await tx.query("DELETE FROM players WHERE family = $1 AND kid_id = ANY($2::bigint[]) AND NOT (id = ANY($3::text[]))", [
          fam,
          pgArray(players.map((p) => p.kid)),
          pgArray(ids)
        ]);
      }
    });
    return Response.json({ ok: true });
  });
