import "server-only";

import { asc, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  categories,
  incidents,
  maintenances,
  notificationJobs,
  services,
  subscriptions,
  systemSettings,
} from "@/db/schema";
import { DEFAULT_APPEARANCE } from "@/modules/appearance/server";
import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE, normalizePalette } from "@/modules/appearance/palette";

export type AdminDataResult<T> =
  | { available: true; data: T }
  | { available: false; message: string };

async function safely<T>(load: () => Promise<T>): Promise<AdminDataResult<T>> {
  if (!process.env.DATABASE_URL) {
    return { available: false, message: "Database setup is required before this section can be used." };
  }
  try {
    return { available: true, data: await load() };
  } catch {
    return { available: false, message: "This section is temporarily unavailable. Check the database connection and migrations." };
  }
}

export const loadServiceManagement = () => safely(async () => {
  const db = getDb();
  const [categoryRows, serviceRows] = await Promise.all([
    db.select().from(categories).where(isNull(categories.archivedAt)).orderBy(asc(categories.displayOrder), asc(categories.nameEn)),
    db.select().from(services).where(isNull(services.archivedAt)).orderBy(asc(services.displayOrder), asc(services.nameEn)),
  ]);
  return { categories: categoryRows, services: serviceRows };
});

export const loadEventFormData = () => safely(async () => {
  const db = getDb();
  const [serviceRows, [settings]] = await Promise.all([
    db.select({ id: services.id, nameEn: services.nameEn }).from(services).where(isNull(services.archivedAt)).orderBy(asc(services.nameEn)),
    db.select({ plannedMaintenanceAffectsUptime: systemSettings.plannedMaintenanceAffectsUptime }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1),
  ]);
  return { services: serviceRows, plannedMaintenanceAffectsUptime: settings?.plannedMaintenanceAffectsUptime ?? false };
});

export const loadIncidents = () => safely(() => getDb().select().from(incidents)
  .where(isNull(incidents.archivedAt)).orderBy(desc(incidents.startedAt)).limit(50));

export const loadMaintenances = () => safely(() => getDb().select().from(maintenances)
  .where(isNull(maintenances.archivedAt)).orderBy(desc(maintenances.scheduledStartAt)).limit(50));

export const loadSettings = () => safely(async () => {
  const [row] = await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  return row ?? { id: 1, uptimeIntervalDays: 30, plannedMaintenanceAffectsUptime: false, publicTimezone: "Europe/Rome", companyName: "EIS" };
});

export const loadAppearanceSettings = () => safely(async () => {
  const [row] = await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  if (!row) return DEFAULT_APPEARANCE;
  return {
    companyName: row.companyName,
    lightPalette: normalizePalette(row.lightPalette, DEFAULT_LIGHT_PALETTE),
    darkPalette: normalizePalette(row.darkPalette, DEFAULT_DARK_PALETTE),
    logoLightFile: row.logoLightFile,
    logoLightMimeType: row.logoLightMimeType,
    logoDarkFile: row.logoDarkFile,
    logoDarkMimeType: row.logoDarkMimeType,
    faviconFile: row.faviconFile,
    faviconMimeType: row.faviconMimeType,
    version: row.updatedAt.getTime().toString(36),
  };
});

export const loadDashboard = () => safely(async () => {
  const db = getDb();
  const [serviceRows, incidentRows, maintenanceRows, subscriberRows, failedJobs] = await Promise.all([
    db.select({ id: services.id }).from(services).where(isNull(services.archivedAt)),
    db.select({ id: incidents.id }).from(incidents).where(isNull(incidents.archivedAt)),
    db.select({ id: maintenances.id }).from(maintenances).where(isNull(maintenances.archivedAt)),
    db.select({ id: subscriptions.id }).from(subscriptions).where(isNull(subscriptions.unsubscribedAt)),
    db.select({ id: notificationJobs.id }).from(notificationJobs).where(eq(notificationJobs.status, "failed")),
  ]);
  return { services: serviceRows.length, incidents: incidentRows.length, maintenances: maintenanceRows.length, subscribers: subscriberRows.length, failedJobs: failedJobs.length };
});

export const loadSubscribers = () => safely(() => getDb().select().from(subscriptions).orderBy(desc(subscriptions.createdAt)).limit(100));
