// Jigsaw shapes. A picture is cut along a rows x cols grid. A piece is one cell of the grid or, from
// Hard up, two cells side by side, lying or standing. Every inner edge of the grid between two
// pieces has a tab that bulges into one of them, with its own random size, position and height, so
// pieces look different from each other. Two neighbours share one edge curve exactly, so they always fit.

/** Every piece count there is: most levels offer up to 49 pieces, Extreme and Ultimate 30 to 70. */
export const PIECE_COUNTS = [2, 3, 4, 6, 9, 12, 16, 20, 25, 30, 35, 36, 40, 42, 45, 48, 49, 54, 56, 63, 70] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];
export const COUNTS: readonly PieceCount[] = [2, 3, 4, 6, 9, 12, 16, 20, 25, 30, 36, 49];
export const BIG_COUNTS: readonly PieceCount[] = [30, 35, 36, 40, 42, 45, 48, 49, 54, 56, 63, 70];
export const DEFAULT_COUNT: PieceCount = 4;
export const DEFAULT_BIG_COUNT: PieceCount = 30;

/**
 * The rows x cols grid for a piece count. With the picture's shape (`aspect`, width / height) it picks
 * the grid whose pieces come out closest to square, so the whole picture fits without cropping.
 */
export function gridFor(count: PieceCount, aspect = 1): { rows: number; cols: number } {
  return squarestGrid(count, aspect);
}

/** The grid of `cells` cells over a picture of `aspect` whose cells come out closest to square. */
function squarestGrid(cells: number, aspect: number): { rows: number; cols: number } {
  // Start from the squarest grid, wider than tall (2 -> 1x2, 12 -> 3x4).
  let r0 = Math.floor(Math.sqrt(cells));
  while (cells % r0) r0--;
  let best = { rows: r0, cols: cells / r0 };
  let bestScore = Math.abs(Math.log((aspect * r0) / best.cols));
  for (let rows = 1; rows <= cells; rows++) {
    if (cells % rows) continue;
    const cols = cells / rows;
    const score = Math.abs(Math.log((aspect * rows) / cols));
    if (score < bestScore - 1e-9) {
      best = { rows, cols };
      bestScore = score;
    }
  }
  return best;
}

/** Pieces are never longer than this many times their width (or the other way round). */
export const MAX_PIECE_ASPECT = 2;

/** With two-cell pieces, a cell is at most this many times as wide as high (or the other way round). */
export const MAX_CELL_ASPECT = 1.5;

export interface Shape {
  rows: number;
  cols: number;
  /** Width / height of one grid cell: a one-cell piece, or half of a two-cell one. */
  pieceAspect: number;
  /** Width / height of the whole puzzle; the picture is shown in full unless it is extremely long. */
  frameAspect: number;
}

/**
 * How a picture is cut: the grid for the piece count and the shape of the frame and its cells.
 * `mixed` cuts two cells per piece (see dominoes()), on a grid of cells close to square.
 */
export function shapeFor(count: PieceCount, imageAspect: number, mixed = false): Shape {
  const { rows, cols } = squarestGrid(mixed ? 2 * count : count, imageAspect);
  const max = mixed ? MAX_CELL_ASPECT : MAX_PIECE_ASPECT;
  const pieceAspect = Math.min(max, Math.max(1 / max, (imageAspect * rows) / cols));
  return { rows, cols, pieceAspect, frameAspect: (pieceAspect * cols) / rows };
}

/** A piece as a block of grid cells: its top-left cell, and how many cells high and wide it is. */
export interface Block {
  r: number;
  c: number;
  h: number;
  w: number;
}

/** Every cell of the grid is a piece of its own, row by row. */
export function gridPieces(rows: number, cols: number): Block[] {
  return Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols, h: 1, w: 1 }));
}

/**
 * The grid cut into pieces two cells long, some lying (1 x 2) and some standing (2 x 1), mixed at
 * random, and how many lie and how many stand is random too: from about 1 in 10 lying to 9 in 10,
always some of each when the grid allows it.
 * It starts from every piece lying (or standing, for an odd number of columns) and turns random
 * pairs of pieces that make a 2 x 2 square, any such cut can be reached that way; a random lean
 * makes turns towards lying more or less likely than towards standing. Pieces are numbered by
 * their top-left cell, row by row. Needs an even number of cells.
 */
