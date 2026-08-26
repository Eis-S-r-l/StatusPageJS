"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import {
  auditLogs,
  categories,
  incidents,
  incidentUpdates,
  incidentServices,
  maintenances,
  maintenanceServices,
  services,
  systemSettings,
} from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";
import { enqueueEventNotifications } from "@/modules/notifications/enqueue";
import { recalculateAffectedServices, recalculateUptimeForAllServices } from "@/modules/uptime/recalculate";

const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");
const requiredText = z.string().trim().min(1).max(500);
const date = z.string().min(1).transform((value, context) => {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const parsed = new Date(hasTimezone ? value : `${value}Z`);
  if (!Number.isFinite(parsed.getTime())) {
    context.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return parsed;
});
const optionalDate = z.preprocess(
  (value) => value === "" || value === undefined ? undefined : value,
  date.optional(),
);

class SafeActionError extends Error {}

function values(form: FormData) {
  return Object.fromEntries(form.entries());
}

function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Please check the form.";
  if (error instanceof SafeActionError) return error.message;
  if (error instanceof Error && /unique|duplicate/i.test(error.message)) return "That slug is already in use.";
  return "The change could not be saved. Please try again.";
}

function logFollowUpFailure(operation: string, error: unknown): void {
  console.error(
    `${operation} follow-up failed`,
    error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
  );
}

function finish(path: string, error?: unknown): never {
  revalidatePath("/admin");
  revalidatePath(path);
  revalidatePath("/en", "layout");
  revalidatePath("/it", "layout");
  redirect(error ? `${path}?error=${encodeURIComponent(message(error))}` : `${path}?saved=1`);
}

async function audit(actorSubject: string, action: string, entityType: string, entityId?: string, after?: Record<string, unknown>) {
  await getDb().insert(auditLogs).values({ actorSubject, action, entityType, entityId, after });
}

export async function createCategory(form: FormData) {
  const admin = await requireAdmin();
  const schema = z.object({ slug, nameEn: requiredText, nameIt: requiredText, displayOrder: z.coerce.number().int().min(0).default(0) });
  try {
    const input = schema.parse(values(form));
    const [created] = await getDb().insert(categories).values(input).returning({ id: categories.id });
    await audit(admin.subject, "create", "category", created.id, input);
  } catch (error) { finish("/admin/services", error); }
  finish("/admin/services");
}

export async function createService(form: FormData) {
  const admin = await requireAdmin();
  const schema = z.object({ categoryId: z.string().uuid(), slug, nameEn: requiredText, nameIt: requiredText, descriptionEn: z.string().trim().max(5000), descriptionIt: z.string().trim().max(5000), monitoringStartedAt: date, displayOrder: z.coerce.number().int().min(0).default(0) });
  let saved = false;
  try {
    const input = schema.parse(values(form));
    const [created] = await getDb().insert(services).values(input).returning({ id: services.id });
    saved = true;
    await recalculateAffectedServices([created.id]);
    await audit(admin.subject, "create", "service", created.id, { ...input, monitoringStartedAt: input.monitoringStartedAt.toISOString() });
  } catch (error) { finish("/admin/services", saved ? new SafeActionError("The service was saved, but uptime could not be refreshed. Review the worker and database logs.") : error); }
  finish("/admin/services");
}

export async function archiveEntity(form: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ id: z.string().uuid(), type: z.enum(["category", "service"]) }).parse(values(form));
  try {
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      if (input.type === "category") {
        await tx.update(categories).set({ archivedAt: now, isActive: false, updatedAt: now }).where(eq(categories.id, input.id));
        await tx.update(services).set({ archivedAt: now, isActive: false, updatedAt: now }).where(eq(services.categoryId, input.id));
      } else await tx.update(services).set({ archivedAt: now, isActive: false, updatedAt: now }).where(eq(services.id, input.id));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "archive", entityType: input.type, entityId: input.id });
    });
  } catch (error) { finish("/admin/services", error); }
  finish("/admin/services");
}

