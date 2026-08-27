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

  it("uses the palette primary color for a missing service-status text color", () => {
    const result = normalizePalette({ ...DEFAULT_LIGHT_PALETTE, primary: "#AABBCC", serviceStatusText: undefined }, DEFAULT_LIGHT_PALETTE);
    expect(result.serviceStatusText).toBe("#aabbcc");
  });

  it("keeps a customized service-status text color independent from primary", () => {
    const result = normalizePalette({ ...DEFAULT_LIGHT_PALETTE, primary: "#AABBCC", serviceStatusText: "#112233" }, DEFAULT_LIGHT_PALETTE);
    expect(result.serviceStatusText).toBe("#112233");
  });

  it("calculates WCAG color contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio(DEFAULT_LIGHT_PALETTE.text, DEFAULT_LIGHT_PALETTE.background)).toBeGreaterThanOrEqual(4.5);
  });
});