export function dominoes(rows: number, cols: number, rand: () => number): Block[] {
  if ((rows * cols) % 2) throw new Error("Two-cell pieces need an even number of cells");
  // For each cell, the cell its piece shares it with.
  const mate = Array.from({ length: rows * cols }, (_, i) => (cols % 2 === 0 ? (i % 2 ? i - 1 : i + 1) : Math.floor(i / cols) % 2 ? i - cols : i + cols));
  const at = (r: number, c: number) => r * cols + c;
  const pair = (a: number, b: number) => {
    mate[a] = b;
    mate[b] = a;
  };
  /** Turns the pair in the 2 x 2 square at (r, c), if there is one, with the given odds. */
  const turn = (r: number, c: number, toStanding: number, toLying: number): boolean => {
    const [tl, tr, bl, br] = [at(r, c), at(r, c + 1), at(r + 1, c), at(r + 1, c + 1)];
    if (mate[tl] === tr && mate[bl] === br && rand() < toStanding) {
      pair(tl, bl);
      pair(tr, br);
      return true;
    }
    if (mate[tl] === bl && mate[tr] === br && rand() < toLying) {
      pair(tl, tr);
      pair(bl, br);
      return true;
    }
    return false;
  };
  if (rows > 1 && cols > 1) {
    // Odds of turning a lying pair to standing, and back; one of them is 1.
    const lean = Math.exp(5 * (rand() - 0.5));
    for (let k = 0; k < 40 * rows * cols; k++) turn(Math.floor(rand() * (rows - 1)), Math.floor(rand() * (cols - 1)), Math.min(1, 1 / lean), Math.min(1, lean));
    // All one way: turn one pair, so both shapes are there.
    const lying = mate.filter((m, i) => m === i + 1 && m % cols !== 0).length;
    if (lying === 0 || lying === mate.length / 2) {
      const squares = (rows - 1) * (cols - 1);
      const from = Math.floor(rand() * squares);
      for (let k = 0; k < squares; k++) {
        const i = (from + k) % squares;
        if (turn(Math.floor(i / (cols - 1)), i % (cols - 1), 1, 1)) break;
      }
    }
  }
  const blocks: Block[] = [];
  mate.forEach((m, i) => {
    if (m < i) return;
    const r = Math.floor(i / cols);
    const c = i % cols;
    blocks.push(m === i + 1 ? { r, c, h: 1, w: 2 } : { r, c, h: 2, w: 1 });
  });
  return blocks;
}

/** For each grid cell, the piece it belongs to. */
export function owners(blocks: Block[], cols: number): number[] {
  const owner: number[] = [];
  blocks.forEach((b, i) => {
    for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) owner[r * cols + c] = i;
  });
  return owner;
}