const incidentSchema = z.object({
  slug, titleEn: requiredText, titleIt: requiredText,
  descriptionEn: z.string().trim().max(10000), descriptionIt: z.string().trim().max(10000),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  startedAt: date, resolvedAt: optionalDate, publish: z.string().optional(), affectsUptime: z.string().optional(),
});

export async function createIncident(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/incidents";
  let saved = false;
  try {
    const input = incidentSchema.parse(values(form));
    const serviceIds = z.array(z.string().uuid()).min(1, "Select at least one service").parse(form.getAll("serviceIds"));
    const resolvedAt = input.resolvedAt ?? null;
    if (input.status === "resolved" && !resolvedAt) throw new SafeActionError("A resolved incident needs a resolution time.");
    if (input.status !== "resolved" && resolvedAt) throw new SafeActionError("Only a resolved incident can have a resolution time.");
    if (resolvedAt && resolvedAt < input.startedAt) throw new SafeActionError("Resolution time must be after the incident start.");
    const publishedAt = input.publish ? new Date() : null;
    const db = getDb();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(incidents).values({ id, slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: input.descriptionEn, descriptionIt: input.descriptionIt, status: input.status, startedAt: input.startedAt, resolvedAt, isPublished: Boolean(input.publish), publishedAt });
      await tx.insert(incidentServices).values(serviceIds.map((serviceId) => ({ incidentId: id, serviceId, affectsUptime: Boolean(input.affectsUptime) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "incident", entityId: id });
    });
    saved = true;
    await recalculateAffectedServices(serviceIds);
    if (input.publish) await enqueueEventNotifications({ kind: "incident", sourceId: id, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: input.descriptionEn, descriptionIt: input.descriptionIt });
  } catch (error) {
    if (saved) logFollowUpFailure("Incident creation", error);
    finish(path, saved ? new SafeActionError("The incident was saved, but a follow-up uptime or notification job failed. Retry the refresh before relying on the public metric.") : error);
  }
  finish(path);
}

const incidentUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  resolvedAt: optionalDate,
  messageEn: requiredText,
  messageIt: requiredText,
  publish: z.string().optional(),
});

export async function updateIncident(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/incidents";
  let saved = false;
  try {
    const input = incidentUpdateSchema.parse(values(form));
    const db = getDb();
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, input.id)).limit(1);
    if (!incident || incident.archivedAt) throw new SafeActionError("That incident is no longer available.");
    const links = await db.select({ serviceId: incidentServices.serviceId }).from(incidentServices).where(eq(incidentServices.incidentId, input.id));
    const serviceIds = links.map((link) => link.serviceId);
    const resolvedAt = input.status === "resolved" ? input.resolvedAt : null;
    if (input.status === "resolved" && !resolvedAt) throw new SafeActionError("A resolved incident needs a resolution time.");
    if (resolvedAt && resolvedAt < incident.startedAt) throw new SafeActionError("Resolution time must be after the incident start.");
    const updateId = randomUUID();
    const now = new Date();
    const publishing = Boolean(input.publish) && !incident.isPublished;
    const willBePublished = incident.isPublished || publishing;
    await db.transaction(async (tx) => {
      await tx.update(incidents).set({ status: input.status, resolvedAt, isPublished: willBePublished, publishedAt: incident.publishedAt ?? (publishing ? now : null), updatedAt: now }).where(eq(incidents.id, input.id));
      await tx.insert(incidentUpdates).values({
        id: updateId,
        incidentId: input.id,
        status: input.status,
        messageEn: input.messageEn,
        messageIt: input.messageIt,
        effectiveAt: now,
        publishedAt: willBePublished ? now : null,
      });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "update", entityType: "incident", entityId: input.id, after: { status: input.status, resolvedAt: resolvedAt?.toISOString() ?? null } });
    });
    saved = true;
    await recalculateAffectedServices(serviceIds);
    if (willBePublished) await enqueueEventNotifications({
      kind: "incident",
      notificationType: publishing ? "incident" : "incident_update",
      versionKey: publishing ? undefined : updateId,
      sourceId: input.id,
      serviceIds,
      titleEn: incident.titleEn,
      titleIt: incident.titleIt,
      descriptionEn: publishing ? incident.descriptionEn : input.messageEn,
      descriptionIt: publishing ? incident.descriptionIt : input.messageIt,
    });
  } catch (error) { finish(path, saved ? new SafeActionError("The incident update was saved, but uptime or notifications could not be refreshed. The worker will retry active uptime calculations.") : error); }
  finish(path);
}

