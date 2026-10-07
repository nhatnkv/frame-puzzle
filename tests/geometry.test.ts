import { describe, expect, it } from "vitest";
import { cropRect, gridFor, makeEdges, MAX_PIECE_ASPECT, MAX_TAB_REACH, pieceOutline, PIECE_COUNTS, pieceSize, rng, shapeFor, type Outline, type Pt } from "../src/puzzle/geometry";

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

describe("shapes", () => {
  it("keeps the usual grid for square pictures", () => {
    for (const n of PIECE_COUNTS) expect(shapeFor(n, 1)).toMatchObject(gridFor(n));
    // Square pieces for square grids; 2 pieces of a square picture are two tall halves.
    expect(shapeFor(9, 1).pieceAspect).toBe(1);
    expect(shapeFor(2, 1)).toMatchObject({ pieceAspect: 0.5, frameAspect: 1 });
  });

  it("shows the whole picture: the frame takes the picture's shape", () => {
    for (const aspect of [4 / 3, 3 / 4, 16 / 9, 9 / 16, 3 / 2]) {
      for (const n of PIECE_COUNTS) {
        const sh = shapeFor(n, aspect);
        expect(sh.rows * sh.cols).toBe(n);
        // Pieces never get too long; when they would, the picture is cropped a little instead.
        expect(sh.pieceAspect).toBeLessThanOrEqual(MAX_PIECE_ASPECT);
        expect(sh.pieceAspect).toBeGreaterThanOrEqual(1 / MAX_PIECE_ASPECT);
        if (sh.pieceAspect < MAX_PIECE_ASPECT && sh.pieceAspect > 1 / MAX_PIECE_ASPECT) expect(sh.frameAspect).toBeCloseTo(aspect, 9);
      }
    }
  });

  it("picks the grid with the squarest pieces", () => {
    expect(gridFor(12, 4 / 3)).toEqual({ rows: 3, cols: 4 });
    expect(gridFor(12, 3 / 4)).toEqual({ rows: 4, cols: 3 });
    expect(gridFor(6, 9 / 16)).toEqual({ rows: 3, cols: 2 });
    expect(gridFor(2, 3 / 4)).toEqual({ rows: 2, cols: 1 });
    expect(gridFor(4, 4 / 3)).toEqual({ rows: 2, cols: 2 });
  });

  it("sizes pieces by their longer side", () => {
    expect(pieceSize(120, 1.5)).toEqual({ pw: 120, ph: 80 });
    expect(pieceSize(120, 0.75)).toEqual({ pw: 90, ph: 120 });
  });
});

describe("jigsaw outlines", () => {
  const s = 100;
  const E = makeEdges(4, 5, rng(42));

  it("outer edges of the frame are straight", () => {
    const o = pieceOutline(0, 0, s, s, E);
    const pts = points(o);
    // Top-left piece: nothing above y = 0 or left of x = 0 except the corner lines.
    expect(pts.every(([x, y]) => x >= -1e-9 && y >= -1e-9)).toBe(true);
  });

  it("neighbours share exactly the same edge curve", () => {
    for (let r = 0; r < E.rows; r++) {
      for (let c = 0; c < E.cols; c++) {
        const a = pieceOutline(r, c, s, s, E);
        if (c < E.cols - 1) {
          const b = pieceOutline(r, c + 1, s, s, E);
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
          const b = pieceOutline(r + 1, c, s, s, E);
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
      const o = pieceOutline(1, 1, s, s, e);
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

describe("rectangular pieces", () => {
  const pw = 150;
  const ph = 100;
  const t = Math.min(pw, ph);
  const E = makeEdges(3, 4, rng(5));

  it("neighbours share exactly the same edge curve", () => {
    for (let r = 0; r < E.rows; r++) {
      for (let c = 0; c < E.cols; c++) {
        const a = pieceOutline(r, c, pw, ph, E);
        if (c < E.cols - 1) {
          const x = (c + 1) * pw;
          const right = side(a, [x, r * ph], [x, (r + 1) * ph]);
          const left = side(pieceOutline(r, c + 1, pw, ph, E), [x, (r + 1) * ph], [x, r * ph]).reverse();
          right.forEach((p, i) => expect(Math.hypot(p[0] - left[i][0], p[1] - left[i][1])).toBeLessThan(1e-9));
        }
        if (r < E.rows - 1) {
          const y = (r + 1) * ph;
          const bottom = side(a, [(c + 1) * pw, y], [c * pw, y]);
          const top = side(pieceOutline(r + 1, c, pw, ph, E), [c * pw, y], [(c + 1) * pw, y]).reverse();
          bottom.forEach((p, i) => expect(Math.hypot(p[0] - top[i][0], p[1] - top[i][1])).toBeLessThan(1e-9));
        }
      }
    }
  });

  it("tabs are sized by the shorter side and stay within MAX_TAB_REACH of it", () => {
    for (let seed = 1; seed < 30; seed++) {
      const e = makeEdges(3, 3, rng(seed));
      for (const [x, y] of points(pieceOutline(1, 1, pw, ph, e))) {
        expect(x).toBeGreaterThanOrEqual(pw - MAX_TAB_REACH * t - 1e-9);
        expect(x).toBeLessThanOrEqual(2 * pw + MAX_TAB_REACH * t + 1e-9);
        expect(y).toBeGreaterThanOrEqual(ph - MAX_TAB_REACH * t - 1e-9);
        expect(y).toBeLessThanOrEqual(2 * ph + MAX_TAB_REACH * t + 1e-9);
      }
    }
  });
});

