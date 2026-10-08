import { describe, expect, it } from "vitest";
import { gridFor, PIECE_COUNTS, shapeFor } from "../src/puzzle/geometry";
import { FRAME_BORDER, layoutFor, layoutWithReference, loosePiece, overlaps, pieceReach, REF_PAD, type Layout } from "../src/puzzle/layout";

// The playfield is the stage below the top bar, on the smallest and largest iPad shapes.
const FIELDS: Array<[number, number]> = [
  [1194, 730],
  [1194, 1024 * (1194 / 1366) - 104],
  [1194 * (1133 / 744) * (834 / 1194), 730]
];
// Picture shapes: square, iPad and phone photos in landscape and portrait.
const PICTURES = [1, 4 / 3, 3 / 4, 16 / 9, 9 / 16];
const REFERENCE = { top: -88, right: 36, max: 180 };

/** Waiting pieces never overlap each other or the frame, and stay inside the playfield; turned ones too. */
function expectClear(L: Layout, W: number, H: number, turning = false) {
  const reach = pieceReach(L.pw, L.ph);
  const rx = turning ? Math.max(reach.rx, reach.ry) : reach.rx;
  const ry = turning ? rx : reach.ry;
  const frame = { x: L.bx - FRAME_BORDER, y: L.by - FRAME_BORDER, w: L.bw + 2 * FRAME_BORDER, h: L.bh + 2 * FRAME_BORDER };
  L.cells.forEach(([x, y], i) => {
    for (const [x2, y2] of L.cells.slice(i + 1)) {
      expect(Math.abs(x - x2) >= 2 * rx || Math.abs(y - y2) >= 2 * ry).toBe(true);
    }
    expect(overlaps({ x: x - rx, y: y - ry, w: 2 * rx, h: 2 * ry }, frame)).toBe(false);
    expect(x - rx).toBeGreaterThanOrEqual(0);
    expect(y - ry).toBeGreaterThanOrEqual(0);
    expect(x + rx).toBeLessThanOrEqual(W);
    expect(y + ry).toBeLessThanOrEqual(H);
  });
}

describe("puzzle layout", () => {
  for (const [W, H] of FIELDS) {
    for (const aspect of PICTURES) {
      it(`fits every piece count of a ${aspect.toFixed(2)} picture in ${Math.round(W)}x${Math.round(H)}`, () => {
        for (const n of PIECE_COUNTS) {
          const { rows, cols, pieceAspect, frameAspect } = shapeFor(n, aspect);
          const L = layoutFor(rows, cols, W, H, null, pieceAspect);
          expect(L.cells.length).toBeGreaterThanOrEqual(n);
          expect(Math.max(L.pw, L.ph)).toBeGreaterThanOrEqual(40);
          // The frame has the picture's shape (to a pixel per piece).
          expect(L.bw / L.bh).toBeCloseTo(frameAspect, 1);
          expectClear(L, W, H);
        }
      });
    }
  }

  it("uses big pieces for few pieces", () => {
    const { rows, cols } = gridFor(4);
    expect(layoutFor(rows, cols, 1194, 730).pw).toBeGreaterThan(150);
    const photo = shapeFor(4, 4 / 3);
    expect(layoutFor(photo.rows, photo.cols, 1194, 730, null, photo.pieceAspect).ph).toBeGreaterThan(120);
  });

  describe("with the reference picture in the corner", () => {
    for (const [W, H] of FIELDS) {
      for (const aspect of PICTURES) {
        it(`keeps a ${aspect.toFixed(2)} picture big and clear of the pieces at ${Math.round(W)}x${Math.round(H)}`, () => {
          for (const n of PIECE_COUNTS) {
            const { rows, cols, pieceAspect, frameAspect } = shapeFor(n, aspect);
            const { layout: L, ref } = layoutWithReference(rows, cols, W, H, REFERENCE, pieceAspect);
            expect(L.cells.length).toBeGreaterThanOrEqual(n);
            // Big, in the top-right corner, shaped like the puzzle.
            expect(Math.max(ref.w, ref.h)).toBe(REFERENCE.max + 2 * REF_PAD);
            expect(ref.x + ref.w).toBe(W - REFERENCE.right);
            expect(ref.y).toBe(REFERENCE.top);
            expect((ref.w - 2 * REF_PAD) / (ref.h - 2 * REF_PAD)).toBeCloseTo(frameAspect, 1);
            // Pieces stay big enough for small fingers.
            expect(Math.min(L.pw, L.ph)).toBeGreaterThanOrEqual(n <= 9 ? 80 : 30);
            expectClear(L, W, H);
            // Nothing touches the card: not the frame, not a waiting piece with its tabs.
            const frame = { x: L.bx - FRAME_BORDER, y: L.by - FRAME_BORDER, w: L.bw + 2 * FRAME_BORDER, h: L.bh + 2 * FRAME_BORDER };
            expect(overlaps(frame, ref)).toBe(false);
            const { rx, ry } = pieceReach(L.pw, L.ph);
            for (const [x, y] of L.cells) expect(overlaps({ x: x - rx, y: y - ry, w: 2 * rx, h: 2 * ry }, ref)).toBe(false);
          }
        });
      }
    }

    // From Hard up, pieces are two cells long, lying or standing, and may be turned either way.
    for (const [W, H] of FIELDS) {
      for (const aspect of PICTURES) {
        it(`fits pieces two cells long of a ${aspect.toFixed(2)} picture at ${Math.round(W)}x${Math.round(H)}`, () => {
          for (const n of PIECE_COUNTS) {
            const { rows, cols, pieceAspect } = shapeFor(n, aspect, true);
            const { layout: L, ref } = layoutWithReference(rows, cols, W, H, REFERENCE, pieceAspect, true, n, 2);
            expect(L.cells.length).toBeGreaterThanOrEqual(n);
            expect(Math.min(L.pw, L.ph)).toBeGreaterThanOrEqual(n <= 9 ? 50 : 20);
            const { tw, th } = loosePiece(L.pw, L.ph, 2);
            expectClear({ ...L, pw: tw, ph: th }, W, H, true);
            const r = Math.max(...Object.values(pieceReach(tw, th)));
            for (const [x, y] of L.cells) expect(overlaps({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }, ref)).toBe(false);
          }
        });
      }
    }

    // At hard, a waiting piece may be turned a quarter turn, so a wide piece stands up tall.
    for (const [W, H] of FIELDS) {
      for (const aspect of [16 / 9, 9 / 16]) {
        it(`leaves room to turn the pieces of a ${aspect.toFixed(2)} picture at ${Math.round(W)}x${Math.round(H)}`, () => {
          for (const n of PIECE_COUNTS) {
            const { rows, cols, pieceAspect } = shapeFor(n, aspect);
            const { layout: L, ref } = layoutWithReference(rows, cols, W, H, REFERENCE, pieceAspect, true);
            expect(L.cells.length).toBeGreaterThanOrEqual(n);
            expectClear(L, W, H, true);
            const r = Math.max(...Object.values(pieceReach(L.pw, L.ph)));
            for (const [x, y] of L.cells) expect(overlaps({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }, ref)).toBe(false);
          }
        });
      }
    }
  });
});
