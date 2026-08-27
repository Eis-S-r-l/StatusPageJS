import { describe, expect, it } from "vitest";

import { parsePage } from "./pagination";
import { paginatePublicEvents } from "./repository";
import type { StatusEvent } from "./types";

const event = (slug: string, startsAt: string): StatusEvent => ({
  kind: "incident", slug, startsAt, endsAt: null, state: "resolved", title: { en: slug, it: slug }, summary: { en: "", it: "" }, affectedServices: [], affectsUptime: false, timeline: [],
});

describe("public history pagination", () => {
  it("uses page one for missing, malformed, repeated, and unsafe page values", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("1.2")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage(["2", "3"])).toBe(1);
    expect(parsePage("999999999999999999999999")).toBe(1);
    expect(parsePage("7")).toBe(7);
  });

  it("orders newest first with a deterministic tie-breaker and clamps the last page", () => {
    const events = [event("a", "2026-08-01T00:00:00Z"), event("z", "2026-08-01T00:00:00Z"), event("older", "2026-07-01T00:00:00Z")];
    expect(paginatePublicEvents(events, 1, 2)).toMatchObject({ page: 1, totalItems: 3, totalPages: 2, events: [{ slug: "z" }, { slug: "a" }] });
    expect(paginatePublicEvents(events, 999, 2)).toMatchObject({ page: 2, totalPages: 2, events: [{ slug: "older" }] });
  });

  it("keeps fixture repository pagination aligned with the public event fixture", async () => {
    const { publicStatusRepository } = await import("./repository");
    const incidents = await publicStatusRepository.listIncidents(1, 20);
    const maintenances = await publicStatusRepository.listMaintenances(20, 20);
    expect(incidents.page).toBe(1);
    expect(incidents.totalItems).toBe(2);
    expect(incidents.events.map((item) => item.slug)).toContain("intermittent-payment-delays");
    expect(maintenances.page).toBe(1);
    expect(maintenances.totalItems).toBe(1);
    expect(maintenances.events.map((item) => item.slug)).toEqual(["database-capacity-upgrade"]);
  });
});
