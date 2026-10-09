// Shared pieces of the API: the few Cloudflare types it uses (so the app does not need
// @cloudflare/workers-types) and finding the family a request belongs to.

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Database;
}

export type PagesFunction = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
}) => Response | Promise<Response>;

export function fail(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** Letters and digits that cannot be mistaken for each other when a parent types the code. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;

/** The code without dashes or spaces, in capitals; null when it cannot be a family code. */
export function cleanCode(code: string): string | null {
  const c = code.toUpperCase().replace(/[\s-]/g, "");
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

export async function familyId(code: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The family whose code is in the Authorization header, or a 401 response. */
export async function family(request: Request, env: Env): Promise<string | Response> {
  const code = cleanCode(request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (!code) return fail(401, "No family code");
  const id = await familyId(code);
  const row = await env.DB.prepare("SELECT id FROM families WHERE id = ?").bind(id).first();
  return row ? id : fail(401, "Unknown family code");
}
