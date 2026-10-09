// Race mode: the puzzle has a time limit, set in minutes. When time runs out the puzzle ends and
// the child gets stars for each piece done: a full picture's stars shared out over its pieces,
// rounded up, so 1 piece of a 6 piece, 100 star puzzle earns 17.

export type Mode = "normal" | "race";

export const RACE_MIN = 1;
export const RACE_MAX = 30;
export const RACE_DEFAULT = 5;

export function isMode(v: string): v is Mode {
  return v === "normal" || v === "race";
}

/** Minutes kept between RACE_MIN and RACE_MAX, whole. */
export function clampMinutes(n: number): number {
  return Number.isFinite(n) ? Math.min(RACE_MAX, Math.max(RACE_MIN, Math.round(n))) : RACE_DEFAULT;
}

/** Stars for `done` of `pieces` pieces when the whole picture earns `full`. */
export function raceStars(full: number, done: number, pieces: number): number {
  if (pieces <= 0 || done <= 0) return 0;
  return Math.min(full, Math.ceil((full * Math.min(done, pieces)) / pieces));
}

/** Time left as m:ss, rounded up to the second. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
