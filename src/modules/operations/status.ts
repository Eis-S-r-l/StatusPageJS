import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { categories, notificationJobs, services, serviceUptimeMetrics, systemSettings } from "@/db/schema";
import { activeUptimeServiceIds } from "@/worker/uptime-refresh";
import { activeUptimeRefreshMs, isWorkerHealthy, JOB_LEASE_MS } from "./config";
import { readWorkerHeartbeat } from "./heartbeat";
import { uptimeStaleReason } from "./uptime-freshness";

export async function loadOperationsStatus(now = new Date()) {
  const db = getDb();
  const [heartbeatAt, activeIds, [settings], metrics, queueRows] = await Promise.all([
    readWorkerHeartbeat(),
    activeUptimeServiceIds(),
    db.select({ intervalDays: systemSettings.uptimeIntervalDays }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1),
    db.select({
      id: services.id, name: services.nameEn, calculatedAt: serviceUptimeMetrics.calculatedAt,
      metricIntervalDays: serviceUptimeMetrics.intervalDays, status: serviceUptimeMetrics.status,
    }).from(services).innerJoin(categories, eq(services.categoryId, categories.id))
      .leftJoin(serviceUptimeMetrics, eq(services.id, serviceUptimeMetrics.serviceId))
      .where(and(eq(services.isActive, true), isNull(services.archivedAt), eq(categories.isActive, true), isNull(categories.archivedAt))),
    db.select({
      status: notificationJobs.status, count: sql<number>`count(*)::int`,
      oldestScheduledAt: sql<Date | null>`min(${notificationJobs.scheduledAt})`.mapWith(notificationJobs.scheduledAt),
      interrupted: sql<number>`count(*) filter (where ${notificationJobs.updatedAt} < ${new Date(now.getTime() - JOB_LEASE_MS)})::int`,
    }).from(notificationJobs).where(sql`${notificationJobs.status} in ('pending', 'processing', 'failed')`).groupBy(notificationJobs.status),
  ]);
  const activeServices = new Set(activeIds);
  const intervalDays = settings?.intervalDays ?? 30;
  const staleServices = metrics.flatMap((metric) => {
    const reason = uptimeStaleReason({ ...metric, intervalDays, activeDowntime: activeServices.has(metric.id) }, now, activeUptimeRefreshMs());
    return reason ? [{ id: metric.id, name: metric.name, calculatedAt: metric.calculatedAt, reason }] : [];
  });
  const pending = queueRows.find((row) => row.status === "pending");
  return {
    heartbeatAt, workerHealthy: isWorkerHealthy(heartbeatAt, now), staleServices,
    pendingJobs: pending?.count ?? 0,
    oldestPendingAt: pending?.oldestScheduledAt ?? null,
    failedJobs: queueRows.find((row) => row.status === "failed")?.count ?? 0,
    interruptedJobs: queueRows.find((row) => row.status === "processing")?.interrupted ?? 0,
  };
}
