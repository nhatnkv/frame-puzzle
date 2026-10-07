import { describe, expect, it } from "vitest";
import { gridFor, MAX_TAB_REACH, PIECE_COUNTS } from "../src/puzzle/geometry";
import { CELL_FACTOR, FRAME_BORDER, layoutFor, layoutWithReference, overlaps, REF_PAD } from "../src/puzzle/layout";

// The playfield is the stage below the top bar, on the smallest and largest iPad shapes.
const FIELDS: Array<[number, number]> = [
  [1194, 730],
  [1194, 1024 * (1194 / 1366) - 104],
  [1194 * (1133 / 744) * (834 / 1194), 730]
];

describe("puzzle layout", () => {
  for (const [W, H] of FIELDS) {
    describe(`${Math.round(W)}x${Math.round(H)}`, () => {
      for (const n of PIECE_COUNTS) {
        it(`fits ${n} pieces with a waiting cell each`, () => {
          const { rows, cols } = gridFor(n);
          const L = layoutFor(rows, cols, W, H);
          expect(L.cells.length).toBeGreaterThanOrEqual(n);
          expect(L.s).toBeGreaterThanOrEqual(40);
        });

        it(`never lets ${n} waiting pieces overlap each other or the frame`, () => {
          const { rows, cols } = gridFor(n);
          const L = layoutFor(rows, cols, W, H);
          const reach = L.s * (0.5 + MAX_TAB_REACH);
          const minGap = L.s * CELL_FACTOR;
          for (let i = 0; i < L.cells.length; i++) {
            const [x, y] = L.cells[i];
            for (let j = i + 1; j < L.cells.length; j++) {
              const [x2, y2] = L.cells[j];
              const apart = Math.abs(x - x2) >= minGap - 1e-6 || Math.abs(y - y2) >= minGap - 1e-6;
              expect(apart).toBe(true);
            }
            // A piece in this cell stays clear of the wooden frame.
            const fx0 = L.bx - FRAME_BORDER, fx1 = L.bx + L.bw + FRAME_BORDER;
            const fy0 = L.by - FRAME_BORDER, fy1 = L.by + L.bh + FRAME_BORDER;
            const clear = x + reach <= fx0 || x - reach >= fx1 || y + reach <= fy0 || y - reach >= fy1;
            expect(clear).toBe(true);
            // And inside the playfield.
            expect(x - reach).toBeGreaterThanOrEqual(0);
            expect(y - reach).toBeGreaterThanOrEqual(0);
            expect(x + reach).toBeLessThanOrEqual(W);
            expect(y + reach).toBeLessThanOrEqual(H);
          }
        });
      }
    });
  }

  it("uses big pieces for few pieces", () => {
    const { rows, cols } = gridFor(4);
    expect(layoutFor(rows, cols, 1194, 730).s).toBeGreaterThan(150);
  });

  describe("with the reference picture in the corner", () => {
    const opts = { top: -88, right: 36, max: 180 };
    for (const [W, H] of FIELDS) {
      it(`keeps the picture big and clear of the pieces at ${Math.round(W)}x${Math.round(H)}`, () => {
        for (const n of PIECE_COUNTS) {
          const { rows, cols } = gridFor(n);
          const { layout: L, ref } = layoutWithReference(rows, cols, W, H, opts);
          expect(L.cells.length).toBeGreaterThanOrEqual(n);
          // Big, in the top-right corner, shaped like the puzzle.
          expect(Math.max(ref.w, ref.h)).toBe(opts.max + 2 * REF_PAD);
          expect(ref.x + ref.w).toBe(W - opts.right);
          expect(ref.y).toBe(opts.top);
          expect((ref.w - 2 * REF_PAD) / (ref.h - 2 * REF_PAD)).toBeCloseTo(cols / rows, 1);
          // Pieces stay big enough for small fingers.
          expect(L.s).toBeGreaterThanOrEqual(55);
          // Nothing touches the card: not the frame, not a waiting piece with its tabs.
          const frame = { x: L.bx - FRAME_BORDER, y: L.by - FRAME_BORDER, w: L.bw + 2 * FRAME_BORDER, h: L.bh + 2 * FRAME_BORDER };
          expect(overlaps(frame, ref)).toBe(false);
          const reach = L.s * (0.5 + MAX_TAB_REACH);
          for (const [x, y] of L.cells) {
            expect(overlaps({ x: x - reach, y: y - reach, w: 2 * reach, h: 2 * reach }, ref)).toBe(false);
          }
        }
      });
    }
  });
});
