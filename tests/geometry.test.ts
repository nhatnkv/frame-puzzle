import { describe, expect, it } from "vitest";
import { cropRect, dominoes, gridFor, makeEdges, MAX_CELL_ASPECT, MAX_PIECE_ASPECT, MAX_TAB_REACH, owners, pieceOutline, PIECE_COUNTS, pieceSize, rng, shapeFor, type Block, type Outline, type Pt } from "../src/puzzle/geometry";

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

  it("cuts big puzzles along the picture: 70 pieces are 7 x 10 lying down and 10 x 7 standing up", () => {
    expect(gridFor(70, 3 / 2)).toEqual({ rows: 7, cols: 10 });
    expect(gridFor(70, 2 / 3)).toEqual({ rows: 10, cols: 7 });
    expect(gridFor(48, 4 / 3)).toEqual({ rows: 6, cols: 8 });
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
    const o = pieceOutline({ r: 0, c: 0, h: 1, w: 1 }, s, s, E);
    const pts = points(o);
    // Top-left piece: nothing above y = 0 or left of x = 0 except the corner lines.
    expect(pts.every(([x, y]) => x >= -1e-9 && y >= -1e-9)).toBe(true);
  });

  it("neighbours share exactly the same edge curve", () => {
    for (let r = 0; r < E.rows; r++) {
      for (let c = 0; c < E.cols; c++) {
        const a = pieceOutline({ r, c, h: 1, w: 1 }, s, s, E);
        if (c < E.cols - 1) {
          const b = pieceOutline({ r, c: c + 1, h: 1, w: 1 }, s, s, E);
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
          const b = pieceOutline({ r: r + 1, c, h: 1, w: 1 }, s, s, E);
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
      const o = pieceOutline({ r: 1, c: 1, h: 1, w: 1 }, s, s, e);
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
        const a = pieceOutline({ r, c, h: 1, w: 1 }, pw, ph, E);
        if (c < E.cols - 1) {
          const x = (c + 1) * pw;
          const right = side(a, [x, r * ph], [x, (r + 1) * ph]);
          const left = side(pieceOutline({ r, c: c + 1, h: 1, w: 1 }, pw, ph, E), [x, (r + 1) * ph], [x, r * ph]).reverse();
          right.forEach((p, i) => expect(Math.hypot(p[0] - left[i][0], p[1] - left[i][1])).toBeLessThan(1e-9));
        }
        if (r < E.rows - 1) {
          const y = (r + 1) * ph;
          const bottom = side(a, [(c + 1) * pw, y], [c * pw, y]);
          const top = side(pieceOutline({ r: r + 1, c, h: 1, w: 1 }, pw, ph, E), [c * pw, y], [(c + 1) * pw, y]).reverse();
          bottom.forEach((p, i) => expect(Math.hypot(p[0] - top[i][0], p[1] - top[i][1])).toBeLessThan(1e-9));
        }
      }
    }
  });

  it("tabs are sized by the shorter side and stay within MAX_TAB_REACH of it", () => {
    for (let seed = 1; seed < 30; seed++) {
      const e = makeEdges(3, 3, rng(seed));
      for (const [x, y] of points(pieceOutline({ r: 1, c: 1, h: 1, w: 1 }, pw, ph, e))) {
        expect(x).toBeGreaterThanOrEqual(pw - MAX_TAB_REACH * t - 1e-9);
        expect(x).toBeLessThanOrEqual(2 * pw + MAX_TAB_REACH * t + 1e-9);
        expect(y).toBeGreaterThanOrEqual(ph - MAX_TAB_REACH * t - 1e-9);
        expect(y).toBeLessThanOrEqual(2 * ph + MAX_TAB_REACH * t + 1e-9);
      }
    }
  });
});


