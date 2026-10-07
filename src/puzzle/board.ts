// The rules of the puzzle, without any drawing. Pieces are numbered row by row, so piece i
// belongs in board cell i. A piece is either in a waiting cell ("tray") or in a board cell,
// or in the child's hand while being dragged.

import type { Cell } from "./layout";

export type Loc = { kind: "tray"; index: number } | { kind: "board"; cell: number };

export interface BoardState {
  rows: number;
  cols: number;
  /** For each piece, where it is; null while it is being dragged. */
  loc: Array<Loc | null>;
  /** For each waiting cell, the piece in it. */
  tray: Array<number | null>;
  /** For each board cell, the piece in it. */
  board: Array<number | null>;
}

/** A new game with the pieces dealt into waiting cells in the given order. */
export function deal(rows: number, cols: number, trayCount: number, order: number[]): BoardState {
  const n = rows * cols;
  if (trayCount < n) throw new Error("Not enough waiting cells");
  const st: BoardState = {
    rows,
    cols,
    loc: Array(n).fill(null),
    tray: Array(trayCount).fill(null),
    board: Array(n).fill(null)
  };
  for (let piece = 0; piece < n; piece++) place(st, piece, { kind: "tray", index: order[piece] });
  return st;
}

/** Shuffled waiting cells for the deal. */
export function shuffledCells(trayCount: number, rand: () => number): number[] {
  const a = Array.from({ length: trayCount }, (_, i) => i);
  for (let k = a.length - 1; k > 0; k--) {
    const q = Math.floor(rand() * (k + 1));
    [a[k], a[q]] = [a[q], a[k]];
  }
  return a;
}

/**
 * Waiting cells for `n` pieces, in a random order that never follows the picture's order
 * (piece 0 in the first cell, piece 1 in a later one, and so on), which would make the puzzle too easy.
 */
export function dealOrder(trayCount: number, n: number, rand: () => number): number[] {
  if (trayCount < n) throw new Error("Not enough waiting cells");
  for (;;) {
    const order = shuffledCells(trayCount, rand).slice(0, n);
    if (n < 2 || order.some((cell, i) => i > 0 && cell < order[i - 1])) return order;
  }
}

function place(st: BoardState, piece: number, at: Loc): void {
  if (at.kind === "tray") st.tray[at.index] = piece;
  else st.board[at.cell] = piece;
  st.loc[piece] = at;
}

/** The child picks a piece up. Returns where it came from. */
export function lift(st: BoardState, piece: number): Loc | null {
  const from = st.loc[piece];
  if (from?.kind === "tray") st.tray[from.index] = null;
  if (from?.kind === "board") st.board[from.cell] = null;
  st.loc[piece] = null;
  return from;
}

export function nearestFreeTray(st: BoardState, cells: Cell[], x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  cells.forEach(([cx, cy], i) => {
    if (st.tray[i] !== null) return;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  if (best < 0) throw new Error("No free waiting cell");
  return best;
}

export interface Drop {
  /** Board cell under the piece's centre, or null when dropped outside the frame. */
  cell: number | null;
  /** Where the piece's centre was, to find the nearest free waiting cell. */
  x: number;
  y: number;
}

export interface Move {
  piece: number;
  to: Loc;
}

/**
 * The child lets go of a lifted piece. Any board cell is allowed; if it is taken, the piece
 * that was there moves to where the dropped piece came from. Outside the frame, the piece goes
 * to the nearest free waiting cell. Returns every piece that moved.
 */
export function drop(st: BoardState, piece: number, from: Loc | null, d: Drop, cells: Cell[]): Move[] {
  const moves: Move[] = [];
  if (d.cell === null) {
    const to: Loc = { kind: "tray", index: nearestFreeTray(st, cells, d.x, d.y) };
    place(st, piece, to);
    return [{ piece, to }];
  }
  const other = st.board[d.cell];
  if (other !== null && other !== piece) {
    lift(st, other);
    const back: Loc = from ?? { kind: "tray", index: nearestFreeTray(st, cells, d.x, d.y) };
    place(st, other, back);
    moves.push({ piece: other, to: back });
  }
  const to: Loc = { kind: "board", cell: d.cell };
  place(st, piece, to);
  moves.unshift({ piece, to });
  return moves;
}

/** Board cell under a point, or null when it is outside the frame (plus a forgiving margin). */
export function cellAt(
  rows: number,
  cols: number,
  pw: number,
  ph: number,
  bx: number,
  by: number,
  x: number,
  y: number,
  margin = 0.25
): number | null {
  const m = Math.min(pw, ph) * margin;
  if (x < bx - m || x > bx + cols * pw + m || y < by - m || y > by + rows * ph + m) return null;
  const col = Math.max(0, Math.min(cols - 1, Math.floor((x - bx) / pw)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((y - by) / ph)));
  return row * cols + col;
}

export function isCorrect(st: BoardState, piece: number): boolean {
  const l = st.loc[piece];
  return l?.kind === "board" && l.cell === piece;
}

export function piecesOnBoard(st: BoardState): number {
  return st.board.filter((p) => p !== null).length;
}

export function isFull(st: BoardState): boolean {
  return piecesOnBoard(st) === st.loc.length;
}

export function isSolved(st: BoardState): boolean {
  return st.loc.every((_, i) => isCorrect(st, i));
}
