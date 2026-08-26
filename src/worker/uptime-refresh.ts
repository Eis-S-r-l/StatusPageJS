import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { incidents, incidentServices, maintenances, maintenanceServices } from "@/db/schema";
import { recalculateAffectedServices, recalculateUptimeForAllServices } from "@/modules/uptime/recalculate";

export async function refreshActiveUptime() {
  const db = getDb();
  const [incidentRows, maintenanceRows] = await Promise.all([
    db.select({ serviceId: incidentServices.serviceId }).from(incidentServices).innerJoin(incidents, eq(incidentServices.incidentId, incidents.id)).where(and(eq(incidentServices.affectsUptime, true), eq(incidents.isPublished, true), isNull(incidents.resolvedAt), isNull(incidents.archivedAt))),
    db.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).innerJoin(maintenances, eq(maintenanceServices.maintenanceId, maintenances.id)).where(and(eq(maintenanceServices.affectsUptime, true), eq(maintenances.isPublished, true), eq(maintenances.status, "in_progress"), isNull(maintenances.actualEndAt), isNull(maintenances.archivedAt))),
  ]);
  return recalculateAffectedServices([...incidentRows, ...maintenanceRows].map((row) => row.serviceId));
}

export const refreshDailyUptime = recalculateUptimeForAllServices;
