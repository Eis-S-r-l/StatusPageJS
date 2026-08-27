import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("creates lowercase, hyphenated slugs from English titles", () => {
    expect(slugify("Public API & Customer Portal")).toBe("public-api-customer-portal");
  });

  it("normalizes accents and trims punctuation", () => {
    expect(slugify("  Café connectivity — degraded!  ")).toBe("cafe-connectivity-degraded");
  });

  it("caps generated slugs without leaving a trailing separator", () => {
    expect(slugify(`${"a".repeat(99)} and more`)).toHaveLength(99);
  });
});