/** Piece width and height for a size: the longer side is `size`. */
export function pieceSize(size: number, pieceAspect: number): { pw: number; ph: number } {
  return pieceAspect >= 1
    ? { pw: size, ph: Math.round(size / pieceAspect) }
    : { pw: Math.round(size * pieceAspect), ph: size };
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One inner edge: d = which side the tab bulges to, c = tab position along the edge, k = size, h = height. */
export interface EdgeParams {
  d: 1 | -1;
  c: number;
  k: number;
  h: number;
}

export interface Edges {
  rows: number;
  cols: number;
  /** H[r][c]: the edge between row r and row r + 1 in column c. */
  H: EdgeParams[][];
  /** V[r][c]: the edge between column c and column c + 1 in row r. */
  V: EdgeParams[][];
}

// Limits keep tabs big enough to see but small enough never to reach a third piece.
export const TAB_LIMITS = { c: [0.4, 0.6], k: [0.85, 1.15], h: [0.9, 1.1] } as const;

export function makeEdges(rows: number, cols: number, rand: () => number): Edges {
  const lerp = ([a, b]: readonly [number, number]) => a + rand() * (b - a);
  const p = (): EdgeParams => ({ d: rand() < 0.5 ? 1 : -1, c: lerp(TAB_LIMITS.c), k: lerp(TAB_LIMITS.k), h: lerp(TAB_LIMITS.h) });
  const H = Array.from({ length: Math.max(0, rows - 1) }, () => Array.from({ length: cols }, p));
  const V = Array.from({ length: rows }, () => Array.from({ length: Math.max(0, cols - 1) }, p));
  return { rows, cols, H, V };
}

// The tab as three cubic Bezier curves, in units of the piece size: u runs along the edge
// (relative to the tab centre), v points out of the piece. The template is mirror-symmetric,
// which is what lets the neighbouring piece trace the same curve backwards.
const TAB: Array<[number, number][]> = [
  [[-0.06, 0]],
  [[-0.04, 0.05], [-0.12, 0.08], [-0.11, 0.14]],
  [[-0.1, 0.23], [0.1, 0.23], [0.11, 0.14]],
  [[0.12, 0.08], [0.04, 0.05], [0.06, 0]]
];

/** Furthest a tab reaches beyond its piece, as a fraction of the piece's shorter side. */
export const MAX_TAB_REACH = 0.23 * TAB_LIMITS.k[1] * TAB_LIMITS.h[1];

export type Pt = [number, number];

/**
 * An outline as a start point followed by segments: a 1-point segment is a line, a 3-point
 * segment is a cubic Bezier (two control points and the end point).
 */
export interface Outline {
  start: Pt;
  segments: Pt[][];
}

// Tabs are sized by the piece's shorter side `t`, so a long piece gets the same tabs as a square one.
function edgeSegments(p0: Pt, p1: Pt, normal: Pt, t: number, prm: EdgeParams | null, dir: number): Pt[][] {
  if (!prm || !dir) return [[p1]];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const ex = (p1[0] - p0[0]) / len;
  const ey = (p1[1] - p0[1]) / len;
  const at = (q: [number, number]): Pt => {
    const u = prm.c * len + q[0] * prm.k * t;
    const v = q[1] * prm.k * prm.h * t * dir;
    return [p0[0] + u * ex + v * normal[0], p0[1] + u * ey + v * normal[1]];
  };
  return [[at(TAB[0][0])], TAB[1].map(at), TAB[2].map(at), TAB[3].map(at), [p1]];
}

const flip = (p: EdgeParams): EdgeParams => ({ ...p, c: 1 - p.c });

/** Outline of a piece for grid cells `pw` wide and `ph` high, in board coordinates. */
export function pieceOutline(b: Block, pw: number, ph: number, E: Edges): Outline {
  const t = Math.min(pw, ph);
  const pt = (r: number, c: number): Pt => [c * pw, r * ph];
  const segs: Pt[][] = [];
  // Clockwise, one cell edge at a time: top, right, bottom, left. Bottom and left are traced
  // backwards, hence flip(). Edges on the picture's border are straight.
  for (let c = b.c; c < b.c + b.w; c++) {
    const e = b.r > 0 ? E.H[b.r - 1][c] : null;
    segs.push(...edgeSegments(pt(b.r, c), pt(b.r, c + 1), [0, -1], t, e, e ? -e.d : 0));
  }
  for (let r = b.r; r < b.r + b.h; r++) {
    const e = b.c + b.w < E.cols ? E.V[r][b.c + b.w - 1] : null;
    segs.push(...edgeSegments(pt(r, b.c + b.w), pt(r + 1, b.c + b.w), [1, 0], t, e, e ? e.d : 0));
  }
  for (let c = b.c + b.w - 1; c >= b.c; c--) {
    const e = b.r + b.h < E.rows ? E.H[b.r + b.h - 1][c] : null;
    segs.push(...edgeSegments(pt(b.r + b.h, c + 1), pt(b.r + b.h, c), [0, 1], t, e && flip(e), e ? e.d : 0));
  }
  for (let r = b.r + b.h - 1; r >= b.r; r--) {
    const e = b.c > 0 ? E.V[r][b.c - 1] : null;
    segs.push(...edgeSegments(pt(r + 1, b.c), pt(r, b.c), [-1, 0], t, e && flip(e), e ? -e.d : 0));
  }
  return { start: pt(b.r, b.c), segments: segs };
}

/** Builds a canvas path from an outline, shifted by (-ox, -oy). */
export function outlinePath(o: Outline, ox = 0, oy = 0): Path2D {
  const p = new Path2D();
  p.moveTo(o.start[0] - ox, o.start[1] - oy);
  for (const seg of o.segments) {
    if (seg.length === 1) p.lineTo(seg[0][0] - ox, seg[0][1] - oy);
    else p.bezierCurveTo(seg[0][0] - ox, seg[0][1] - oy, seg[1][0] - ox, seg[1][1] - oy, seg[2][0] - ox, seg[2][1] - oy);
  }
  p.closePath();
  return p;
}

/** Source rectangle that crops an image to `aspect` (width / height), centred. */
export function cropRect(w: number, h: number, aspect: number): [sx: number, sy: number, sw: number, sh: number] {
  if (w / h > aspect) {
    const nw = h * aspect;
    return [(w - nw) / 2, 0, nw, h];
  }
  const nh = w / aspect;
  return [0, (h - nh) / 2, w, nh];
}
