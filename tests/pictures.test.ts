import { describe, expect, it } from "vitest";
import { BUILTIN_PICTURES, builtinThumb, builtinUrl, categoryOf, SHIPPED_CATEGORIES, UNLISTED_FILES } from "../src/pictures";

describe("built-in pictures", () => {
  it("each have a small copy, a unique name and a category; no file is left out", () => {
    expect(BUILTIN_PICTURES.filter((p) => !p.thumb).map((p) => p.name)).toEqual([]);
    expect(new Set(BUILTIN_PICTURES.map((p) => p.name)).size).toBe(BUILTIN_PICTURES.length);
    expect(UNLISTED_FILES).toEqual([]);
  });

  it("come in categories, each with pictures, the first three as before", () => {
    const count = (c: string) => BUILTIN_PICTURES.filter((p) => p.category === c).length;
    expect(SHIPPED_CATEGORIES.slice(0, 3).map((c) => c.id)).toEqual(["animals", "vehicles", "landscapes"]);
    expect([count("animals"), count("vehicles"), count("landscapes")]).toEqual([2, 3, 10]);
    for (const c of SHIPPED_CATEGORIES) expect(count(c.id), c.id).toBeGreaterThan(0);
    expect(BUILTIN_PICTURES.length).toBeGreaterThan(15);
  });

  it("know their category; the family's own photos are 'mine'", () => {
    const photo = (file_key: string) => ({ id: 1, file_key, width: 1536, height: 1024 });
    expect(categoryOf(photo("builtin:ha-long-bay"))).toBe("landscapes");
    expect(categoryOf(photo("builtin:farm"))).toBe("animals");
    expect(categoryOf(photo("builtin:naruto-ramen"))).toBe("anime");
    expect(categoryOf(photo("f-123"))).toBe("mine");
    expect(builtinUrl("builtin:waterfall")).toBeTruthy();
    expect(builtinThumb("builtin:waterfall")).toMatch(/thumbs/);
  });
});
