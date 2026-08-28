import { describe, expect, it } from "vitest";
import { isValidTimezone, requiredUtcDate, shouldApplyEffectiveUpdate, validateIncidentTiming, validateMaintenanceTiming, validateUpdateEffectiveAt } from "./event-validation";

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

  it("accepts historical updates while rejecting future or pre-incident dates", () => {
    expect(validateUpdateEffectiveAt(new Date("2026-08-26T11:00:00Z"), now, new Date("2026-08-26T10:00:00Z"))).toBeNull();
    expect(validateUpdateEffectiveAt(new Date("2026-08-26T12:01:01Z"), now)).toMatch(/future/);
    expect(validateUpdateEffectiveAt(new Date("2026-08-26T09:59:59Z"), now, new Date("2026-08-26T10:00:00Z"))).toMatch(/predate/);
  });

  it("validates configured public timezones", () => {
    expect(isValidTimezone("Europe/Rome")).toBe(true);
    expect(isValidTimezone("not/a-timezone")).toBe(false);
  });

  it("does not let older backfilled updates rewind the current status", () => {
    const current = new Date("2026-08-26T11:00:00Z");
    expect(shouldApplyEffectiveUpdate(current, new Date("2026-08-26T10:00:00Z"))).toBe(false);
    expect(shouldApplyEffectiveUpdate(current, new Date("2026-08-26T11:00:00Z"))).toBe(true);
    expect(shouldApplyEffectiveUpdate(current, new Date("2026-08-26T12:00:00Z"))).toBe(true);
  });
});
