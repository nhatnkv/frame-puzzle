import { describe, expect, it } from "vitest";
import { clampMinutes, clock, raceStars } from "../src/puzzle/race";

describe("race mode", () => {
  it("shares a picture's stars out over its pieces, rounded up", () => {
    expect(raceStars(100, 1, 6)).toBe(17);
    expect(raceStars(100, 3, 6)).toBe(50);
    expect(raceStars(100, 5, 6)).toBe(84);
    expect(raceStars(100, 6, 6)).toBe(100);
    expect(raceStars(100, 0, 6)).toBe(0);
    expect(raceStars(8, 1, 4)).toBe(2);
  });

  it("keeps the minutes whole and between 1 and 30", () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(45)).toBe(30);
    expect(clampMinutes(2.4)).toBe(2);
    expect(clampMinutes(NaN)).toBe(5);
  });

  it("shows the time left as m:ss", () => {
    expect(clock(5 * 60_000)).toBe("5:00");
    expect(clock(61_001)).toBe("1:02");
    expect(clock(9_000)).toBe("0:09");
    expect(clock(-5)).toBe("0:00");
  });
});
