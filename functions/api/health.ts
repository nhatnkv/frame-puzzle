import type { PagesFunction } from "./_lib";

// GET /api/health: shows the API is running and can reach the shared database.
export const onRequestGet: PagesFunction = async ({ env }) => {
  try {
    await env.DB.prepare("SELECT 1").first();
    return Response.json({ ok: true, db: true });
  } catch (e) {
    return Response.json({ ok: false, db: false, error: String(e) }, { status: 503 });
  }
};
