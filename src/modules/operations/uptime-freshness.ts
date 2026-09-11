import { DAILY_REFRESH_MS } from "./config";

export interface UptimeFreshnessInput {
  calculatedAt: Date | null;
  metricIntervalDays: number | null;
  intervalDays: number;
  status: "available" | "unavailable" | "error" | null;
  activeDowntime: boolean;
}

export function uptimeStaleReason(metric: UptimeFreshnessInput, now: Date, activeRefreshMs: number): string | null {
  if (!metric.calculatedAt || !metric.status) return "No uptime calculation is available yet.";
  if (metric.status === "error") return "The last uptime calculation failed.";
  if (metric.metricIntervalDays !== metric.intervalDays) return "The calculation uses the previous uptime period.";
  const allowedAge = metric.activeDowntime
    ? Math.max(2 * 60_000, activeRefreshMs * 3)
    : DAILY_REFRESH_MS + 5 * 60_000;
  if (now.getTime() - metric.calculatedAt.getTime() > allowedAge) {
    return metric.activeDowntime ? "Uptime has stopped updating during active downtime." : "The daily uptime calculation is overdue.";
  }
  return null;
}
