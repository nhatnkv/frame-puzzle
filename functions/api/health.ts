import { withDb, type PagesFunction } from "./_lib";

// GET /api/health: shows the API is running and can reach the shared database.
export const onRequestGet: PagesFunction = ({ env, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    try {
      await db.query("SELECT 1");
      return Response.json({ ok: true, db: true });
    } catch (e) {
      return Response.json({ ok: false, db: false, error: String(e) }, { status: 503 });
    }
  });
