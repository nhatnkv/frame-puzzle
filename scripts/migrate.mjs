// Applies migrations/*.sql to the Postgres database at DATABASE_URL, in name order, each once and
// each in its own transaction. Used by the deploy workflow and the tests.
//   DATABASE_URL=postgres://... node scripts/migrate.mjs

import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

export async function migrate(url, dir = new URL("../migrations/", import.meta.url)) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(name)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(new URL(name, dir), "utf8"));
        await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
      });
      console.log(`applied ${name}`);
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
  await migrate(process.env.DATABASE_URL);
}
