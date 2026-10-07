import { describe, expect, it } from "vitest";
import { computeFit, DESIGN_H, DESIGN_W } from "../src/ui/stage";

describe("computeFit", () => {
  it("keeps the design size on an 11-inch iPad in landscape", () => {
    const f = computeFit(1194, 834);
    expect(f.scale).toBe(1);
    expect(f.width).toBe(DESIGN_W);
    expect(f.height).toBe(DESIGN_H);
  });

  it("fills a 4:3 iPad by growing the stage height", () => {
    const f = computeFit(1024, 768);
    expect(f.width).toBeCloseTo(DESIGN_W);
    expect(f.height).toBeGreaterThan(DESIGN_H);
    expect(f.width * f.scale).toBeCloseTo(1024);
    expect(f.height * f.scale).toBeCloseTo(768);
  });

  it("never makes the stage smaller than the design in either direction", () => {
    for (const [w, h] of [[1366, 1024], [1133, 744], [820, 1180], [2000, 600]]) {
      const f = computeFit(w, h);
      expect(f.width).toBeGreaterThanOrEqual(DESIGN_W - 1e-9);
      expect(f.height).toBeGreaterThanOrEqual(DESIGN_H - 1e-9);
    }
  });
});
