import { describe, expect, it } from "vitest";
import { publicTimezone } from "@/modules/i18n/timezone";
import { formatDateTime } from "./format";

describe("configured public timezone", () => {
  it("uses the selected timezone in both languages", () => {
    for (const locale of ["en", "it"] as const) {
      expect(formatDateTime("2026-09-10T12:00:00Z", locale, "America/New_York")).toContain("08:00");
      expect(formatDateTime("2026-09-10T12:00:00Z", locale, "Europe/Rome")).toContain("14:00");
    }
  });
  it("handles the daylight-saving boundary in the configured timezone", () => {
    expect(formatDateTime("2026-03-08T06:30:00Z", "en", "America/New_York")).toContain("01:30");
    expect(formatDateTime("2026-03-08T07:30:00Z", "en", "America/New_York")).toContain("03:30");
  });
  it("provides a consistent fallback for missing or invalid settings", () => {
    expect(publicTimezone(undefined)).toBe("Europe/Rome");
    expect(publicTimezone("not-a-zone")).toBe("Europe/Rome");
    expect(publicTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});
