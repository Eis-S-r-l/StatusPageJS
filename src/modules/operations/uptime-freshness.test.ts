import { describe, expect, it } from "vitest";
import { DAILY_REFRESH_MS, isWorkerHealthy, WORKER_STALE_MS } from "./config";
import { uptimeStaleReason, type UptimeFreshnessInput } from "./uptime-freshness";

const now = new Date("2026-09-10T12:00:00Z");
const metric: UptimeFreshnessInput = { calculatedAt: now, metricIntervalDays: 30, intervalDays: 30, status: "available", activeDowntime: false };

describe("operational freshness", () => {
  it("recognizes absent and expired worker heartbeats", () => {
    expect(isWorkerHealthy(null, now)).toBe(false);
    expect(isWorkerHealthy(new Date(now.getTime() - WORKER_STALE_MS - 1), now)).toBe(false);
    expect(isWorkerHealthy(new Date(now.getTime() - 30_000), now)).toBe(true);
  });
  it("allows normal daily freshness but detects stalled active downtime", () => {
    const calculatedAt = new Date(now.getTime() - 10 * 60_000);
    expect(uptimeStaleReason({ ...metric, calculatedAt }, now, 60_000)).toBeNull();
    expect(uptimeStaleReason({ ...metric, calculatedAt, activeDowntime: true }, now, 60_000)).toMatch(/active downtime/);
  });
  it("respects a customized active refresh interval", () => {
    const calculatedAt = new Date(now.getTime() - 10 * 60_000);
    expect(uptimeStaleReason({ ...metric, calculatedAt, activeDowntime: true }, now, 5 * 60_000)).toBeNull();
  });
  it("detects overdue daily calculations", () => {
    expect(uptimeStaleReason({ ...metric, calculatedAt: new Date(now.getTime() - DAILY_REFRESH_MS - 6 * 60_000) }, now, 60_000)).toMatch(/daily/);
  });
  it("detects missing calculations, errors, and old interval settings", () => {
    expect(uptimeStaleReason({ ...metric, calculatedAt: null }, now, 60_000)).toMatch(/No uptime/);
    expect(uptimeStaleReason({ ...metric, status: "error" }, now, 60_000)).toMatch(/failed/);
    expect(uptimeStaleReason({ ...metric, intervalDays: 90 }, now, 60_000)).toMatch(/previous uptime period/);
    expect(uptimeStaleReason({ ...metric, status: "unavailable" }, now, 60_000)).toBeNull();
  });
});
