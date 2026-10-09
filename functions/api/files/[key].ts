import { fail, family, withDb, type PagesFunction } from "../_lib";

/** The app's pictures are well under 1 MB; this keeps one request from filling the database. */
const MAX_BYTES = 2_000_000;
const KEY = /^img-[a-z0-9]{1,16}-[a-z0-9]{1,16}$/;

function key(params: Record<string, string | string[]>): string | null {
  const k = String(params.key ?? "");
  return KEY.test(k) ? k : null;
}

function toBase64(bytes: ArrayBuffer): string {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// GET /api/files/KEY: one of the family's image files.
export const onRequestGet: PagesFunction = ({ request, env, params, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    const fam = await family(request, db);
    if (fam instanceof Response) return fam;
    const k = key(params);
    if (!k) return fail(400, "Bad key");
    // Bytes travel as base64 text, which every Postgres driver passes the same way.
    const [row] = await db.query<{ type: string; b64: string }>(
      "SELECT type, encode(bytes, 'base64') AS b64 FROM files WHERE family = $1 AND key = $2",
      [fam, k]
    );
    if (!row) return fail(404, "No such file");
    return new Response(fromBase64(row.b64.replace(/\s/g, "")), {
      headers: { "Content-Type": row.type, "Cache-Control": "private, max-age=31536000, immutable" }
    });
  });

// PUT /api/files/KEY: saves an image file. Keys are never reused, so a second upload changes nothing.
export const onRequestPut: PagesFunction = ({ request, env, params, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    const fam = await family(request, db);
    if (fam instanceof Response) return fam;
    const k = key(params);
    if (!k) return fail(400, "Bad key");
    const type = request.headers.get("Content-Type") ?? "";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail(415, "Not an image");
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return fail(413, "Too big");
    await db.query(
      `INSERT INTO files (family, key, type, bytes) VALUES ($1, $2, $3, decode($4, 'base64'))
       ON CONFLICT (family, key) DO NOTHING`,
      [fam, k, type, toBase64(bytes)]
    );
    return new Response(null, { status: 204 });
  });
