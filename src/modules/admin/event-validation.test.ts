import { describe, expect, it } from "vitest";
import { requiredUtcDate, validateIncidentTiming, validateMaintenanceTiming } from "./event-validation";

const now = new Date("2026-08-26T12:00:00.000Z");

describe("event timestamp validation", () => {
  it("requires an explicit browser timezone", () => {
    expect(requiredUtcDate.safeParse("2026-08-26T12:00").success).toBe(false);
    expect(requiredUtcDate.parse("2026-08-26T12:00:00+02:00").toISOString()).toBe("2026-08-26T10:00:00.000Z");
  });

  it("rejects future incident timestamps", () => {
    expect(validateIncidentTiming({ status: "investigating", startedAt: new Date("2026-08-26T12:01:01Z") }, now)).toMatch(/future/);
    expect(validateIncidentTiming({ status: "resolved", startedAt: new Date("2026-08-26T10:00:00Z"), resolvedAt: new Date("2026-08-26T12:01:01Z") }, now)).toMatch(/future/);
  });

  it("allows future scheduled dates but not future actual dates", () => {
    expect(validateMaintenanceTiming({ status: "scheduled", scheduledStartAt: new Date("2026-09-01T10:00:00Z"), scheduledEndAt: new Date("2026-09-01T11:00:00Z") }, now)).toBeNull();
    expect(validateMaintenanceTiming({ status: "in_progress", scheduledStartAt: new Date("2026-09-01T10:00:00Z"), scheduledEndAt: new Date("2026-09-01T11:00:00Z"), actualStartAt: new Date("2026-08-26T12:01:01Z") }, now)).toMatch(/future/);
  });
});
