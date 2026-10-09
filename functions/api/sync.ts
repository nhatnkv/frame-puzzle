import { SYNCED_TABLES } from "../../src/db/schema";
import { fail, family, type PagesFunction } from "./_lib";

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
export const onRequestPost: PagesFunction = async ({ request, env }) => {
  const fam = await family(request, env);
  if (fam instanceof Response) return fam;
  let body: SyncRequest;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Not JSON");
  }
  const since = Number(body.since) || 0;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES || !changes.every(valid)) return fail(400, "Bad changes");

  if (changes.length) {
    // One batch is one transaction, so every row of this request gets the same new rev.
    await env.DB.batch([
      env.DB.prepare("UPDATE families SET rev = rev + 1 WHERE id = ?").bind(fam),
      ...changes.map((c) =>
        env.DB.prepare(
          `INSERT INTO rows (family, tbl, id, data, rev) VALUES (?, ?, ?, ?, (SELECT rev FROM families WHERE id = ?))
           ON CONFLICT (family, tbl, id) DO UPDATE SET data = excluded.data, rev = excluded.rev`
        ).bind(fam, c.t, c.id, c.data === null ? null : JSON.stringify(c.data), fam)
      )
    ]);
  }

  const [{ results }, head] = await Promise.all([
    env.DB.prepare("SELECT tbl, id, data, rev FROM rows WHERE family = ? AND rev > ? ORDER BY rev LIMIT ?")
      .bind(fam, since, PAGE + 1)
      .all<{ tbl: string; id: number; data: string | null; rev: number }>(),
    env.DB.prepare("SELECT rev FROM families WHERE id = ?").bind(fam).first<{ rev: number }>()
  ]);
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
};
