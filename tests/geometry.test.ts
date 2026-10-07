import { describe, expect, it } from "vitest";
import { cropRect, gridFor, makeEdges, MAX_TAB_REACH, pieceOutline, PIECE_COUNTS, rng, type Outline, type Pt } from "../src/puzzle/geometry";

/** All points of an outline in drawing order, start included. */
function points(o: Outline): Pt[] {
  return [o.start, ...o.segments.flat()];
}

/** Points of one side of a piece: from corner a to corner b, in drawing order. */
function side(o: Outline, a: Pt, b: Pt): Pt[] {
  const pts = points(o);
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
  const i = pts.findIndex((p) => same(p, a));
  const j = pts.findIndex((p, k) => k > i && same(p, b));
  return pts.slice(i, j + 1);
}

describe("grids", () => {
  it("has a grid for every piece count with exactly that many pieces", () => {
    for (const n of PIECE_COUNTS) {
      const { rows, cols } = gridFor(n);
      expect(rows * cols).toBe(n);
      expect(rows).toBeLessThanOrEqual(cols);
    }
  });
});

describe("jigsaw outlines", () => {
  const s = 100;
  const E = makeEdges(4, 5, rng(42));

  it("outer edges of the frame are straight", () => {
    const o = pieceOutline(0, 0, s, E);
    const pts = points(o);
    // Top-left piece: nothing above y = 0 or left of x = 0 except the corner lines.
    expect(pts.every(([x, y]) => x >= -1e-9 && y >= -1e-9)).toBe(true);
  });

  it("neighbours share exactly the same edge curve", () => {
    for (let r = 0; r < E.rows; r++) {
      for (let c = 0; c < E.cols; c++) {
        const a = pieceOutline(r, c, s, E);
        if (c < E.cols - 1) {
          const b = pieceOutline(r, c + 1, s, E);
          const x = (c + 1) * s;
          const right = side(a, [x, r * s], [x, (r + 1) * s]);
          const left = side(b, [x, (r + 1) * s], [x, r * s]).reverse();
          expect(right.length).toBe(left.length);
          right.forEach((p, i) => {
            expect(p[0]).toBeCloseTo(left[i][0], 9);
            expect(p[1]).toBeCloseTo(left[i][1], 9);
          });
        }
        if (r < E.rows - 1) {
          const b = pieceOutline(r + 1, c, s, E);
          const y = (r + 1) * s;
          const bottom = side(a, [(c + 1) * s, y], [c * s, y]);
          const top = side(b, [c * s, y], [(c + 1) * s, y]).reverse();
          expect(bottom.length).toBe(top.length);
          bottom.forEach((p, i) => {
            expect(p[0]).toBeCloseTo(top[i][0], 9);
            expect(p[1]).toBeCloseTo(top[i][1], 9);
          });
        }
      }
    }
  });

  it("tabs never reach further than MAX_TAB_REACH beyond the piece", () => {
    for (let seed = 1; seed < 30; seed++) {
      const e = makeEdges(3, 3, rng(seed));
      const o = pieceOutline(1, 1, s, e);
      for (const [x, y] of points(o)) {
        expect(x).toBeGreaterThanOrEqual(s - MAX_TAB_REACH * s - 1e-9);
        expect(x).toBeLessThanOrEqual(2 * s + MAX_TAB_REACH * s + 1e-9);
        expect(y).toBeGreaterThanOrEqual(s - MAX_TAB_REACH * s - 1e-9);
        expect(y).toBeLessThanOrEqual(2 * s + MAX_TAB_REACH * s + 1e-9);
      }
    }
  });

  it("is reproducible from the same seed and varies between seeds", () => {
    expect(makeEdges(3, 3, rng(7))).toEqual(makeEdges(3, 3, rng(7)));
    expect(makeEdges(3, 3, rng(7))).not.toEqual(makeEdges(3, 3, rng(8)));
  });
});

describe("cropRect", () => {
  it("crops a wide picture to a square from the middle", () => {
    expect(cropRect(1600, 900, 1)).toEqual([350, 0, 900, 900]);
  });
  it("crops a tall picture to 3:2 from the middle", () => {
    const [sx, sy, sw, sh] = cropRect(900, 1600, 1.5);
    expect(sx).toBe(0);
    expect(sw).toBe(900);
    expect(sh).toBe(600);
    expect(sy).toBe(500);
  });
});
