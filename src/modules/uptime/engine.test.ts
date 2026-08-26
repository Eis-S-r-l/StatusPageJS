import { describe, expect, it } from "vitest";

import { calculateUptime, type DowntimeInterval } from "./engine";

const date = (iso: string) => new Date(iso);
const now = date("2026-08-26T12:00:00.000Z");
const day = 86_400;

function calculate(
  incidents: DowntimeInterval[] = [],
  overrides: Partial<Parameters<typeof calculateUptime>[0]> = {},
) {
  return calculateUptime({
    now,
    intervalDays: 1,
    monitoringStartedAt: date("2020-01-01T00:00:00.000Z"),
    incidents,
    ...overrides,
  });
}

describe("calculateUptime", () => {
  it("merges overlapping and touching intervals without double counting", () => {
    const result = calculate([
      {
        start: date("2026-08-26T02:00:00Z"),
        end: date("2026-08-26T05:00:00Z"),
      },
      {
        start: date("2026-08-26T04:00:00Z"),
        end: date("2026-08-26T07:00:00Z"),
      },
      {
        start: date("2026-08-26T07:00:00Z"),
        end: date("2026-08-26T08:00:00Z"),
      },
    ]);

    expect(result.downtimeSeconds).toBe(6 * 3600);
    expect(result.mergedDowntimeIntervals).toHaveLength(1);
    expect(result.uptimePercentage).toBe(75);
  });

  it("clips downtime to both ends of the rolling window", () => {
    const result = calculate([
      {
        start: date("2026-08-25T08:00:00Z"),
        end: date("2026-08-25T14:00:00Z"),
      },
      {
        start: date("2026-08-26T10:00:00Z"),
        end: date("2026-08-26T15:00:00Z"),
      },
    ]);

    expect(result.windowStart).toEqual(date("2026-08-25T12:00:00Z"));
    expect(result.downtimeSeconds).toBe(4 * 3600);
  });

  it("uses now as the end of active downtime", () => {
    const result = calculate([
      { start: date("2026-08-26T09:30:00Z"), end: null },
    ]);

    expect(result.downtimeSeconds).toBe(2.5 * 3600);
    expect(result.mergedDowntimeIntervals[0]?.end).toEqual(now);
  });

  it("uses monitoring start when it is later than the configured start", () => {
    const result = calculate(
      [
        {
          start: date("2026-08-26T07:00:00Z"),
          end: date("2026-08-26T10:00:00Z"),
        },
      ],
      { monitoringStartedAt: date("2026-08-26T08:00:00Z") },
    );

    expect(result.windowStart).toEqual(date("2026-08-26T08:00:00Z"));
    expect(result.totalMonitoredSeconds).toBe(4 * 3600);
    expect(result.downtimeSeconds).toBe(2 * 3600);
    expect(result.uptimePercentage).toBe(50);
  });

  it("returns unavailable when there is no eligible monitoring time", () => {
    const result = calculate([], {
      monitoringStartedAt: date("2026-08-27T00:00:00Z"),
    });

    expect(result.status).toBe("unavailable");
    expect(result.totalMonitoredSeconds).toBe(0);
    expect(result.uptimePercentage).toBeNull();
  });

  it("includes maintenance only when requested", () => {
    const maintenance = [
      {
        start: date("2026-08-26T10:00:00Z"),
        end: date("2026-08-26T11:00:00Z"),
      },
    ];

    expect(calculate([], { maintenances: maintenance }).downtimeSeconds).toBe(0);
    expect(
      calculate([], {
        maintenances: maintenance,
        includeMaintenance: true,
      }).downtimeSeconds,
    ).toBe(3600);
  });

  it("retains sub-second precision and obeys half-open boundaries", () => {
    const result = calculate([
      {
        start: date("2026-08-26T11:59:58.250Z"),
        end: date("2026-08-26T12:00:00.750Z"),
      },
      {
        start: now,
        end: date("2026-08-26T12:00:01Z"),
      },
    ]);

    expect(result.totalMonitoredSeconds).toBe(day);
    expect(result.downtimeSeconds).toBe(1.75);
  });

  it("rejects inverted downtime rather than silently corrupting uptime", () => {
    expect(() =>
      calculate([
        {
          start: date("2026-08-26T10:00:00Z"),
          end: date("2026-08-26T09:00:00Z"),
        },
      ]),
    ).toThrow(/ends before/);
  });
});
