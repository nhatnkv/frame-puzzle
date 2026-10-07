// Where the frame and the waiting pieces go on the puzzle screen.
// Waiting pieces sit in a grid of cells around the frame (left, right, above, below). A cell is
// 1.6x the piece size, which is more than a piece plus its tabs, so loose pieces never overlap.

import { MAX_TAB_REACH } from "./geometry";

export const CELL_FACTOR = 1.6;
export const FRAME_BORDER = 18;
const PAD = 12;
const MAX_BOARD = 540;
const MIN_PIECE = 40;

export type Cell = [x: number, y: number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export interface Layout {
  /** Piece size (one grid square of the picture). */
  s: number;
  /** Board (picture area) position and size inside the playfield. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** Centres of the waiting cells. */
  cells: Cell[];
}

/** `keepOut` is an area no waiting cell may touch (the reference picture in the corner). */
export function trayCells(
  s: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  W: number,
  H: number,
  keepOut: Rect | null = null
): Cell[] {
  const f = s * CELL_FACTOR;
  const cells: Cell[] = [];
  const grid = (x0: number, y0: number, w: number, h: number) => {
    const nc = Math.floor(w / f);
    const nr = Math.floor(h / f);
    if (nc < 1 || nr < 1) return;
    const gx = (w - nc * f) / 2;
    const gy = (h - nr * f) / 2;
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) cells.push([x0 + gx + (j + 0.5) * f, y0 + gy + (i + 0.5) * f]);
  };
  const left = bx - FRAME_BORDER - PAD;
  const right = bx + bw + FRAME_BORDER + PAD;
  const top = by - FRAME_BORDER - PAD;
  const bottom = by + bh + FRAME_BORDER + PAD;
  grid(PAD, PAD, left - PAD, H - 2 * PAD); // left of the frame
  grid(right, PAD, W - PAD - right, H - 2 * PAD); // right of the frame
  grid(left, PAD, right - left, top - PAD); // above
  grid(left, bottom, right - left, H - bottom - PAD); // below
  if (!keepOut) return cells;
  // A piece reaches this far from its cell centre, tabs and shadow included.
  const reach = s * (0.5 + MAX_TAB_REACH) + 4;
  return cells.filter(([x, y]) => !overlaps({ x: x - reach, y: y - reach, w: 2 * reach, h: 2 * reach }, keepOut));
}

/** The biggest piece size that still leaves a waiting cell for every piece, outside `keepOut`. */
export function layoutFor(rows: number, cols: number, W: number, H: number, keepOut: Rect | null = null): Layout {
  const n = rows * cols;
  const maxBoard = Math.min(MAX_BOARD, H - 2 * (FRAME_BORDER + PAD));
  for (let s = Math.floor(Math.min(maxBoard / cols, maxBoard / rows)); s >= MIN_PIECE; s -= 2) {
    const bw = cols * s;
    const bh = rows * s;
    const bx = Math.round((W - bw) / 2);
    const by = Math.round((H - bh) / 2);
    const frame = { x: bx - FRAME_BORDER, y: by - FRAME_BORDER, w: bw + 2 * FRAME_BORDER, h: bh + 2 * FRAME_BORDER };
    if (keepOut && overlaps(frame, keepOut)) continue;
    const cells = trayCells(s, bx, by, bw, bh, W, H, keepOut);
    if (cells.length >= n) return { s, bx, by, bw, bh, cells };
  }
  throw new Error(`No room for ${n} pieces in ${W}x${H}`);
}

/** Margin around a piece's square so its tabs (and their outline stroke) fit inside the piece's canvas. */
export function pieceMargin(s: number): number {
  return Math.ceil(s * MAX_TAB_REACH + 3);
}

/** White border of the reference picture's card, and the space kept clear around the card. */
export const REF_PAD = 6;
const REF_GAP = 10;

export interface Plan {
  layout: Layout;
  /** The reference picture's card, in playfield units; its top is in the top bar (y < 0). */
  ref: Rect;
}

/**
 * Lays out the puzzle with the whole picture shown as a reference in the top-right corner. The card
 * hangs from the top bar at `max` size; the pieces get smaller when they need the room (Carrick chose
 * a big reference over the biggest pieces). The card only shrinks if the pieces cannot fit at all.
 */
export function layoutWithReference(
  rows: number,
  cols: number,
  W: number,
  H: number,
  opts: { top: number; right: number; max: number }
): Plan {
  const a = cols / rows;
  for (let m = opts.max; ; m -= 4) {
    const w = Math.round(m * Math.min(1, a)) + 2 * REF_PAD;
    const h = Math.round(m * Math.min(1, 1 / a)) + 2 * REF_PAD;
    const ref = { x: W - opts.right - w, y: opts.top, w, h };
    const keepOut = { x: ref.x - REF_GAP, y: ref.y - REF_GAP, w: w + 2 * REF_GAP, h: h + 2 * REF_GAP };
    if (keepOut.y + keepOut.h <= 0 || m <= 24) return { layout: layoutFor(rows, cols, W, H), ref };
    try {
      return { layout: layoutFor(rows, cols, W, H, keepOut), ref };
    } catch {
      // No room at this size; try a smaller card.
    }
  }
}
