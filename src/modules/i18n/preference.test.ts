import { describe, expect, it } from "vitest";

import { parseLanguagePreference } from "./preference";

describe("language preference cookie", () => {
  it("accepts supported languages", () => {
    expect(parseLanguagePreference("en")).toBe("en");
    expect(parseLanguagePreference("it")).toBe("it");
  });

  it("falls back safely for missing or unsupported values", () => {
    expect(parseLanguagePreference(undefined)).toBe("en");
    expect(parseLanguagePreference("fr")).toBe("en");
    expect(parseLanguagePreference("IT")).toBe("en");
  });
});
