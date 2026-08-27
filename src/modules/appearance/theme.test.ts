import { describe, expect, it } from "vitest";

import { bootThemeScript, themeFromCookie } from "./theme";

describe("theme persistence", () => {
  it("accepts only supported theme cookie values", () => {
    expect(themeFromCookie("light")).toBe("light");
    expect(themeFromCookie("dark")).toBe("dark");
    expect(themeFromCookie("system")).toBeUndefined();
    expect(themeFromCookie(undefined)).toBeUndefined();
  });

  it("synchronizes the boot theme to the server-readable cookie", () => {
    expect(bootThemeScript).toContain("document.cookie=cookie");
    expect(bootThemeScript).toContain("SameSite=Lax");
  });
});
