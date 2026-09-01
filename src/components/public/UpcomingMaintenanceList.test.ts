import { describe, expect, it } from "vitest";

import type { StatusEvent } from "@/modules/status/types";

import { INITIAL_MAINTENANCE_COUNT, visibleUpcomingMaintenance } from "./UpcomingMaintenanceList";

const events = Array.from({ length: 5 }, (_, index) => ({ slug: `maintenance-${index + 1}` })) as StatusEvent[];

describe("upcoming maintenance list", () => {
  it("shows the first three maintenances before expansion", () => {
    expect(INITIAL_MAINTENANCE_COUNT).toBe(3);
    expect(visibleUpcomingMaintenance(events, false).map((event) => event.slug)).toEqual([
      "maintenance-1",
      "maintenance-2",
      "maintenance-3",
    ]);
  });

  it("shows every upcoming maintenance after expansion", () => {
    expect(visibleUpcomingMaintenance(events, true)).toEqual(events);
  });
});
