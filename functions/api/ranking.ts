import { family, pgArray, withDb, type PagesFunction } from "./_lib";

/** Players shown in the general ranking. */
export const TOP = 50;

export interface RankedPlayer {
  id: string;
  name: string;
  color: number;
  stars: number;
  puzzles: number;
  /** 1 for the most stars; players with the same stars share a place. */
  rank: number;
}

export interface RankingResponse {
  players: RankedPlayer[];
  /** The asked-for players (`me`) with their place, also when they are below the top. */
  me: RankedPlayer[];
}

const COLS = "id, name, color, stars, puzzles";

// GET /api/ranking?scope=general&me=id,id: the players with the most stars across the app, plus the
// places of this device's own players. GET /api/ranking?scope=family with the family code in the
// Authorization header: every player of that family.
export const onRequestGet: PagesFunction = ({ request, env, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    const url = new URL(request.url);
    const me = (url.searchParams.get("me") ?? "")
      .split(",")
      .filter((id) => /^[0-9a-f]{64}$/.test(id))
      .slice(0, 50);
    let fam: string | null = null;
    if (url.searchParams.get("scope") === "family") {
      const f = await family(request, db);
      if (f instanceof Response) return f;
      fam = f;
    }
    const where = fam ? "WHERE family = $1" : "";
    const ranked = `SELECT ${COLS}, RANK() OVER (ORDER BY stars DESC)::int AS rank FROM players ${where}`;
    const players = await db.query<RankedPlayer>(
      `SELECT * FROM (${ranked}) r ORDER BY rank, puzzles DESC, name, id LIMIT ${fam ? 500 : TOP}`,
      fam ? [fam] : []
    );
    const mine = me.length
      ? await db.query<RankedPlayer>(
          `SELECT ${COLS}, (SELECT COUNT(*) FROM players q WHERE q.stars > p.stars ${fam ? "AND q.family = $2" : ""})::int + 1 AS rank
           FROM players p WHERE id = ANY($1::text[]) ${fam ? "AND family = $2" : ""}`,
          fam ? [pgArray(me), fam] : [pgArray(me)]
        )
      : [];
    return Response.json({ players, me: mine } satisfies RankingResponse, { headers: { "Cache-Control": "no-store" } });
  });
