// Jigsaw shapes. A picture is cut into a rows x cols grid. Every inner edge has a tab that bulges
// into one of its two pieces, with its own random size, position and height, so pieces look
// different from each other. Two neighbours share one edge curve exactly, so they always fit.

export const PIECE_COUNTS = [2, 3, 4, 6, 9, 12, 16, 20, 25, 30, 36, 49] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];
export const DEFAULT_COUNT: PieceCount = 4;

const GRIDS: Record<PieceCount, [rows: number, cols: number]> = {
  2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 9: [3, 3], 12: [3, 4],
  16: [4, 4], 20: [4, 5], 25: [5, 5], 30: [5, 6], 36: [6, 6], 49: [7, 7]
};

export function gridFor(count: PieceCount): { rows: number; cols: number } {
  const [rows, cols] = GRIDS[count];
  return { rows, cols };
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

/** Furthest a tab reaches beyond its piece, as a fraction of the piece size. */
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

function edgeSegments(p0: Pt, p1: Pt, normal: Pt, s: number, prm: EdgeParams | null, dir: number): Pt[][] {
  if (!prm || !dir) return [[p1]];
  const ux = (p1[0] - p0[0]) / s;
  const uy = (p1[1] - p0[1]) / s;
  const at = (q: [number, number]): Pt => {
    const u = prm.c + q[0] * prm.k;
    const v = q[1] * prm.k * prm.h * dir;
    return [p0[0] + (u * ux + v * normal[0]) * s, p0[1] + (u * uy + v * normal[1]) * s];
  };
  return [[at(TAB[0][0])], TAB[1].map(at), TAB[2].map(at), TAB[3].map(at), [p1]];
}

const flip = (p: EdgeParams): EdgeParams => ({ ...p, c: 1 - p.c });

/** Outline of piece (r, c) with piece size s, in board coordinates. */
export function pieceOutline(r: number, c: number, s: number, E: Edges): Outline {
  const x0 = c * s;
  const y0 = r * s;
  const TL: Pt = [x0, y0];
  const TR: Pt = [x0 + s, y0];
  const BR: Pt = [x0 + s, y0 + s];
  const BL: Pt = [x0, y0 + s];
  const segs: Pt[][] = [];
  // Clockwise: top, right, bottom, left. Bottom and left are traced backwards, hence flip().
  segs.push(...(r > 0 ? edgeSegments(TL, TR, [0, -1], s, E.H[r - 1][c], -E.H[r - 1][c].d) : [[TR]]));
  segs.push(...(c < E.cols - 1 ? edgeSegments(TR, BR, [1, 0], s, E.V[r][c], E.V[r][c].d) : [[BR]]));
  segs.push(...(r < E.rows - 1 ? edgeSegments(BR, BL, [0, 1], s, flip(E.H[r][c]), E.H[r][c].d) : [[BL]]));
  segs.push(...(c > 0 ? edgeSegments(BL, TL, [-1, 0], s, flip(E.V[r][c - 1]), -E.V[r][c - 1].d) : [[TL]]));
  return { start: TL, segments: segs };
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
