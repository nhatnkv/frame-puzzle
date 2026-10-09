// Shared pieces of the API: the Pages Functions types it uses (so the app does not need
// @cloudflare/workers-types), the connection to the family's Postgres database, and finding the
// family a request belongs to.

import postgres from "postgres";

export interface Env {
  /** postgres://user:password@host/db, set as a secret on the Pages project. */
  DATABASE_URL: string;
  /** Cloudflare Hyperdrive in front of the same database, when the deploy could set it up. */
  HYPERDRIVE?: { connectionString: string };
}

export type PagesFunction = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
}) => Response | Promise<Response>;

/** The few database calls the API makes. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs `fn` in one transaction. */
  begin<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Sql = postgres.Sql | postgres.TransactionSql;

function wrap(sql: Sql): Db {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    begin: <T>(fn: (tx: Db) => Promise<T>) =>
      (sql as postgres.Sql).begin((tx) => fn(wrap(tx))) as Promise<T>
  };
}

/**
 * Runs `fn` with a database connection made for this request (a Worker cannot keep one between
 * requests), and closes it once the response is sent.
 */
export async function withDb(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
  fn: (db: Db) => Promise<Response>
): Promise<Response> {
  // Hyperdrive keeps connections to the database open between requests, so each sync skips the
  // connection set-up; without it the API connects to the database directly.
  const url = env.HYPERDRIVE?.connectionString || env.DATABASE_URL;
  if (!url) return fail(503, "No database configured");
  // fetch_types off: the API uses only built-in types, and it saves a round trip per request.
  const sql = postgres(url, { max: 1, fetch_types: false, prepare: false, onnotice: () => {} });
  try {
    return await fn(wrap(sql));
  } finally {
    waitUntil(sql.end());
  }
}

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
export async function family(request: Request, db: Db): Promise<string | Response> {
  const code = cleanCode(request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (!code) return fail(401, "No family code");
  const id = await familyId(code);
  const [row] = await db.query("SELECT id FROM families WHERE id = $1", [id]);
  return row ? id : fail(401, "Unknown family code");
}
