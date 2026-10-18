// Row ids are random, so rows made on different devices of one family never collide when they
// are shared. They stay below 2^53, the largest whole number JavaScript and JSON keep exactly,
// and above 2^50, far from the small ids rows made before sharing existed already have.

const LOW = 2 ** 50;
const HIGH = 2 ** 53;

export function newId(): number {
  return LOW + Math.floor(Math.random() * (HIGH - LOW));
}

/**
 * The same id on every device for the same name, in the range of `newId`, for rows that each
 * device adds by itself (the gifts that come with the app), so a family ends up with one row.
 */
export function fixedId(name: string): number {
  // 64-bit FNV-1a.
  let h = 0xcbf29ce484222325n;
  for (const b of new TextEncoder().encode(name)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  return LOW + Number(h % BigInt(HIGH - LOW));
}
