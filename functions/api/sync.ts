import { SYNCED_TABLES } from "../../src/db/schema";
import { fail, family, withDb, type PagesFunction } from "./_lib";

/** Most rows one request may send. */
export const MAX_CHANGES = 500;
/** Most rows one response returns; a sync asks again while `more` is true. */
export const PAGE = 2000;

export interface Change {
  t: string;
  id: number;
  /** The row's columns, or null when the row was deleted. */
  data: Record<string, unknown> | null;
}

export interface SyncRequest {
  /** The family's rev this device has already seen. */
  since: number;
  changes: Change[];
}

export interface SyncResponse {
  /** Pass as `since` next time. */
  rev: number;
  rows: Change[];
  more: boolean;
}

function valid(c: Change): boolean {
  return (
    (SYNCED_TABLES as readonly string[]).includes(c.t) &&
    Number.isSafeInteger(c.id) &&
    (c.data === null || (typeof c.data === "object" && !Array.isArray(c.data)))
  );
}

// POST /api/sync: saves the rows this device changed, then returns every row changed since `since`
// (this device's own included). A row changed on two devices keeps the change that arrived last.
export const onRequestPost: PagesFunction = ({ request, env, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    const fam = await family(request, db);
    if (fam instanceof Response) return fam;
    let body: SyncRequest;
    try {
      body = await request.json();
    } catch {
      return fail(400, "Not JSON");
    }
    const since = Number(body.since) || 0;
    const list = Array.isArray(body.changes) ? body.changes : [];
    if (list.length > MAX_CHANGES || !list.every(valid)) return fail(400, "Bad changes");
    // One statement cannot write a row twice: the last change to a row wins.
    const changes = [...new Map(list.map((c) => [`${c.t}:${c.id}`, c])).values()];

    if (changes.length) {
      await db.begin(async (tx) => {
        // Taking the next rev locks the family's row until this commits, so changes are committed
        // in rev order and a device that has seen rev N has seen everything up to N.
        const [{ rev }] = await tx.query<{ rev: string }>(
          "UPDATE families SET rev = rev + 1 WHERE id = $1 RETURNING rev::text AS rev",
          [fam]
        );
        const params: unknown[] = [fam, rev];
        const values = changes.map((c) => {
          params.push(c.t, String(c.id), c.data === null ? null : JSON.stringify(c.data));
          const n = params.length;
          // ::text first: the driver would encode a jsonb parameter as JSON a second time.
          return `($1, $${n - 2}, $${n - 1}::bigint, $${n}::text::jsonb, $2::bigint)`;
        });
        await tx.query(
          `INSERT INTO rows (family, tbl, id, data, rev) VALUES ${values.join(", ")}
           ON CONFLICT (family, tbl, id) DO UPDATE SET data = excluded.data, rev = excluded.rev`,
          params
        );
      });
    }

    // Ids and revs stay below 2^53, so float8 holds them exactly and the driver returns numbers.
    const results = await db.query<{ tbl: string; id: number; data: string | null; rev: number }>(
      `SELECT tbl, id::float8 AS id, data::text AS data, rev::float8 AS rev FROM rows
       WHERE family = $1 AND rev > $2 ORDER BY rev LIMIT $3`,
      [fam, since, PAGE + 1]
    );
    const [head] = await db.query<{ rev: number }>("SELECT rev::float8 AS rev FROM families WHERE id = $1", [fam]);
    let page = results;
    let rev = head?.rev ?? since;
    const more = results.length > PAGE;
    if (more) {
      // Never split one rev across pages: drop the last rev's rows, the next page starts with them.
      const last = results[PAGE].rev;
      page = results.filter((r) => r.rev < last);
      rev = last - 1;
    }
    return Response.json({
      rev,
      more,
      rows: page.map((r) => ({ t: r.tbl, id: r.id, data: r.data === null ? null : JSON.parse(r.data) }))
    } satisfies SyncResponse);
  });
