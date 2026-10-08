// Difficulty levels. Easy pieces always face the right way. Medium pieces may start mirrored
// left to right, and a tap flips them back. Hard pieces may start turned a quarter, half or three
// quarters of the way round, and each tap turns them a quarter turn clockwise. Extreme and
// Ultimate turn pieces like Hard, and a piece dropped into a slot that is not its own, or the wrong
// way round, sends every piece in the frame back out. Hints get scarcer as levels get harder: 5 at
// Hard, a growing cost in stars at Extreme, none at Ultimate, where mistakes cost stars instead. A picture is
// done only when every piece is in its own slot and the right way round.

export type Level = "easy" | "medium" | "hard" | "extreme" | "ultimate";

export const LEVELS: readonly Level[] = ["easy", "medium", "hard", "extreme", "ultimate"];
export const DEFAULT_LEVEL: Level = "easy";

/** How many ways a piece can face: 1 (always right), 2 (mirrored or not), 4 (quarter turns). */
const POSES: Record<Level, number> = { easy: 1, medium: 2, hard: 4, extreme: 4, ultimate: 4 };

/** Stars per piece, as a multiple of Easy's. */
const STARS: Record<Level, number> = { easy: 1, medium: 3, hard: 5, extreme: 10, ultimate: 15 };

/** Whether pieces turn a quarter at a time (Hard and up), so their slots must fit them turned. */
export function turns(level: Level): boolean {
  return POSES[level] === 4;
}

/** Whether a piece dropped into a slot that is not its own sends every piece in the frame back out. */
export function scattersOnMistake(level: Level): boolean {
  return level === "extreme" || level === "ultimate";
}

/** Whether each such mistake also costs stars; see `starCost`. */
export function costsStars(level: Level): boolean {
  return level === "ultimate";
}

/** Ultimate takes stars for every mistake, so it can only be played while the child has some. */
export function playable(level: Level, stars: number): boolean {
  return level !== "ultimate" || stars > 0;
}

/** How many hints one puzzle allows: 5 at Hard, none at Ultimate, no limit otherwise. */
export function hintLimit(level: Level): number {
  return level === "hard" ? 5 : level === "ultimate" ? 0 : Infinity;
}

/** Whether each hint costs stars (Extreme); see `hintPercent`. */
export function hintCostsStars(level: Level): boolean {
  return level === "extreme";
}

/**
 * At Extreme, the share of the child's stars the next hint costs, in percent: it follows the
 * Fibonacci numbers, 1, 1, 2, 3, 5, 8 and on, counting the hints already used in this puzzle.
 */
export function hintPercent(used: number): number {
  let [a, b] = [1, 1];
  for (let i = 0; i < used; i++) [a, b] = [b, a + b];
  return a;
}

/**
 * Stars a mistake (Ultimate, 1%) or a hint (Extreme, see `hintPercent`) costs: that share of the
 * child's stars, rounded up so it is never free, and never more than they have.
 */
export function starCost(total: number, percent = 1): number {
  return total > 0 ? Math.min(total, Math.ceil((total * percent) / 100)) : 0;
}

export function isLevel(v: string): v is Level {
  return (LEVELS as readonly string[]).includes(v);
}

/**
 * A piece's pose counts the taps since it faced the right way: at medium, odd means mirrored; at
 * hard, it is the number of quarter turns clockwise. It only ever goes up, so a turn always
 * animates clockwise; `pose % 2` or `pose % 4` is the way it faces.
 */
export function facesRight(level: Level, pose: number): boolean {
  return pose % POSES[level] === 0;
}

/** The pose after the hint puts the piece the right way round, without turning it backwards. */
export function rightPose(level: Level, pose: number): number {
  const n = POSES[level];
  return Math.ceil(pose / n) * n;
}

/**
 * Starting poses for `n` pieces: at medium, half of them mirrored (rounded up); at hard and up,
 * at least half of them turned, each by one, two or three quarter turns.
 */
export function dealPoses(level: Level, n: number, rand: () => number): number[] {
  const poses = Array<number>(n).fill(0);
  if (level === "easy") return poses;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let k = n - 1; k > 0; k--) {
    const q = Math.floor(rand() * (k + 1));
    [order[k], order[q]] = [order[q], order[k]];
  }
  const turned = Math.ceil(n / 2);
  order.forEach((piece, i) => {
    if (level === "medium") poses[piece] = i < turned ? 1 : 0;
    else poses[piece] = i < turned ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 4);
  });
  return poses;
}

/** CSS for a piece's pose, as the `scale` and `rotate` properties (its position uses left/top). */
export function poseStyle(level: Level, pose: number): { scale: string; rotate: string } {
  if (level === "medium") return { scale: pose % 2 ? "-1 1" : "1 1", rotate: "0deg" };
  if (turns(level)) return { scale: "1 1", rotate: `${pose * 90}deg` };
  return { scale: "1 1", rotate: "0deg" };
}

/**
 * Maps a point given relative to a piece's centre on screen back into the piece's own,
 * unturned coordinates (also relative to its centre), to test it against the piece's shape.
 */
export function unturn(level: Level, pose: number, dx: number, dy: number): [number, number] {
  if (level === "medium") return [pose % 2 ? -dx : dx, dy];
  if (turns(level)) {
    // Screen y points down, so a quarter turn clockwise maps (x, y) to (-y, x); undo it.
    switch (pose % 4) {
      case 1:
        return [dy, -dx];
      case 2:
        return [-dx, -dy];
      case 3:
        return [-dy, dx];
    }
  }
  return [dx, dy];
}

/** Half the width and height a piece covers on screen in its pose. */
export function poseExtent(level: Level, pose: number, w: number, h: number): [number, number] {
  return turns(level) && pose % 2 ? [h / 2, w / 2] : [w / 2, h / 2];
}

/** Stars per piece: 2 at Easy, and 3, 5, 10 and 15 times that at Medium, Hard, Extreme and Ultimate. */
export function starsPerPiece(level: Level): number {
  return 2 * STARS[level];
}