const maintenanceSchema = z.object({
  slug, titleEn: requiredText, titleIt: requiredText,
  descriptionEn: z.string().trim().max(10000), descriptionIt: z.string().trim().max(10000),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  scheduledStartAt: date, scheduledEndAt: date, actualStartAt: optionalDate, actualEndAt: optionalDate, publish: z.string().optional(), affectsUptime: z.string().optional(),
});

export async function createMaintenance(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/maintenance";
  let saved = false;
  try {
    const input = maintenanceSchema.parse(values(form));
    if (input.scheduledEndAt < input.scheduledStartAt) throw new SafeActionError("Scheduled end must be after the start.");
    if (input.actualEndAt && (!input.actualStartAt || input.actualEndAt < input.actualStartAt)) throw new SafeActionError("Actual end must be after the actual start.");
    if (input.status === "in_progress" && !input.actualStartAt) throw new SafeActionError("In-progress maintenance needs an actual start time.");
    if (input.status === "completed" && (!input.actualStartAt || !input.actualEndAt)) throw new SafeActionError("Completed maintenance needs actual start and end times.");
    const serviceIds = z.array(z.string().uuid()).min(1, "Select at least one service").parse(form.getAll("serviceIds"));
    const db = getDb();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(maintenances).values({ id, slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: input.descriptionEn, descriptionIt: input.descriptionIt, status: input.status, scheduledStartAt: input.scheduledStartAt, scheduledEndAt: input.scheduledEndAt, actualStartAt: input.actualStartAt ?? null, actualEndAt: input.actualEndAt ?? null, isPublished: Boolean(input.publish), publishedAt: input.publish ? new Date() : null });
      await tx.insert(maintenanceServices).values(serviceIds.map((serviceId) => ({ maintenanceId: id, serviceId, affectsUptime: Boolean(input.affectsUptime) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "maintenance", entityId: id });
    });
    saved = true;
    await recalculateAffectedServices(serviceIds);
    if (input.publish) await enqueueEventNotifications({ kind: "maintenance", sourceId: id, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: input.descriptionEn, descriptionIt: input.descriptionIt });
  } catch (error) { finish(path, saved ? new SafeActionError("The maintenance event was saved, but a follow-up uptime or notification job failed. Retry the refresh before relying on the public metric.") : error); }
  finish(path);
}

const maintenanceUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  actualStartAt: optionalDate,
  actualEndAt: optionalDate,
  publish: z.string().optional(),
});

