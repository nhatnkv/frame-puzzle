// Difficulty levels. Easy pieces always face the right way. Medium pieces may start mirrored
// left to right, and a tap flips them back. Hard pieces may start turned a quarter, half or three
// quarters of the way round, and each tap turns them a quarter turn clockwise. A picture is done
// only when every piece is in its own slot and the right way round.

export type Level = "easy" | "medium" | "hard";

export const LEVELS: readonly Level[] = ["easy", "medium", "hard"];
export const DEFAULT_LEVEL: Level = "easy";

/** How many ways a piece can face: 1 (always right), 2 (mirrored or not), 4 (quarter turns). */
const POSES: Record<Level, number> = { easy: 1, medium: 2, hard: 4 };

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
 * Starting poses for `n` pieces: at medium, half of them mirrored (rounded up); at hard, at
 * least half of them turned, each by one, two or three quarter turns.
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
  if (level === "hard") return { scale: "1 1", rotate: `${pose * 90}deg` };
  return { scale: "1 1", rotate: "0deg" };
}

/**
 * Maps a point given relative to a piece's centre on screen back into the piece's own,
 * unturned coordinates (also relative to its centre), to test it against the piece's shape.
 */
export function unturn(level: Level, pose: number, dx: number, dy: number): [number, number] {
  if (level === "medium") return [pose % 2 ? -dx : dx, dy];
  if (level === "hard") {
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
  return level === "hard" && pose % 2 ? [h / 2, w / 2] : [w / 2, h / 2];
}

/** Stars per piece: harder levels earn more. */
export function starsPerPiece(level: Level): number {
  return level === "hard" ? 4 : level === "medium" ? 3 : 2;
}
