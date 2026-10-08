// Where the frame and the waiting pieces go on the puzzle screen.
// Waiting pieces sit in a grid of square cells around the frame (left, right, above, below). A cell
// is the piece's longer side plus 0.6x its shorter side, which is more than a piece plus its tabs,
// so loose pieces never overlap.

import { MAX_TAB_REACH, pieceSize } from "./geometry";

export const CELL_FACTOR = 1.6;
export const FRAME_BORDER = 18;
const PAD = 12;
/** The frame is at most this high, and this wide unless the picture is wide. */
const MAX_BOARD = 540;
const MAX_BOARD_WIDE = 720;
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
  /** Piece width and height (one grid cell of the picture). */
  pw: number;
  ph: number;
  /** Side of a square waiting cell. */
  cell: number;
  /** Board (picture area) position and size inside the playfield. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** Centres of the waiting cells. */
  cells: Cell[];
}

/**
 * The size a waiting cell is made for: a grid cell, or for pieces two cells long (`span` 2), the
 * longest such piece, as long as two of the longer cell side and as wide as the shorter one.
 */
export function loosePiece(pw: number, ph: number, span = 1): { tw: number; th: number } {
  return span === 1 ? { tw: pw, th: ph } : { tw: span * Math.max(pw, ph), th: Math.min(pw, ph) };
}

/** Side of the waiting cell for a piece. */
export function cellSize(pw: number, ph: number): number {
  return Math.max(pw, ph) + (CELL_FACTOR - 1) * Math.min(pw, ph);
}

/** How far a piece reaches from its centre, tabs included. */
export function pieceReach(pw: number, ph: number): { rx: number; ry: number } {
  const tab = MAX_TAB_REACH * Math.min(pw, ph);
  return { rx: pw / 2 + tab, ry: ph / 2 + tab };
}

/**
 * `keepOut` is an area no waiting piece may touch (the reference picture in the corner).
 * `turning` is for pieces that may be turned a quarter turn, so they reach as far either way.
 */
export function trayCells(
  pw: number,
  ph: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  W: number,
  H: number,
  keepOut: Rect | null = null,
  turning = false
): Cell[] {
  const f = cellSize(pw, ph);
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
  // Room for the tabs and the piece's shadow.
  const reach = pieceReach(pw, ph);
  const rx = turning ? Math.max(reach.rx, reach.ry) : reach.rx;
  const ry = turning ? rx : reach.ry;
  return cells.filter(([x, y]) => !overlaps({ x: x - rx - 4, y: y - ry - 4, w: 2 * rx + 8, h: 2 * ry + 8 }, keepOut));
}

/**
 * The biggest pieces that still leave a waiting cell for every piece, outside `keepOut`.
 * `pieceAspect` is a grid cell's width / height (1 for square cells); `turning` as for trayCells().
 * `pieces` and `span` are for pieces two cells long (see loosePiece()).
 */
export function layoutFor(
  rows: number,
  cols: number,
  W: number,
  H: number,
  keepOut: Rect | null = null,
  pieceAspect = 1,
  turning = false,
  pieces = rows * cols,
  span = 1
): Layout {
  const n = pieces;
  const maxH = Math.min(MAX_BOARD, H - 2 * (FRAME_BORDER + PAD));
  const maxW = Math.min(MAX_BOARD_WIDE, W - 2 * (FRAME_BORDER + PAD));
  const frameAspect = (pieceAspect * cols) / rows;
  const boxW = Math.min(maxW, Math.max(MAX_BOARD, maxH * frameAspect));
  // The longer side of a piece, from the biggest that fits the frame's box.
  const start = Math.floor(Math.min(boxW / cols / Math.min(1, pieceAspect), maxH / rows / Math.min(1, 1 / pieceAspect)));
  for (let size = start; size * span >= MIN_PIECE; size -= 2) {
    const { pw, ph } = pieceSize(size, pieceAspect);
    const { tw, th } = loosePiece(pw, ph, span);
    const bw = cols * pw;
    const bh = rows * ph;
    const bx = Math.round((W - bw) / 2);
    const by = Math.round((H - bh) / 2);
    const frame = { x: bx - FRAME_BORDER, y: by - FRAME_BORDER, w: bw + 2 * FRAME_BORDER, h: bh + 2 * FRAME_BORDER };
    if (keepOut && overlaps(frame, keepOut)) continue;
    const cells = trayCells(tw, th, bx, by, bw, bh, W, H, keepOut, turning);
    if (cells.length >= n) return { pw, ph, cell: cellSize(tw, th), bx, by, bw, bh, cells };
  }
  throw new Error(`No room for ${n} pieces in ${W}x${H}`);
}

/** Margin around a piece's rectangle so its tabs (and their outline stroke) fit inside the piece's canvas. */
export function pieceMargin(pw: number, ph: number): number {
  return Math.ceil(Math.min(pw, ph) * MAX_TAB_REACH + 3);
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
  opts: { top: number; right: number; max: number },
  pieceAspect = 1,
  turning = false,
  pieces = rows * cols,
  span = 1
): Plan {
  const a = (pieceAspect * cols) / rows;
  for (let m = opts.max; ; m -= 4) {
    const w = Math.round(m * Math.min(1, a)) + 2 * REF_PAD;
    const h = Math.round(m * Math.min(1, 1 / a)) + 2 * REF_PAD;
    const ref = { x: W - opts.right - w, y: opts.top, w, h };
    const keepOut = { x: ref.x - REF_GAP, y: ref.y - REF_GAP, w: w + 2 * REF_GAP, h: h + 2 * REF_GAP };
    if (keepOut.y + keepOut.h <= 0 || m <= 24) return { layout: layoutFor(rows, cols, W, H, null, pieceAspect, turning, pieces, span), ref };
    try {
      return { layout: layoutFor(rows, cols, W, H, keepOut, pieceAspect, turning, pieces, span), ref };
    } catch {
      // No room at this size; try a smaller card.
    }
  }
}
