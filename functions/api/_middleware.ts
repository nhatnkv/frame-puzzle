import type { PagesFunction } from "./_lib";

// The copy of the app still on GitHub Pages calls this API too, so a family whose data lives
// there can start sharing and bring it over to the Cloudflare address.
const ORIGINS = ["https://nhatnkv.github.io"];

export const onRequest: PagesFunction = async (context) => {
  const origin = context.request.headers.get("Origin") ?? "";
  const allowed = ORIGINS.includes(origin);
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: allowed
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PUT",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400",
            Vary: "Origin"
          }
        : {}
    });
  }
  const res = await (context as unknown as { next(): Promise<Response> }).next();
  if (!allowed) return res;
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", origin);
  out.headers.append("Vary", "Origin");
  return out;
};
