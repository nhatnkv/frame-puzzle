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

export function trayCells(s: number, bx: number, by: number, bw: number, bh: number, W: number, H: number): Cell[] {
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
  return cells;
}

/** The biggest piece size that still leaves a waiting cell for every piece. */
export function layoutFor(rows: number, cols: number, W: number, H: number): Layout {
  const n = rows * cols;
  const maxBoard = Math.min(MAX_BOARD, H - 2 * (FRAME_BORDER + PAD));
  for (let s = Math.floor(Math.min(maxBoard / cols, maxBoard / rows)); s >= MIN_PIECE; s -= 2) {
    const bw = cols * s;
    const bh = rows * s;
    const bx = Math.round((W - bw) / 2);
    const by = Math.round((H - bh) / 2);
    const cells = trayCells(s, bx, by, bw, bh, W, H);
    if (cells.length >= n) return { s, bx, by, bw, bh, cells };
  }
  throw new Error(`No room for ${n} pieces in ${W}x${H}`);
}

/** Margin around a piece's square so its tabs (and their outline stroke) fit inside the piece's canvas. */
export function pieceMargin(s: number): number {
  return Math.ceil(s * MAX_TAB_REACH + 3);
}
