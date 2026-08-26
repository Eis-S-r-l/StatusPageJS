import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { getDb, type Database } from "@/db/client";
import {
  incidents,
  incidentServices,
  maintenances,
  maintenanceServices,
  services,
  serviceUptimeMetrics,
  systemSettings,
} from "@/db/schema";

import { calculateUptime, type DowntimeInterval } from "./engine";

export interface RecalculationOptions {
  db?: Database;
  now?: Date;
  /** Overrides the singleton setting, primarily for controlled imports/tests. */
  intervalDays?: number;
}

export interface RecalculatedMetric {
  serviceId: string;
  status: "available" | "unavailable";
  totalMonitoredSeconds: number;
  downtimeSeconds: number;
  uptimePercentage: number | null;
}

const decimal = (value: number): string => value.toFixed(6);

/**
 * Recalculates and persists the current metric for exactly the supplied services.
 * Call this in the same application operation that mutates incident/maintenance
 * associations so the public page never has to derive uptime itself.
 */
export async function recalculateUptimeForServices(
  serviceIds: readonly string[],
  options: RecalculationOptions = {},
): Promise<RecalculatedMetric[]> {
  const uniqueIds = [...new Set(serviceIds)];
  if (uniqueIds.length === 0) return [];

  const db = options.db ?? getDb();
  const now = options.now ?? new Date();

  return db.transaction(async (tx) => {
    let intervalDays = options.intervalDays;
    if (intervalDays === undefined) {
      const [settings] = await tx
        .select({ intervalDays: systemSettings.uptimeIntervalDays })
        .from(systemSettings)
        .where(eq(systemSettings.id, 1))
        .limit(1);
      intervalDays = settings?.intervalDays ?? 30;
    }

    const selectedServices = await tx
      .select({
        id: services.id,
        monitoringStartedAt: services.monitoringStartedAt,
      })
      .from(services)
      .where(inArray(services.id, uniqueIds));

    const incidentRows = await tx
      .select({
        serviceId: incidentServices.serviceId,
        start: incidents.startedAt,
        end: incidents.resolvedAt,
      })
      .from(incidentServices)
      .innerJoin(incidents, eq(incidentServices.incidentId, incidents.id))
      .where(
        and(
          inArray(incidentServices.serviceId, uniqueIds),
          eq(incidentServices.affectsUptime, true),
          eq(incidents.isPublished, true),
          isNull(incidents.archivedAt),
        ),
      );

    const maintenanceRows = await tx
      .select({
        serviceId: maintenanceServices.serviceId,
        scheduledStart: maintenances.scheduledStartAt,
        scheduledEnd: maintenances.scheduledEndAt,
        actualStart: maintenances.actualStartAt,
        actualEnd: maintenances.actualEndAt,
        status: maintenances.status,
      })
      .from(maintenanceServices)
      .innerJoin(
        maintenances,
        eq(maintenanceServices.maintenanceId, maintenances.id),
      )
      .where(
        and(
          inArray(maintenanceServices.serviceId, uniqueIds),
          eq(maintenanceServices.affectsUptime, true),
          eq(maintenances.isPublished, true),
          isNull(maintenances.archivedAt),
          ne(maintenances.status, "cancelled"),
        ),
      );

    const incidentsByService = new Map<string, DowntimeInterval[]>();
    for (const row of incidentRows) {
      const list = incidentsByService.get(row.serviceId) ?? [];
      list.push({ start: row.start, end: row.end });
      incidentsByService.set(row.serviceId, list);
    }

    const maintenanceByService = new Map<string, DowntimeInterval[]>();
    for (const row of maintenanceRows) {
      const list = maintenanceByService.get(row.serviceId) ?? [];
      const start = row.actualStart ?? row.scheduledStart;
      const end =
        row.actualEnd ??
        (row.status === "in_progress" ? null : row.scheduledEnd);
      list.push({ start, end });
      maintenanceByService.set(row.serviceId, list);
    }

    const output: RecalculatedMetric[] = [];
    for (const service of selectedServices) {
      const result = calculateUptime({
        now,
        intervalDays,
        monitoringStartedAt: service.monitoringStartedAt,
        incidents: incidentsByService.get(service.id),
        maintenances: maintenanceByService.get(service.id),
        includeMaintenance: true,
      });

      await tx
        .insert(serviceUptimeMetrics)
        .values({
          serviceId: service.id,
          intervalDays,
          windowStart: result.windowStart,
          windowEnd: result.windowEnd,
          totalMonitoredSeconds: decimal(result.totalMonitoredSeconds),
          downtimeSeconds: decimal(result.downtimeSeconds),
          uptimePercentage:
            result.uptimePercentage === null
              ? null
              : result.uptimePercentage.toFixed(12),
          status: result.status,
          calculationError: null,
          calculatedAt: now,
        })
        .onConflictDoUpdate({
          target: serviceUptimeMetrics.serviceId,
          set: {
            intervalDays,
            windowStart: result.windowStart,
            windowEnd: result.windowEnd,
            totalMonitoredSeconds: decimal(result.totalMonitoredSeconds),
            downtimeSeconds: decimal(result.downtimeSeconds),
            uptimePercentage:
              result.uptimePercentage === null
                ? null
                : result.uptimePercentage.toFixed(12),
            status: result.status,
            calculationError: null,
            calculatedAt: now,
          },
        });

      output.push({
        serviceId: service.id,
        status: result.status,
        totalMonitoredSeconds: result.totalMonitoredSeconds,
        downtimeSeconds: result.downtimeSeconds,
        uptimePercentage: result.uptimePercentage,
      });
    }

    return output;
  });
}

/** Semantic mutation hook used after an incident or maintenance changes. */
export const recalculateAffectedServices = recalculateUptimeForServices;

/** Recalculates every active, non-archived service after a global setting changes. */
export async function recalculateUptimeForAllServices(
  options: RecalculationOptions = {},
): Promise<RecalculatedMetric[]> {
  const db = options.db ?? getDb();
  const rows = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.isActive, true), isNull(services.archivedAt)));

  return recalculateUptimeForServices(
    rows.map((row) => row.id),
    { ...options, db },
  );
}
