import { CODE_ALPHABET, CODE_LENGTH, familyId, withDb, type PagesFunction } from "./_lib";

// POST /api/families: starts a new family and returns its code. The code is the family's only key:
// every device that has it can read and change the family's data.
export const onRequestPost: PagesFunction = ({ env, waitUntil }) =>
  withDb(env, waitUntil, async (db) => {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    await db.query("INSERT INTO families (id) VALUES ($1)", [await familyId(code)]);
    return Response.json({ code });
  });
