import { describe, expect, it } from "vitest";

import { formatEventDuration } from "./EventDuration";

describe("formatEventDuration", () => {
  it("shows elapsed time before the ongoing label", () => {
    expect(formatEventDuration("2026-08-26T08:00:00Z", null, "en", "2026-08-27T10:35:00Z")).toBe("1 d 2 h 35 min · Ongoing");
    expect(formatEventDuration("2026-08-27T10:00:00Z", null, "it", "2026-08-27T10:05:00Z")).toBe("5 min · In corso");
  });

  it("keeps resolved durations static", () => {
    expect(formatEventDuration("2026-08-27T08:00:00Z", "2026-08-27T09:30:00Z", "en", "2026-08-27T12:00:00Z")).toBe("1 h 30 min");
  });
});