export async function updateMaintenance(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/maintenance";
  let saved = false;
  try {
    const input = maintenanceUpdateSchema.parse(values(form));
    if (input.actualEndAt && (!input.actualStartAt || input.actualEndAt < input.actualStartAt)) throw new SafeActionError("Actual end must be after the actual start.");
    if (input.status === "in_progress" && !input.actualStartAt) throw new SafeActionError("In-progress maintenance needs an actual start time.");
    if (input.status === "completed" && (!input.actualStartAt || !input.actualEndAt)) throw new SafeActionError("Completed maintenance needs actual start and end times.");
    const db = getDb();
    const [maintenance] = await db.select().from(maintenances).where(eq(maintenances.id, input.id)).limit(1);
    if (!maintenance || maintenance.archivedAt) throw new SafeActionError("That maintenance event is no longer available.");
    const links = await db.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
    const serviceIds = links.map((link) => link.serviceId);
    const versionKey = randomUUID();
    const now = new Date();
    const publishing = Boolean(input.publish) && !maintenance.isPublished;
    const willBePublished = maintenance.isPublished || publishing;
    await db.transaction(async (tx) => {
      await tx.update(maintenances).set({ status: input.status, actualStartAt: input.actualStartAt ?? null, actualEndAt: input.actualEndAt ?? null, isPublished: willBePublished, publishedAt: maintenance.publishedAt ?? (publishing ? now : null), updatedAt: now }).where(eq(maintenances.id, input.id));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "update", entityType: "maintenance", entityId: input.id, after: { status: input.status, actualStartAt: input.actualStartAt?.toISOString() ?? null, actualEndAt: input.actualEndAt?.toISOString() ?? null } });
    });
    saved = true;
    await recalculateAffectedServices(serviceIds);
    if (willBePublished) {
      const stateEn = input.status.replace("_", " ");
      const stateIt = ({ scheduled: "programmata", in_progress: "in corso", completed: "completata", cancelled: "annullata" } as const)[input.status];
      await enqueueEventNotifications({ kind: "maintenance", notificationType: "maintenance_announcement", versionKey: publishing ? undefined : versionKey, sourceId: input.id, serviceIds, titleEn: maintenance.titleEn, titleIt: maintenance.titleIt, descriptionEn: publishing ? maintenance.descriptionEn : `Maintenance status: ${stateEn}.`, descriptionIt: publishing ? maintenance.descriptionIt : `Stato manutenzione: ${stateIt}.` });
    }
  } catch (error) { finish(path, saved ? new SafeActionError("The maintenance update was saved, but uptime or notifications could not be refreshed. The worker will retry active uptime calculations.") : error); }
  finish(path);
}

export async function archiveEvent(form: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ id: z.string().uuid(), type: z.enum(["incident", "maintenance"]) }).parse(values(form));
  const path = input.type === "incident" ? "/admin/incidents" : "/admin/maintenance";
  let saved = false;
  try {
    const db = getDb();
    const links = input.type === "incident"
      ? await db.select({ serviceId: incidentServices.serviceId }).from(incidentServices).where(eq(incidentServices.incidentId, input.id))
      : await db.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
    const now = new Date();
    await db.transaction(async (tx) => {
      if (input.type === "incident") await tx.update(incidents).set({ archivedAt: now, updatedAt: now }).where(eq(incidents.id, input.id));
      else await tx.update(maintenances).set({ archivedAt: now, updatedAt: now }).where(eq(maintenances.id, input.id));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "archive", entityType: input.type, entityId: input.id });
    });
    saved = true;
    await recalculateAffectedServices(links.map((link) => link.serviceId));
  } catch (error) { finish(path, saved ? new SafeActionError("The event was archived, but uptime could not be refreshed. Run the uptime worker before relying on the public metric.") : error); }
  finish(path);
}

export async function updateSettings(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/settings";
  let saved = false;
  try {
    const input = z.object({ companyName: requiredText, publicTimezone: requiredText, uptimeIntervalDays: z.coerce.number().int().min(1).max(3650), plannedMaintenanceAffectsUptime: z.string().optional() }).parse(values(form));
    await getDb().insert(systemSettings).values({ id: 1, companyName: input.companyName, publicTimezone: input.publicTimezone, uptimeIntervalDays: input.uptimeIntervalDays, plannedMaintenanceAffectsUptime: Boolean(input.plannedMaintenanceAffectsUptime) }).onConflictDoUpdate({ target: systemSettings.id, set: { companyName: input.companyName, publicTimezone: input.publicTimezone, uptimeIntervalDays: input.uptimeIntervalDays, plannedMaintenanceAffectsUptime: Boolean(input.plannedMaintenanceAffectsUptime), updatedAt: new Date() } });
    saved = true;
    await recalculateUptimeForAllServices();
    await audit(admin.subject, "update", "settings", "1", input);
  } catch (error) { finish(path, saved ? new SafeActionError("Settings were saved, but the uptime refresh failed. The public page may show the previous calculation until the worker retries.") : error); }
  finish(path);
}
