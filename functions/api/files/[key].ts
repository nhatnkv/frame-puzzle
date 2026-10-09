import { fail, family, type PagesFunction } from "../_lib";

/** D1 keeps at most 2 MB in one value; the app's pictures are well under 1 MB. */
const MAX_BYTES = 2_000_000;
const KEY = /^img-[a-z0-9]{1,16}-[a-z0-9]{1,16}$/;

function key(params: Record<string, string | string[]>): string | null {
  const k = String(params.key ?? "");
  return KEY.test(k) ? k : null;
}

// GET /api/files/KEY: one of the family's image files.
export const onRequestGet: PagesFunction = async ({ request, env, params }) => {
  const fam = await family(request, env);
  if (fam instanceof Response) return fam;
  const k = key(params);
  if (!k) return fail(400, "Bad key");
  const row = await env.DB.prepare("SELECT type, bytes FROM files WHERE family = ? AND key = ?")
    .bind(fam, k)
    .first<{ type: string; bytes: ArrayBuffer | number[] }>();
  if (!row) return fail(404, "No such file");
  const bytes = row.bytes instanceof ArrayBuffer ? row.bytes : new Uint8Array(row.bytes);
  return new Response(bytes, { headers: { "Content-Type": row.type, "Cache-Control": "private, max-age=31536000, immutable" } });
};

// PUT /api/files/KEY: saves an image file. Keys are never reused, so a second upload changes nothing.
export const onRequestPut: PagesFunction = async ({ request, env, params }) => {
  const fam = await family(request, env);
  if (fam instanceof Response) return fam;
  const k = key(params);
  if (!k) return fail(400, "Bad key");
  const type = request.headers.get("Content-Type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail(415, "Not an image");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) return fail(413, "Too big");
  await env.DB.prepare("INSERT OR IGNORE INTO files (family, key, type, bytes) VALUES (?, ?, ?, ?)")
    .bind(fam, k, type, bytes)
    .run();
  return new Response(null, { status: 204 });
};
