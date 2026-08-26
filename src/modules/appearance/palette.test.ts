import { describe, expect, it } from "vitest";

import { contrastRatio, DEFAULT_LIGHT_PALETTE, normalizePalette } from "./palette";

describe("normalizePalette", () => {
  it("accepts valid colors and falls back field by field", () => {
    const result = normalizePalette({ ...DEFAULT_LIGHT_PALETTE, primary: "#AABBCC", danger: "red" }, DEFAULT_LIGHT_PALETTE);
    expect(result.primary).toBe("#aabbcc");
    expect(result.danger).toBe(DEFAULT_LIGHT_PALETTE.danger);
  });

  it("returns a complete default palette for malformed data", () => {
    expect(normalizePalette(null, DEFAULT_LIGHT_PALETTE)).toEqual(DEFAULT_LIGHT_PALETTE);
  });

  it("calculates WCAG color contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio(DEFAULT_LIGHT_PALETTE.text, DEFAULT_LIGHT_PALETTE.background)).toBeGreaterThanOrEqual(4.5);
  });
});
