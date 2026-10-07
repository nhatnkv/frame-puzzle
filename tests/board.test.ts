import { describe, expect, it } from "vitest";
import { cellAt, deal, drop, isFull, isSolved, lift, piecesOnBoard, shuffledCells } from "../src/puzzle/board";
import { rng } from "../src/puzzle/geometry";
import type { Cell } from "../src/puzzle/layout";

// 2x2 puzzle, piece size 100, board at (300, 100); six waiting cells, three on each side.
const cells: Cell[] = [[100, 100], [100, 250], [100, 400], [800, 100], [800, 250], [800, 400]];
const at = (cell: number) => ({ cell, x: 0, y: 0 });

function fresh() {
  return deal(2, 2, cells.length, [0, 1, 3, 4]);
}

describe("board rules", () => {
  it("deals every piece into its own waiting cell", () => {
    const st = fresh();
    expect(st.tray).toEqual([0, 1, null, 2, 3, null]);
    expect(piecesOnBoard(st)).toBe(0);
  });

  it("accepts a piece in any cell, right or wrong", () => {
    const st = fresh();
    const from = lift(st, 0);
    drop(st, 0, from, at(3), cells);
    expect(st.board[3]).toBe(0);
    expect(st.tray[0]).toBeNull();
    expect(isSolved(st)).toBe(false);
  });

  it("swaps with the piece already in the cell, sending it where the new piece came from", () => {
    const st = fresh();
    drop(st, 0, lift(st, 0), at(3), cells); // piece 0 (from waiting cell 0) into cell 3
    const moves = drop(st, 1, lift(st, 1), at(3), cells); // piece 1 (from waiting cell 1) onto it
    expect(st.board[3]).toBe(1);
    expect(st.tray[1]).toBe(0);
    expect(moves).toEqual([
      { piece: 1, to: { kind: "board", cell: 3 } },
      { piece: 0, to: { kind: "tray", index: 1 } }
    ]);
  });

  it("swaps two pieces inside the frame", () => {
    const st = fresh();
    drop(st, 0, lift(st, 0), at(1), cells);
    drop(st, 1, lift(st, 1), at(0), cells);
    drop(st, 0, lift(st, 0), at(0), cells); // 0 moves from cell 1 onto 1 in cell 0
    expect(st.board[0]).toBe(0);
    expect(st.board[1]).toBe(1);
  });

  it("sends a piece dropped outside the frame to the nearest free waiting cell", () => {
    const st = fresh();
    drop(st, 0, lift(st, 0), at(0), cells);
    drop(st, 0, lift(st, 0), { cell: null, x: 780, y: 390 }, cells);
    expect(st.tray[5]).toBe(0);
    expect(st.board[0]).toBeNull();
  });

  it("is full but not solved when pieces are in the wrong cells, and solved when all are right", () => {
    const st = fresh();
    drop(st, 0, lift(st, 0), at(1), cells);
    drop(st, 1, lift(st, 1), at(0), cells);
    drop(st, 2, lift(st, 2), at(2), cells);
    drop(st, 3, lift(st, 3), at(3), cells);
    expect(isFull(st)).toBe(true);
    expect(isSolved(st)).toBe(false);
    drop(st, 0, lift(st, 0), at(0), cells);
    expect(isSolved(st)).toBe(true);
  });

  it("never puts two pieces in one waiting cell", () => {
    const st = deal(3, 3, 12, shuffledCells(12, rng(3)).slice(0, 9));
    const r = rng(9);
    for (let i = 0; i < 200; i++) {
      const piece = Math.floor(r() * 9);
      const cell = r() < 0.5 ? Math.floor(r() * 9) : null;
      drop(st, piece, lift(st, piece), { cell, x: r() * 1000, y: r() * 700 }, Array.from({ length: 12 }, (_, k) => [k * 80, k * 50] as Cell));
      const inTray = st.tray.filter((p) => p !== null);
      const onBoard = st.board.filter((p) => p !== null);
      expect(new Set([...inTray, ...onBoard]).size).toBe(9);
      expect(inTray.length + onBoard.length).toBe(9);
    }
  });
});

describe("cellAt", () => {
  it("finds the cell under a point and forgives drops just outside the frame", () => {
    expect(cellAt(2, 2, 100, 300, 100, 350, 150)).toBe(0);
    expect(cellAt(2, 2, 100, 300, 100, 450, 250)).toBe(3);
    expect(cellAt(2, 2, 100, 300, 100, 290, 150)).toBe(0);
    expect(cellAt(2, 2, 100, 300, 100, 200, 150)).toBeNull();
  });
});
