import { describe, expect, it } from "vitest";
import { rng } from "../src/puzzle/geometry";
import { costsStars, dealPoses, facesRight, isLevel, LEVELS, hintCostsStars, hintLimit, hintPercent, playable, starCost, poseExtent, poseStyle, rightPose, scattersOnMistake, starsPerPiece, turns, unturn, type Level } from "../src/puzzle/levels";
import { starsFor } from "../src/data/stars";

/** Where CSS puts a point (relative to the centre) for the pose: mirror, or turn clockwise on screen. */
function shown(level: Level, pose: number, x: number, y: number): [number, number] {
  const { scale, rotate } = poseStyle(level, pose);
  const sx = Number(scale.split(" ")[0]);
  const a = (parseFloat(rotate) * Math.PI) / 180;
  const mx = sx * x;
  return [Math.round(mx * Math.cos(a) - y * Math.sin(a)), Math.round(mx * Math.sin(a) + y * Math.cos(a))];
}

describe("levels", () => {
  it("knows its levels", () => {
    expect(LEVELS).toEqual(["easy", "medium", "hard", "extreme", "ultimate"]);
    expect(isLevel("ultimate")).toBe(true);
    expect(isLevel("expert")).toBe(false);
  });

  it("turns pieces like Hard at Extreme and Ultimate, which also send pieces out after a mistake", () => {
    expect(LEVELS.filter(turns)).toEqual(["hard", "extreme", "ultimate"]);
    expect(LEVELS.filter(scattersOnMistake)).toEqual(["extreme", "ultimate"]);
    expect(LEVELS.filter(costsStars)).toEqual(["ultimate"]);
    for (const level of ["extreme", "ultimate"] as const) {
      expect(poseStyle(level, 3)).toEqual(poseStyle("hard", 3));
      expect(poseExtent(level, 1, 200, 100)).toEqual([50, 100]);
      expect([0, 1, 4].map((p) => facesRight(level, p))).toEqual([true, false, true]);
      for (let seed = 1; seed < 30; seed++) expect(dealPoses(level, 9, rng(seed))).toEqual(dealPoses("hard", 9, rng(seed)));
    }
  });

  it("costs 1% of the child's stars for a mistake at Ultimate or a hint at Extreme, rounded up", () => {
    expect([0, 1, 50, 100, 101, 250, 1000].map((n) => starCost(n))).toEqual([0, 1, 1, 1, 2, 3, 10]);
    expect(LEVELS.filter(hintCostsStars)).toEqual(["extreme"]);
  });

  it("makes each hint at Extreme cost more, following the Fibonacci numbers, never more than the child has", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(hintPercent)).toEqual([1, 1, 2, 3, 5, 8, 13]);
    expect([0, 1, 2, 3, 4].map((used) => starCost(250, hintPercent(used)))).toEqual([3, 3, 5, 8, 13]);
    expect(starCost(10, hintPercent(20))).toBe(10);
  });

  it("locks Ultimate while the child has no stars", () => {
    expect(LEVELS.filter((l) => playable(l, 0))).toEqual(["easy", "medium", "hard", "extreme"]);
    expect(LEVELS.every((l) => playable(l, 1))).toBe(true);
  });

  it("allows 5 hints at Hard, none at Ultimate and any number otherwise", () => {
    expect(LEVELS.map(hintLimit)).toEqual([Infinity, Infinity, 5, Infinity, 0]);
  });

  it("counts a piece as the right way round every 1, 2 or 4 taps", () => {
    expect([0, 1, 2, 3].map((p) => facesRight("easy", p))).toEqual([true, true, true, true]);
    expect([0, 1, 2, 3].map((p) => facesRight("medium", p))).toEqual([true, false, true, false]);
    expect([0, 1, 2, 3, 4, 5].map((p) => facesRight("hard", p))).toEqual([true, false, false, false, true, false]);
  });

  it("puts a piece right by turning it on, never back", () => {
    expect(rightPose("medium", 3)).toBe(4);
    expect(rightPose("medium", 4)).toBe(4);
    expect(rightPose("hard", 1)).toBe(4);
    expect(rightPose("hard", 7)).toBe(8);
    expect(rightPose("hard", 8)).toBe(8);
  });

  for (const n of [2, 3, 4, 9, 49]) {
    it(`deals ${n} pieces: half of them mirrored at medium, at least half turned at hard`, () => {
      for (let seed = 1; seed < 30; seed++) {
        expect(dealPoses("easy", n, rng(seed))).toEqual(Array(n).fill(0));
        const medium = dealPoses("medium", n, rng(seed));
        expect(medium.filter((p) => p === 1).length).toBe(Math.ceil(n / 2));
        expect(medium.every((p) => p === 0 || p === 1)).toBe(true);
        const hard = dealPoses("hard", n, rng(seed));
        expect(hard.filter((p) => p !== 0).length).toBeGreaterThanOrEqual(Math.ceil(n / 2));
        expect(hard.every((p) => p >= 0 && p <= 3)).toBe(true);
      }
    });
  }

  it("never deals a solved puzzle above easy", () => {
    for (let seed = 1; seed < 200; seed++) {
      expect(dealPoses("medium", 2, rng(seed)).some((p) => !facesRight("medium", p))).toBe(true);
      expect(dealPoses("hard", 2, rng(seed)).some((p) => !facesRight("hard", p))).toBe(true);
    }
  });

  it("maps a touch back onto the piece the way CSS shows it", () => {
    const cases: Array<[Level, number]> = [["easy", 0], ["medium", 0], ["medium", 1], ["hard", 0], ["hard", 1], ["hard", 2], ["hard", 3], ["hard", 6], ["extreme", 1], ["ultimate", 3]];
    for (const [level, pose] of cases) {
      for (const [x, y] of [[30, 10], [-25, 40], [5, -60]]) {
        const [sx, sy] = shown(level, pose, x, y);
        expect(unturn(level, pose, sx, sy)).toEqual([x, y]);
      }
    }
  });

  it("knows how far a turned piece reaches", () => {
    expect(poseExtent("hard", 1, 200, 100)).toEqual([50, 100]);
    expect(poseExtent("hard", 2, 200, 100)).toEqual([100, 50]);
    expect(poseExtent("medium", 1, 200, 100)).toEqual([100, 50]);
  });

  it("gives more stars for harder levels", () => {
    expect(starsPerPiece("easy")).toBe(2);
    expect(starsPerPiece("medium")).toBe(6);
    expect(starsPerPiece("hard")).toBe(10);
    expect(starsPerPiece("extreme")).toBe(20);
    expect(starsPerPiece("ultimate")).toBe(30);
    expect(starsFor(4)).toBe(8);
    expect(starsFor(4, "medium")).toBe(24);
    expect(starsFor(4, "hard")).toBe(40);
    expect(starsFor(4, "ultimate")).toBe(120);
  });
});
