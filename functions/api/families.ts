import { CODE_ALPHABET, CODE_LENGTH, familyId, type PagesFunction } from "./_lib";

// POST /api/families: starts a new family and returns its code. The code is the family's only key:
// every device that has it can read and change the family's data.
export const onRequestPost: PagesFunction = async ({ env }) => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  await env.DB.prepare("INSERT INTO families (id, rev, created_at) VALUES (?, 0, ?)")
    .bind(await familyId(code), new Date().toISOString())
    .run();
  return Response.json({ code });
};
