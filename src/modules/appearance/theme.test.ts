import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE } from "./palette";
import { appearanceStyle, bootThemeScript, themeFromCookie } from "./theme";

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

  it("generates independent service-status text CSS variables for both themes", () => {
    const style = appearanceStyle({
      companyName: "EIS",
      lightPalette: { ...DEFAULT_LIGHT_PALETTE, serviceStatusText: "#112233" },
      darkPalette: { ...DEFAULT_DARK_PALETTE, serviceStatusText: "#ddeeff" },
      logoLightFile: null,
      logoLightMimeType: null,
      logoDarkFile: null,
      logoDarkMimeType: null,
      faviconFile: null,
      faviconMimeType: null,
      version: "test",
    });
    expect(style["--theme-light-serviceStatusText"]).toBe("#112233");
    expect(style["--theme-dark-serviceStatusText"]).toBe("#ddeeff");
  });

  it("keeps service-status label text independent from semantic markers", () => {
    const css = readFileSync(new URL("../../components/public/public.module.css", import.meta.url), "utf8");
    expect(css).toContain(".serviceState { display: inline-flex; align-items: center; gap: 6px; color: var(--color-service-status-text);");
    expect(css).toContain(".serviceState i { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success);");
    expect(css).toContain(".serviceState.degraded i { background: var(--color-warning); }");
    expect(css).toContain(".serviceState.outage i { background: var(--color-danger); }");
    expect(css).toContain(".serviceState.maintenance i { background: var(--color-primary); }");
  });
});
