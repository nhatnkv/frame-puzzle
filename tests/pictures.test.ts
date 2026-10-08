import { describe, expect, it } from "vitest";
import { BUILTIN_PICTURES, builtinUrl, categoryOf } from "../src/pictures";

describe("built-in pictures", () => {
  it("come in three categories", () => {
    const count = (c: string) => BUILTIN_PICTURES.filter((p) => p.category === c).length;
    expect([count("animals"), count("vehicles"), count("landscapes")]).toEqual([2, 3, 10]);
    expect(new Set(BUILTIN_PICTURES.map((p) => p.name)).size).toBe(BUILTIN_PICTURES.length);
  });

  it("know their category; the family's own photos are 'mine'", () => {
    const photo = (file_key: string) => ({ id: 1, file_key, width: 1536, height: 1024 });
    expect(categoryOf(photo("builtin:ha-long-bay"))).toBe("landscapes");
    expect(categoryOf(photo("builtin:farm"))).toBe("animals");
    expect(categoryOf(photo("f-123"))).toBe("mine");
    expect(builtinUrl("builtin:waterfall")).toBeTruthy();
  });
});
