export const MILLISECONDS_PER_DAY = 86_400_000;

export interface DowntimeInterval {
  start: Date;
  /** A missing end represents downtime that is still active at calculation time. */
  end: Date | null;
}

export interface CalculateUptimeInput {
  now: Date;
  intervalDays: number;
  monitoringStartedAt: Date;
  incidents?: readonly DowntimeInterval[];
  maintenances?: readonly DowntimeInterval[];
  includeMaintenance?: boolean;
}

export interface UptimeResult {
  windowStart: Date;
  windowEnd: Date;
  totalMonitoredSeconds: number;
  downtimeSeconds: number;
  uptimePercentage: number | null;
  status: "available" | "unavailable";
  mergedDowntimeIntervals: ReadonlyArray<{
    start: Date;
    end: Date;
  }>;
}

function assertValidDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) throw new TypeError(`${name} is invalid`);
}

/** Calculates the union of qualifying downtime in the half-open [start, end) window. */
export function calculateUptime(input: CalculateUptimeInput): UptimeResult {
  assertValidDate(input.now, "now");
  assertValidDate(input.monitoringStartedAt, "monitoringStartedAt");
  if (!Number.isFinite(input.intervalDays) || input.intervalDays <= 0) {
    throw new RangeError("intervalDays must be a positive finite number");
  }

  const windowEndMs = input.now.getTime();
  const configuredStartMs = windowEndMs - input.intervalDays * MILLISECONDS_PER_DAY;
  const windowStartMs = Math.max(
    configuredStartMs,
    input.monitoringStartedAt.getTime(),
  );
  const totalMilliseconds = Math.max(0, windowEndMs - windowStartMs);

  const candidates = [
    ...(input.incidents ?? []),
    ...(input.includeMaintenance ? (input.maintenances ?? []) : []),
  ];

  const clipped = candidates
    .map((interval, index) => {
      assertValidDate(interval.start, `downtime[${index}].start`);
      if (interval.end) assertValidDate(interval.end, `downtime[${index}].end`);

      const rawStart = interval.start.getTime();
      const explicitEnd = interval.end?.getTime();
      if (explicitEnd !== undefined && explicitEnd < rawStart) {
        throw new RangeError(`downtime[${index}] ends before it starts`);
      }
      // An unresolved incident may have been entered with a future start. It
      // has no overlap with the current window yet and must not be mistaken
      // for an explicitly inverted interval.
      const rawEnd = explicitEnd ?? windowEndMs;

      return {
        startMs: Math.max(rawStart, windowStartMs),
        endMs: Math.min(rawEnd, windowEndMs),
      };
    })
    .filter((interval) => interval.startMs < interval.endMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const interval of clipped) {
    const previous = merged.at(-1);
    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval });
    } else {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    }
  }

  const downtimeMilliseconds = Math.min(
    totalMilliseconds,
    merged.reduce(
      (sum, interval) => sum + interval.endMs - interval.startMs,
      0,
    ),
  );
  const totalMonitoredSeconds = totalMilliseconds / 1000;
  const downtimeSeconds = downtimeMilliseconds / 1000;

  return {
    windowStart: new Date(windowStartMs),
    windowEnd: new Date(windowEndMs),
    totalMonitoredSeconds,
    downtimeSeconds,
    uptimePercentage:
      totalMilliseconds <= 0
        ? null
        : ((totalMilliseconds - downtimeMilliseconds) / totalMilliseconds) * 100,
    status: totalMilliseconds <= 0 ? "unavailable" : "available",
    mergedDowntimeIntervals: merged.map(({ startMs, endMs }) => ({
      start: new Date(startMs),
      end: new Date(endMs),
    })),
  };
}