describe("pieces two cells long", () => {
  const GRIDS: Array<[number, number]> = [[2, 2], [2, 3], [4, 5], [6, 10], [7, 10], [10, 14]];

  it("cover every cell once, lying or standing, numbered row by row", () => {
    GRIDS.forEach(([rows, cols], seed) => {
      const blocks = dominoes(rows, cols, rng(seed));
      expect(blocks).toHaveLength((rows * cols) / 2);
      const seen = Array<number>(rows * cols).fill(0);
      for (const b of blocks) {
        expect([b.h, b.w].sort()).toEqual([1, 2]);
        expect(b.r + b.h).toBeLessThanOrEqual(rows);
        expect(b.c + b.w).toBeLessThanOrEqual(cols);
        for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) seen[r * cols + c]++;
      }
      expect(seen.every((n) => n === 1)).toBe(true);
      const starts = blocks.map((b) => b.r * cols + b.c);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      const owner = owners(blocks, cols);
      blocks.forEach((b, i) => expect(owner[b.r * cols + b.c]).toBe(i));
    });
  });

  it("mix lying and standing pieces at random, in a share that changes from puzzle to puzzle", () => {
    for (const [rows, cols] of [[6, 10], [10, 14], [7, 10]]) {
      const shares = Array.from({ length: 40 }, (_, seed) => dominoes(rows, cols, rng(seed)).filter((b) => b.w === 2).length / ((rows * cols) / 2));
      // Always some of each, but sometimes mostly lying and sometimes mostly standing.
      for (const share of shares) {
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThan(1);
      }
      expect(Math.min(...shares)).toBeLessThan(0.3);
      expect(Math.max(...shares)).toBeGreaterThan(0.7);
    }
    expect(dominoes(6, 10, rng(7))).toEqual(dominoes(6, 10, rng(7)));
    expect(dominoes(6, 10, rng(7))).not.toEqual(dominoes(6, 10, rng(8)));
  });

  it("share exactly the same edge curve with every neighbour", () => {
    const pw = 90;
    const ph = 80;
    for (const [rows, cols] of GRIDS) {
      const blocks = dominoes(rows, cols, rng(rows * cols));
      const owner = owners(blocks, cols);
      const E = makeEdges(rows, cols, rng(3));
      const line = (b: Block) => pieceOutline(b, pw, ph, E);
      const same = (a: Pt[], b: Pt[]) => {
        expect(a.length).toBe(b.length);
        a.forEach((p, i) => expect(Math.hypot(p[0] - b[i][0], p[1] - b[i][1])).toBeLessThan(1e-9));
      };
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = owner[r * cols + c];
          if (c < cols - 1 && owner[r * cols + c + 1] !== a) {
            const x = (c + 1) * pw;
            same(side(line(blocks[a]), [x, r * ph], [x, (r + 1) * ph]), side(line(blocks[owner[r * cols + c + 1]]), [x, (r + 1) * ph], [x, r * ph]).reverse());
          }
          if (r < rows - 1 && owner[(r + 1) * cols + c] !== a) {
            const y = (r + 1) * ph;
            same(side(line(blocks[a]), [(c + 1) * pw, y], [c * pw, y]), side(line(blocks[owner[(r + 1) * cols + c]]), [c * pw, y], [(c + 1) * pw, y]).reverse());
          }
        }
      }
      // Each piece has a tab on every edge it shares, and none inside or on the border.
      blocks.forEach((b) => {
        let shared = 0;
        for (let r = b.r; r < b.r + b.h; r++) for (let c = b.c; c < b.c + b.w; c++) {
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && owner[rr * cols + cc] !== owner[r * cols + c]) shared++;
          }
        }
        expect(line(b).segments.filter((seg) => seg.length === 3)).toHaveLength(3 * shared);
      });
    }
  });

  it("are cut from a grid of cells close to square, showing the whole picture", () => {
    for (const aspect of [4 / 3, 3 / 2, 3 / 4, 2 / 3]) {
      for (const n of PIECE_COUNTS) {
        const sh = shapeFor(n, aspect, true);
        expect(sh.rows * sh.cols).toBe(2 * n);
        expect(Math.max(sh.pieceAspect, 1 / sh.pieceAspect)).toBeLessThanOrEqual(MAX_CELL_ASPECT);
        expect(sh.frameAspect).toBeCloseTo(aspect, 2);
      }
    }
    expect(shapeFor(70, 3 / 2, true)).toMatchObject({ rows: 10, cols: 14 });
    // A very wide photo is cropped a little rather than cut into very long pieces.
    expect(shapeFor(2, 16 / 9, true)).toMatchObject({ rows: 2, cols: 2, pieceAspect: MAX_CELL_ASPECT });
  });
});
