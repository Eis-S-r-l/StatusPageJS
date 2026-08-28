import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  categories,
  incidents,
  incidentServices,
  incidentUpdates,
  maintenances,
  maintenanceServices,
  maintenanceUpdates,
  notificationJobs,
  services,
  subscriptions,
  systemSettings,
} from "@/db/schema";
import { DEFAULT_APPEARANCE } from "@/modules/appearance/server";
import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE, normalizePalette } from "@/modules/appearance/palette";
import { sortServicesForManagement } from "@/modules/admin/service-validation";

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
  return { categories: categoryRows, services: sortServicesForManagement(categoryRows, serviceRows) };
});

export const loadEventFormData = () => safely(async () => {
  const db = getDb();
  const [serviceRows, [settings]] = await Promise.all([
    db.select({ id: services.id, nameEn: services.nameEn }).from(services).where(isNull(services.archivedAt)).orderBy(asc(services.nameEn)),
    db.select({ plannedMaintenanceAffectsUptime: systemSettings.plannedMaintenanceAffectsUptime }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1),
  ]);
  return { services: serviceRows, plannedMaintenanceAffectsUptime: settings?.plannedMaintenanceAffectsUptime ?? false };
});

export const loadIncidents = () => safely(async () => {
  const db = getDb();
  const rows = await db.select().from(incidents)
    .where(isNull(incidents.archivedAt)).orderBy(desc(incidents.startedAt));
  const [links, updates] = await Promise.all([
    db.select().from(incidentServices),
    db.select().from(incidentUpdates).orderBy(desc(incidentUpdates.effectiveAt)),
  ]);
  return rows.map((row) => ({
    ...row,
    serviceIds: links.filter((link) => link.incidentId === row.id).map((link) => link.serviceId),
    uptimeServiceIds: links.filter((link) => link.incidentId === row.id && link.affectsUptime).map((link) => link.serviceId),
    updates: updates.filter((update) => update.incidentId === row.id),
  }));
});

export const loadMaintenances = () => safely(async () => {
  const db = getDb();
  const rows = await db.select().from(maintenances)
    .where(isNull(maintenances.archivedAt)).orderBy(desc(maintenances.scheduledStartAt));
  const [links, updates] = await Promise.all([
    db.select().from(maintenanceServices),
    db.select().from(maintenanceUpdates).orderBy(desc(maintenanceUpdates.effectiveAt)),
  ]);
  return rows.map((row) => ({
    ...row,
    serviceIds: links.filter((link) => link.maintenanceId === row.id).map((link) => link.serviceId),
    uptimeServiceIds: links.filter((link) => link.maintenanceId === row.id && link.affectsUptime).map((link) => link.serviceId),
    updates: updates.filter((update) => update.maintenanceId === row.id),
  }));
});

export const loadSettings = () => safely(async () => {
  const [row] = await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  return row ?? { id: 1, uptimeIntervalDays: 30, plannedMaintenanceAffectsUptime: false, publicTimezone: "Europe/Rome", companyName: "EIS", statusPageTitle: "EIS Service Status" };
});

export const loadAppearanceSettings = () => safely(async () => {
  const [row] = await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  if (!row) return DEFAULT_APPEARANCE;
  return {
    companyName: row.companyName,
    statusPageTitle: row.statusPageTitle,
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

export interface SubscriberQuery { query?: string; channel?: "all" | "email" | "telegram" | "webex"; status?: "all" | "confirmed" | "pending"; page?: number; }

export const loadSubscribers = (input: SubscriberQuery = {}) => safely(async () => {
  const pageSize = 25;
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const query = input.query?.trim().slice(0, 200) ?? "";
  const conditions: SQL[] = [];
  if (query) conditions.push(or(ilike(subscriptions.destination, `%${query}%`), ilike(subscriptions.channelUsername, `%${query}%`), ilike(subscriptions.channelDisplayName, `%${query}%`))!);
  if (input.channel && input.channel !== "all") conditions.push(eq(subscriptions.channel, input.channel));
  if (input.status === "confirmed") conditions.push(and(isNotNull(subscriptions.confirmedAt), isNull(subscriptions.unsubscribedAt))!);
  if (input.status === "pending") conditions.push(isNull(subscriptions.confirmedAt));
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [[countRow], rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(where),
    db.select().from(subscriptions).where(where).orderBy(desc(subscriptions.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const deliveryRows = rows.length ? await db.selectDistinctOn([notificationJobs.subscriptionId], {
    subscriptionId: notificationJobs.subscriptionId,
    type: notificationJobs.type,
    status: notificationJobs.status,
    attemptCount: notificationJobs.attemptCount,
    lastError: notificationJobs.lastError,
    sentAt: notificationJobs.sentAt,
    updatedAt: notificationJobs.updatedAt,
  }).from(notificationJobs).where(inArray(notificationJobs.subscriptionId, rows.map((row) => row.id)))
    .orderBy(notificationJobs.subscriptionId, desc(notificationJobs.updatedAt)) : [];
  const latestDelivery = new Map<string, (typeof deliveryRows)[number]>();
  for (const delivery of deliveryRows) {
    if (!latestDelivery.has(delivery.subscriptionId)) latestDelivery.set(delivery.subscriptionId, delivery);
  }
  const total = countRow?.count ?? 0;
  return { rows: rows.map((row) => ({ ...row, latestDelivery: latestDelivery.get(row.id) ?? null })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
});
