import { describe, expect, it } from "vitest";
import {
  MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH,
  MAX_COLLAPSED_CATEGORY_IDS,
  parseCollapsedCategoryIds,
  serializeCollapsedCategoryIds,
} from "./collapsed-categories-cookie";

describe("collapsed category preference cookie", () => {
  const knownIds = ["api", "dashboard", "workers"];

  it("accepts valid values and filters stale category IDs", () => {
    expect(parseCollapsedCategoryIds(encodeURIComponent('["dashboard","removed","api","api"]'), knownIds)).toEqual(["dashboard", "api"]);
  });

  it("fails safely for malformed values", () => {
    expect(parseCollapsedCategoryIds("not-json", knownIds)).toEqual([]);
    expect(parseCollapsedCategoryIds('{"api":true}', knownIds)).toEqual([]);
    expect(parseCollapsedCategoryIds("%E0%A4%A", knownIds)).toEqual([]);
  });

  it("rejects oversized values", () => {
    expect(parseCollapsedCategoryIds("x".repeat(MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH + 1), knownIds)).toEqual([]);
    expect(parseCollapsedCategoryIds(JSON.stringify(Array.from({ length: MAX_COLLAPSED_CATEGORY_IDS + 1 }, (_, index) => `category-${index}`)), knownIds)).toEqual([]);
  });

  it("serializes unique IDs within encoded cookie bounds", () => {
    expect(serializeCollapsedCategoryIds(["api", "api", "dashboard"])).toBe('["api","dashboard"]');
    expect(JSON.parse(serializeCollapsedCategoryIds(Array.from({ length: MAX_COLLAPSED_CATEGORY_IDS + 10 }, (_, index) => `category-${index}`)))).toHaveLength(MAX_COLLAPSED_CATEGORY_IDS);
    const ids = Array.from({ length: 10 }, (_, index) => `category-${index}-${"é".repeat(300)}`);
    const serialized = serializeCollapsedCategoryIds(ids);
    expect(encodeURIComponent(serialized).length).toBeLessThanOrEqual(MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH);
    expect(JSON.parse(serialized)).toEqual(ids.slice(0, 1));
    expect(serializeCollapsedCategoryIds(["x".repeat(MAX_COLLAPSED_CATEGORIES_COOKIE_LENGTH), "api"])).toBe('["api"]');
  });
});
