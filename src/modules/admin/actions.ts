"use server";

import { randomUUID } from "node:crypto";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import type { Database, DatabaseTransaction } from "@/db/client";
import {
  auditLogs,
  categories,
  incidents,
  incidentUpdates,
  incidentServices,
  maintenances,
  maintenanceServices,
  maintenanceUpdates,
  notificationJobs,
  services,
  subscriptions,
  systemSettings,
} from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";
import { affectedServiceUnion } from "@/modules/admin/affected-services";
import { formValues, incidentStatusEffectiveAtAfterEdit, initialIncidentStatusEffectiveAt, isValidTimezone, shouldApplyEffectiveUpdate, type EventActionState, optionalUtcDate, requiredUtcDate, validateIncidentTiming, validateMaintenanceTiming, validateUpdateEffectiveAt } from "@/modules/admin/event-validation";
import { categoryAuditPayload, categoryInputSchema, monitoringStartChanged, serviceAuditPayload, serviceInputSchema, type ServiceAdminActionState } from "@/modules/admin/service-validation";
import { richTextToPlainText, sanitizeRichText } from "@/modules/content/rich-text";
import { enqueueEventNotifications } from "@/modules/notifications/enqueue";
import { refreshTelegramProfile } from "@/modules/subscriptions/bot-service";
import { recalculateAffectedServices, recalculateUptimeForAllServices } from "@/modules/uptime/recalculate";

const slug = z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");
const requiredText = z.string().trim().min(1).max(500);
const EVENT_STATUS_LABELS = {
  investigating: { statusEn: "Investigating", statusIt: "In analisi" },
  identified: { statusEn: "Identified", statusIt: "Identificato" },
  monitoring: { statusEn: "Monitoring", statusIt: "In monitoraggio" },
  resolved: { statusEn: "Resolved", statusIt: "Risolto" },
  scheduled: { statusEn: "Scheduled", statusIt: "Programmata" },
  in_progress: { statusEn: "In progress", statusIt: "In corso" },
  completed: { statusEn: "Completed", statusIt: "Completata" },
  cancelled: { statusEn: "Cancelled", statusIt: "Annullata" },
} as const;
class SafeActionError extends Error {}

function maintenanceStatusEffectiveAt(input: { status: "scheduled" | "in_progress" | "completed" | "cancelled"; actualStartAt?: Date | null; actualEndAt?: Date | null }, now: Date): Date {
  if (input.status === "completed" && input.actualEndAt) return input.actualEndAt;
  if (input.status === "in_progress" && input.actualStartAt) return input.actualStartAt;
  return now;
}

function eventServiceSelection(form: FormData) {
  const parsedServiceIds = z.array(z.string().uuid()).min(1, "Select at least one service").parse(form.getAll("serviceIds"));
  const serviceIds = [...new Set(parsedServiceIds)];
  const uptimeServiceIds = [...new Set(z.array(z.string().uuid()).parse(form.getAll("uptimeServiceIds")))];
  const selectedServices = new Set(serviceIds);
  if (uptimeServiceIds.some((serviceId) => !selectedServices.has(serviceId))) {
    throw new SafeActionError("Only affected services can count as downtime.");
  }
  return { serviceIds, uptimeServiceIds: new Set(uptimeServiceIds) };
}

function values(form: FormData) {
  return Object.fromEntries(form.entries());
}

function message(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Please check the form.";
  if (error instanceof SafeActionError) return error.message;
  if (error instanceof Error && /unique|duplicate/i.test(error.message)) return "That slug is already in use.";
  return "The change could not be saved. Please try again.";
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

export async function updateSubscriber(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/subscribers";
  try {
    const input = z.object({ id: z.string().uuid(), language: z.enum(["en", "it"]) }).parse(values(form));
    const changes = { language: input.language, receiveIncidents: form.get("receiveIncidents") === "on", receiveMaintenance: form.get("receiveMaintenance") === "on", updatedAt: new Date() };
    const [updated] = await getDb().update(subscriptions).set(changes).where(eq(subscriptions.id, input.id)).returning({ id: subscriptions.id });
    if (!updated) throw new SafeActionError("That subscriber no longer exists.");
    await audit(admin.subject, "update", "subscription", input.id, changes);
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function deleteSubscriber(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/subscribers";
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(values(form));
    const deleted = await getDb().transaction(async (tx) => {
      const [row] = await tx.delete(subscriptions).where(eq(subscriptions.id, id)).returning({ id: subscriptions.id, channel: subscriptions.channel });
      if (row) await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "delete", entityType: "subscription", entityId: id, before: { channel: row.channel } });
      return row;
    });
    if (!deleted) throw new SafeActionError("That subscriber no longer exists.");
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function refreshTelegramSubscriber(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/subscribers";
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(values(form));
    await refreshTelegramProfile(id);
    await audit(admin.subject, "refresh_profile", "subscription", id);
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function queueWebexTestNotification(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/subscribers";
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(values(form));
    const db = getDb();
    const [subscriber] = await db.select({
      id: subscriptions.id, channel: subscriptions.channel, language: subscriptions.language,
      confirmedAt: subscriptions.confirmedAt, unsubscribedAt: subscriptions.unsubscribedAt,
    }).from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!subscriber || subscriber.channel !== "webex") throw new SafeActionError("That Webex subscriber no longer exists.");
    if (!subscriber.confirmedAt || subscriber.unsubscribedAt) throw new SafeActionError("That Webex subscription is not active.");
    const italian = subscriber.language === "it";
    const jobId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(notificationJobs).values({
        id: jobId, subscriptionId: subscriber.id, type: "incident_update",
        idempotencyKey: `webex-test:${subscriber.id}:${jobId}`,
        payload: {
          subject: italian ? "Test notifiche status page" : "Status page notification test",
          text: italian
            ? "Questo è un messaggio di test inviato da un amministratore della status page. Se lo ricevi, il worker e il bot Webex sono configurati correttamente."
            : "This is a test message sent by a status page administrator. If you receive it, the worker and Webex bot are configured correctly.",
        },
      });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "queue_test_notification", entityType: "subscription", entityId: subscriber.id, after: { channel: "webex", jobId } });
    });
  } catch (error) { finish(path, error); }
  finish(path);
}

function serviceAdminFailure(error: unknown, form: FormData): ServiceAdminActionState {
  return { status: "error", message: message(error), values: formValues(form) };
}

function serviceAdminSuccess(messageText: string): ServiceAdminActionState {
  revalidatePath("/admin");
  revalidatePath("/admin/services");
  revalidatePath("/en", "layout");
  revalidatePath("/it", "layout");
  return { status: "success", message: messageText, submissionId: randomUUID() };
}

async function requireActiveCategory(db: Database | DatabaseTransaction, categoryId: string) {
  const [category] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.isActive, true), isNull(categories.archivedAt))).limit(1);
  if (!category) throw new SafeActionError("Select a category that is still active.");
}

async function ensureUniqueSlug(db: Database | DatabaseTransaction, type: "category" | "service", value: string, exceptId?: string) {
  const table = type === "category" ? categories : services;
  const id = type === "category" ? categories.id : services.id;
  const slugColumn = type === "category" ? categories.slug : services.slug;
  const where = exceptId ? and(eq(slugColumn, value), ne(id, exceptId)) : eq(slugColumn, value);
  const [existing] = await db.select({ id }).from(table).where(where).limit(1);
  if (existing) throw new SafeActionError("That slug is already in use.");
}

export async function createCategory(_previous: ServiceAdminActionState, form: FormData): Promise<ServiceAdminActionState> {
  const admin = await requireAdmin();
  try {
    const input = categoryInputSchema.parse(values(form));
    const db = getDb();
    await db.transaction(async (tx) => {
      await ensureUniqueSlug(tx, "category", input.slug);
      const [created] = await tx.insert(categories).values(input).returning({ id: categories.id });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "category", entityId: created.id, after: categoryAuditPayload(input) });
    });
    return serviceAdminSuccess("Category created.");
  } catch (error) { return serviceAdminFailure(error, form); }
}

export async function editCategory(_previous: ServiceAdminActionState, form: FormData): Promise<ServiceAdminActionState> {
  const admin = await requireAdmin();
  try {
    const input = categoryInputSchema.extend({ id: z.string().uuid() }).parse(values(form));
    const db = getDb();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(categories).where(eq(categories.id, input.id)).limit(1);
      if (!current || current.archivedAt) throw new SafeActionError("That category is no longer available.");
      await ensureUniqueSlug(tx, "category", input.slug, input.id);
      const after = categoryAuditPayload(input);
      await tx.update(categories).set({ ...after, updatedAt: new Date() }).where(eq(categories.id, input.id));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "edit", entityType: "category", entityId: input.id, before: categoryAuditPayload(current), after });
    });
    return serviceAdminSuccess("Category saved.");
  } catch (error) { return serviceAdminFailure(error, form); }
}

export async function createService(_previous: ServiceAdminActionState, form: FormData): Promise<ServiceAdminActionState> {
  const admin = await requireAdmin();
  try {
    const input = serviceInputSchema.parse(values(form));
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      await requireActiveCategory(tx, input.categoryId);
      await ensureUniqueSlug(tx, "service", input.slug);
      const [created] = await tx.insert(services).values(input).returning({ id: services.id });
      await recalculateAffectedServices([created.id], { tx, now });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "service", entityId: created.id, after: serviceAuditPayload(input) });
    });
    return serviceAdminSuccess("Service created.");
  } catch (error) { return serviceAdminFailure(error, form); }
}

export async function editService(_previous: ServiceAdminActionState, form: FormData): Promise<ServiceAdminActionState> {
  const admin = await requireAdmin();
  try {
    const input = serviceInputSchema.extend({ id: z.string().uuid() }).parse(values(form));
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(services).where(eq(services.id, input.id)).limit(1);
      if (!current || current.archivedAt) throw new SafeActionError("That service is no longer available.");
      await requireActiveCategory(tx, input.categoryId);
      await ensureUniqueSlug(tx, "service", input.slug, input.id);
      const after = serviceAuditPayload(input);
      await tx.update(services).set({ ...after, monitoringStartedAt: input.monitoringStartedAt, updatedAt: now }).where(eq(services.id, input.id));
      if (monitoringStartChanged(current.monitoringStartedAt, input.monitoringStartedAt)) {
        await recalculateAffectedServices([input.id], { tx, now });
      }
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "edit", entityType: "service", entityId: input.id, before: serviceAuditPayload(current), after });
    });
    return serviceAdminSuccess("Service saved.");
  } catch (error) { return serviceAdminFailure(error, form); }
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
  startedAt: requiredUtcDate, resolvedAt: optionalUtcDate, publish: z.string().optional(), notifySubscribers: z.string().optional(),
});

function eventFailure(error: unknown, form: FormData): EventActionState {
  return { status: "error", message: message(error), values: formValues(form) };
}

function eventSuccess(messageText: string): EventActionState {
  revalidatePath("/admin");
  revalidatePath("/admin/incidents");
  revalidatePath("/admin/maintenance");
  revalidatePath("/en", "layout");
  revalidatePath("/it", "layout");
  return { status: "success", message: messageText, submissionId: randomUUID() };
}

export async function createIncident(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = incidentSchema.parse(values(form));
    const { serviceIds, uptimeServiceIds } = eventServiceSelection(form);
    const resolvedAt = input.resolvedAt ?? null;
    const timingError = validateIncidentTiming({ ...input, resolvedAt: input.resolvedAt });
    if (timingError) throw new SafeActionError(timingError);
    const now = new Date();
    const publishedAt = input.publish ? now : null;
    const db = getDb();
    const id = randomUUID();
    await db.transaction(async (tx) => {
      const descriptionEn = sanitizeRichText(input.descriptionEn);
      const descriptionIt = sanitizeRichText(input.descriptionIt);
      await tx.insert(incidents).values({ id, slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn, descriptionIt, status: input.status, statusEffectiveAt: initialIncidentStatusEffectiveAt(input), startedAt: input.startedAt, resolvedAt, isPublished: Boolean(input.publish), publishedAt });
      await tx.insert(incidentServices).values(serviceIds.map((serviceId) => ({ incidentId: id, serviceId, affectsUptime: uptimeServiceIds.has(serviceId) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "incident", entityId: id });
      await recalculateAffectedServices(serviceIds, { tx, now });
      if (input.publish && input.notifySubscribers) await enqueueEventNotifications({ kind: "incident", sourceId: id, slug: input.slug, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: richTextToPlainText(descriptionEn), descriptionIt: richTextToPlainText(descriptionIt), descriptionHtmlEn: descriptionEn, descriptionHtmlIt: descriptionIt, ...EVENT_STATUS_LABELS[input.status], startsAt: input.startedAt, endsAt: resolvedAt }, { db: tx });
    });
    return eventSuccess("Incident created.");
  } catch (error) { return eventFailure(error, form); }
}

const incidentUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  resolvedAt: optionalUtcDate,
  effectiveAt: requiredUtcDate,
  messageEn: z.string().trim().min(1).max(10000),
  messageIt: z.string().trim().min(1).max(10000),
  publish: z.string().optional(),
  notifySubscribers: z.string().optional(),
});

export async function updateIncident(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = incidentUpdateSchema.parse(values(form));
    const db = getDb();
    const updateId = randomUUID();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [incident] = await tx.select().from(incidents).where(eq(incidents.id, input.id)).limit(1);
      if (!incident || incident.archivedAt) throw new SafeActionError("That incident is no longer available.");
      const links = await tx.select({ serviceId: incidentServices.serviceId }).from(incidentServices).where(eq(incidentServices.incidentId, input.id));
      const serviceIds = links.map((link) => link.serviceId);
      const resolvedAt = input.status === "resolved" ? input.resolvedAt : undefined;
      const timingError = validateIncidentTiming({ status: input.status, startedAt: incident.startedAt, resolvedAt }, now);
      if (timingError) throw new SafeActionError(timingError);
      const effectiveError = validateUpdateEffectiveAt(input.effectiveAt, now, incident.startedAt);
      if (effectiveError) throw new SafeActionError(effectiveError);
      if (resolvedAt && resolvedAt > input.effectiveAt) throw new SafeActionError("The resolution time cannot be after the update date.");
      const publishing = Boolean(input.publish) && !incident.isPublished;
      const willBePublished = incident.isPublished || publishing;
      const appliesToCurrent = shouldApplyEffectiveUpdate(incident.statusEffectiveAt, input.effectiveAt);
      const messageEn = sanitizeRichText(input.messageEn);
      const messageIt = sanitizeRichText(input.messageIt);
      await tx.update(incidents).set({
        ...(appliesToCurrent ? { status: input.status, statusEffectiveAt: input.effectiveAt, resolvedAt: resolvedAt ?? null } : {}),
        isPublished: willBePublished,
        publishedAt: incident.publishedAt ?? (publishing ? now : null),
        updatedAt: now,
      }).where(eq(incidents.id, input.id));
      if (publishing) await tx.update(incidentUpdates).set({ publishedAt: now, updatedAt: now }).where(and(eq(incidentUpdates.incidentId, input.id), isNull(incidentUpdates.publishedAt)));
      await tx.insert(incidentUpdates).values({
        id: updateId,
        incidentId: input.id,
        status: input.status,
        messageEn,
        messageIt,
        effectiveAt: input.effectiveAt,
        publishedAt: willBePublished ? now : null,
      });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "update", entityType: "incident", entityId: input.id, after: { status: input.status, effectiveAt: input.effectiveAt.toISOString(), resolvedAt: resolvedAt?.toISOString() ?? null, notifySubscribers: Boolean(input.notifySubscribers) } });
      await recalculateAffectedServices(serviceIds, { tx, now });
      if (willBePublished && input.notifySubscribers) await enqueueEventNotifications({
        kind: "incident", notificationType: publishing ? "incident" : "incident_update", versionKey: publishing ? undefined : updateId,
        sourceId: input.id, slug: incident.slug, serviceIds, titleEn: incident.titleEn, titleIt: incident.titleIt,
        descriptionEn: richTextToPlainText(publishing ? incident.descriptionEn : messageEn), descriptionHtmlEn: publishing ? incident.descriptionEn : messageEn,
        descriptionIt: richTextToPlainText(publishing ? incident.descriptionIt : messageIt), descriptionHtmlIt: publishing ? incident.descriptionIt : messageIt,
        ...EVENT_STATUS_LABELS[input.status], startsAt: incident.startedAt, endsAt: resolvedAt,
      }, { db: tx });
    });
    return eventSuccess("Timeline update added.");
  } catch (error) { return eventFailure(error, form); }
}

const incidentUpdateEditSchema = incidentUpdateSchema.omit({
  id: true,
  resolvedAt: true,
  publish: true,
  notifySubscribers: true,
}).extend({
  incidentId: z.string().uuid(),
  updateId: z.string().uuid(),
});

export async function editIncidentUpdate(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = incidentUpdateEditSchema.parse(values(form));
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [[incident], [current]] = await Promise.all([
        tx.select({ id: incidents.id, startedAt: incidents.startedAt, archivedAt: incidents.archivedAt })
          .from(incidents).where(eq(incidents.id, input.incidentId)).limit(1),
        tx.select().from(incidentUpdates).where(and(
          eq(incidentUpdates.id, input.updateId),
          eq(incidentUpdates.incidentId, input.incidentId),
        )).limit(1),
      ]);
      if (!incident || incident.archivedAt) throw new SafeActionError("That incident is no longer available.");
      if (!current) throw new SafeActionError("That timeline update no longer exists.");
      const effectiveError = validateUpdateEffectiveAt(input.effectiveAt, now, incident.startedAt);
      if (effectiveError) throw new SafeActionError(effectiveError);
      const messageEn = sanitizeRichText(input.messageEn);
      const messageIt = sanitizeRichText(input.messageIt);
      const after = {
        incidentId: input.incidentId,
        status: input.status,
        effectiveAt: input.effectiveAt.toISOString(),
        messageEn,
        messageIt,
      };
      await tx.update(incidentUpdates).set({
        status: input.status,
        effectiveAt: input.effectiveAt,
        messageEn,
        messageIt,
        updatedAt: now,
      }).where(and(
        eq(incidentUpdates.id, input.updateId),
        eq(incidentUpdates.incidentId, input.incidentId),
      ));
      await tx.update(incidents).set({ updatedAt: now }).where(eq(incidents.id, input.incidentId));
      await tx.insert(auditLogs).values({
        actorSubject: admin.subject,
        action: "edit",
        entityType: "incident_update",
        entityId: input.updateId,
        before: {
          incidentId: current.incidentId,
          status: current.status,
          effectiveAt: current.effectiveAt.toISOString(),
          messageEn: current.messageEn,
          messageIt: current.messageIt,
        },
        after,
      });
    });
    return eventSuccess("Timeline update saved.");
  } catch (error) { return eventFailure(error, form); }
}

export async function deleteIncidentUpdate(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/incidents";
  try {
    const input = z.object({ incidentId: z.string().uuid(), updateId: z.string().uuid() }).parse(values(form));
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [[incident], [current]] = await Promise.all([
        tx.select({ id: incidents.id, archivedAt: incidents.archivedAt })
          .from(incidents).where(eq(incidents.id, input.incidentId)).limit(1),
        tx.select().from(incidentUpdates).where(and(
          eq(incidentUpdates.id, input.updateId),
          eq(incidentUpdates.incidentId, input.incidentId),
        )).limit(1),
      ]);
      if (!incident || incident.archivedAt) throw new SafeActionError("That incident is no longer available.");
      if (!current) throw new SafeActionError("That timeline update no longer exists.");
      await tx.delete(incidentUpdates).where(and(
        eq(incidentUpdates.id, input.updateId),
        eq(incidentUpdates.incidentId, input.incidentId),
      ));
      await tx.update(incidents).set({ updatedAt: now }).where(eq(incidents.id, input.incidentId));
      await tx.insert(auditLogs).values({
        actorSubject: admin.subject,
        action: "delete",
        entityType: "incident_update",
        entityId: input.updateId,
        before: {
          incidentId: current.incidentId,
          status: current.status,
          effectiveAt: current.effectiveAt.toISOString(),
          messageEn: current.messageEn,
          messageIt: current.messageIt,
        },
      });
    });
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function editIncident(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = incidentSchema.extend({ id: z.string().uuid() }).parse(values(form));
    const { serviceIds, uptimeServiceIds } = eventServiceSelection(form);
    const timingError = validateIncidentTiming({ ...input, resolvedAt: input.resolvedAt });
    if (timingError) throw new SafeActionError(timingError);
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(incidents).where(eq(incidents.id, input.id)).limit(1);
      if (!current || current.archivedAt) throw new SafeActionError("That incident is no longer available.");
      const oldLinks = await tx.select({ serviceId: incidentServices.serviceId }).from(incidentServices).where(eq(incidentServices.incidentId, input.id));
      const publishing = Boolean(input.publish) && !current.isPublished;
      const statusChanged = input.status !== current.status;
      const descriptionEn = sanitizeRichText(input.descriptionEn);
      const descriptionIt = sanitizeRichText(input.descriptionIt);
      await tx.update(incidents).set({ slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn, descriptionIt, status: input.status, statusEffectiveAt: incidentStatusEffectiveAtAfterEdit({ currentStatus: current.status, currentEffectiveAt: current.statusEffectiveAt, nextStatus: input.status, editedAt: now }), startedAt: input.startedAt, resolvedAt: input.resolvedAt ?? null, isPublished: current.isPublished || publishing, publishedAt: current.publishedAt ?? (publishing ? now : null), updatedAt: now }).where(eq(incidents.id, input.id));
      if (publishing) await tx.update(incidentUpdates).set({ publishedAt: now, updatedAt: now }).where(and(eq(incidentUpdates.incidentId, input.id), isNull(incidentUpdates.publishedAt)));
      await tx.delete(incidentServices).where(eq(incidentServices.incidentId, input.id));
      await tx.insert(incidentServices).values(serviceIds.map((serviceId) => ({ incidentId: input.id, serviceId, affectsUptime: uptimeServiceIds.has(serviceId) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "edit", entityType: "incident", entityId: input.id, before: { status: current.status }, after: { status: input.status, manualStatusOverride: statusChanged } });
      await recalculateAffectedServices(affectedServiceUnion(oldLinks.map((link) => link.serviceId), serviceIds), { tx, now });
      if (publishing && input.notifySubscribers) await enqueueEventNotifications({ kind: "incident", sourceId: input.id, slug: input.slug, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: richTextToPlainText(descriptionEn), descriptionIt: richTextToPlainText(descriptionIt), descriptionHtmlEn: descriptionEn, descriptionHtmlIt: descriptionIt, ...EVENT_STATUS_LABELS[input.status], startsAt: input.startedAt, endsAt: input.resolvedAt }, { db: tx });
    });
    return eventSuccess("Incident saved.");
  } catch (error) { return eventFailure(error, form); }
}

const maintenanceSchema = z.object({
  slug, titleEn: requiredText, titleIt: requiredText,
  descriptionEn: z.string().trim().max(10000), descriptionIt: z.string().trim().max(10000),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  scheduledStartAt: requiredUtcDate, scheduledEndAt: requiredUtcDate, actualStartAt: optionalUtcDate, actualEndAt: optionalUtcDate, publish: z.string().optional(), notifySubscribers: z.string().optional(),
});

export async function createMaintenance(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = maintenanceSchema.parse(values(form));
    const timingError = validateMaintenanceTiming(input);
    if (timingError) throw new SafeActionError(timingError);
    const { serviceIds, uptimeServiceIds } = eventServiceSelection(form);
    const db = getDb();
    const id = randomUUID();
    const now = new Date();
    await db.transaction(async (tx) => {
      const descriptionEn = sanitizeRichText(input.descriptionEn);
      const descriptionIt = sanitizeRichText(input.descriptionIt);
      await tx.insert(maintenances).values({ id, slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn, descriptionIt, status: input.status, statusEffectiveAt: maintenanceStatusEffectiveAt(input, now), scheduledStartAt: input.scheduledStartAt, scheduledEndAt: input.scheduledEndAt, actualStartAt: input.actualStartAt ?? null, actualEndAt: input.actualEndAt ?? null, isPublished: Boolean(input.publish), publishedAt: input.publish ? now : null });
      await tx.insert(maintenanceServices).values(serviceIds.map((serviceId) => ({ maintenanceId: id, serviceId, affectsUptime: uptimeServiceIds.has(serviceId) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "create", entityType: "maintenance", entityId: id });
      await recalculateAffectedServices(serviceIds, { tx, now });
      if (input.publish && input.notifySubscribers) await enqueueEventNotifications({ kind: "maintenance", sourceId: id, slug: input.slug, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: richTextToPlainText(descriptionEn), descriptionIt: richTextToPlainText(descriptionIt), descriptionHtmlEn: descriptionEn, descriptionHtmlIt: descriptionIt, ...EVENT_STATUS_LABELS[input.status], startsAt: input.scheduledStartAt, endsAt: input.scheduledEndAt }, { db: tx });
    });
    return eventSuccess("Maintenance created.");
  } catch (error) { return eventFailure(error, form); }
}

const maintenanceUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]),
  actualStartAt: optionalUtcDate,
  actualEndAt: optionalUtcDate,
  effectiveAt: requiredUtcDate,
  messageEn: z.string().trim().min(1).max(10000),
  messageIt: z.string().trim().min(1).max(10000),
  publish: z.string().optional(),
  notifySubscribers: z.string().optional(),
});

export async function updateMaintenance(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = maintenanceUpdateSchema.parse(values(form));
    const db = getDb();
    const updateId = randomUUID();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [maintenance] = await tx.select().from(maintenances).where(eq(maintenances.id, input.id)).limit(1);
      if (!maintenance || maintenance.archivedAt) throw new SafeActionError("That maintenance event is no longer available.");
      const timingError = validateMaintenanceTiming({ ...maintenance, ...input, actualStartAt: input.actualStartAt, actualEndAt: input.actualEndAt }, now);
      if (timingError) throw new SafeActionError(timingError);
      const effectiveError = validateUpdateEffectiveAt(input.effectiveAt, now);
      if (effectiveError) throw new SafeActionError(effectiveError);
      if (input.status === "in_progress" && input.actualStartAt && input.actualStartAt > input.effectiveAt) throw new SafeActionError("The actual start cannot be after the update date.");
      if (input.status === "completed" && input.actualEndAt && input.actualEndAt > input.effectiveAt) throw new SafeActionError("The actual end cannot be after the update date.");
      const links = await tx.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
      const serviceIds = links.map((link) => link.serviceId);
      const publishing = Boolean(input.publish) && !maintenance.isPublished;
      const willBePublished = maintenance.isPublished || publishing;
      const appliesToCurrent = shouldApplyEffectiveUpdate(maintenance.statusEffectiveAt, input.effectiveAt);
      const messageEn = sanitizeRichText(input.messageEn);
      const messageIt = sanitizeRichText(input.messageIt);
      await tx.update(maintenances).set({
        ...(appliesToCurrent ? { status: input.status, statusEffectiveAt: input.effectiveAt, actualStartAt: input.actualStartAt ?? null, actualEndAt: input.actualEndAt ?? null } : {}),
        isPublished: willBePublished,
        publishedAt: maintenance.publishedAt ?? (publishing ? now : null),
        updatedAt: now,
      }).where(eq(maintenances.id, input.id));
      if (publishing) await tx.update(maintenanceUpdates).set({ publishedAt: now, updatedAt: now }).where(and(eq(maintenanceUpdates.maintenanceId, input.id), isNull(maintenanceUpdates.publishedAt)));
      await tx.insert(maintenanceUpdates).values({ id: updateId, maintenanceId: input.id, status: input.status, messageEn, messageIt, effectiveAt: input.effectiveAt, publishedAt: willBePublished ? now : null });
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "update", entityType: "maintenance", entityId: input.id, after: { status: input.status, effectiveAt: input.effectiveAt.toISOString(), actualStartAt: input.actualStartAt?.toISOString() ?? null, actualEndAt: input.actualEndAt?.toISOString() ?? null, notifySubscribers: Boolean(input.notifySubscribers) } });
      await recalculateAffectedServices(serviceIds, { tx, now });
      if (willBePublished && input.notifySubscribers) {
        const labels = EVENT_STATUS_LABELS[input.status];
        await enqueueEventNotifications({ kind: "maintenance", notificationType: "maintenance_announcement", versionKey: publishing ? undefined : updateId, sourceId: input.id, slug: maintenance.slug, serviceIds, titleEn: maintenance.titleEn, titleIt: maintenance.titleIt, descriptionEn: richTextToPlainText(publishing ? maintenance.descriptionEn : messageEn), descriptionIt: richTextToPlainText(publishing ? maintenance.descriptionIt : messageIt), descriptionHtmlEn: publishing ? maintenance.descriptionEn : messageEn, descriptionHtmlIt: publishing ? maintenance.descriptionIt : messageIt, ...labels, startsAt: input.actualStartAt ?? maintenance.scheduledStartAt, endsAt: input.actualEndAt ?? maintenance.scheduledEndAt }, { db: tx });
      }
    });
    return eventSuccess("Maintenance status updated.");
  } catch (error) { return eventFailure(error, form); }
}

export async function editMaintenance(_previous: EventActionState, form: FormData): Promise<EventActionState> {
  const admin = await requireAdmin();
  try {
    const input = maintenanceSchema.extend({ id: z.string().uuid() }).parse(values(form));
    const timingError = validateMaintenanceTiming(input);
    if (timingError) throw new SafeActionError(timingError);
    const { serviceIds, uptimeServiceIds } = eventServiceSelection(form);
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(maintenances).where(eq(maintenances.id, input.id)).limit(1);
      if (!current || current.archivedAt) throw new SafeActionError("That maintenance event is no longer available.");
      if (current.isPublished && input.status !== current.status) throw new SafeActionError("Use Update status to change the status of published maintenance.");
      const oldLinks = await tx.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
      const publishing = Boolean(input.publish) && !current.isPublished;
      const descriptionEn = sanitizeRichText(input.descriptionEn);
      const descriptionIt = sanitizeRichText(input.descriptionIt);
      await tx.update(maintenances).set({ slug: input.slug, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn, descriptionIt, status: input.status, statusEffectiveAt: current.isPublished ? current.statusEffectiveAt : maintenanceStatusEffectiveAt(input, now), scheduledStartAt: input.scheduledStartAt, scheduledEndAt: input.scheduledEndAt, actualStartAt: input.actualStartAt ?? null, actualEndAt: input.actualEndAt ?? null, isPublished: current.isPublished || publishing, publishedAt: current.publishedAt ?? (publishing ? now : null), updatedAt: now }).where(eq(maintenances.id, input.id));
      if (publishing) await tx.update(maintenanceUpdates).set({ publishedAt: now, updatedAt: now }).where(and(eq(maintenanceUpdates.maintenanceId, input.id), isNull(maintenanceUpdates.publishedAt)));
      await tx.delete(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
      await tx.insert(maintenanceServices).values(serviceIds.map((serviceId) => ({ maintenanceId: input.id, serviceId, affectsUptime: uptimeServiceIds.has(serviceId) })));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "edit", entityType: "maintenance", entityId: input.id });
      await recalculateAffectedServices(affectedServiceUnion(oldLinks.map((link) => link.serviceId), serviceIds), { tx, now });
      if (publishing && input.notifySubscribers) await enqueueEventNotifications({ kind: "maintenance", sourceId: input.id, slug: input.slug, serviceIds, titleEn: input.titleEn, titleIt: input.titleIt, descriptionEn: richTextToPlainText(descriptionEn), descriptionIt: richTextToPlainText(descriptionIt), descriptionHtmlEn: descriptionEn, descriptionHtmlIt: descriptionIt, ...EVENT_STATUS_LABELS[input.status], startsAt: input.actualStartAt ?? input.scheduledStartAt, endsAt: input.actualEndAt ?? input.scheduledEndAt }, { db: tx });
    });
    return eventSuccess("Maintenance saved.");
  } catch (error) { return eventFailure(error, form); }
}

export async function archiveEvent(form: FormData) {
  const admin = await requireAdmin();
  const input = z.object({ id: z.string().uuid(), type: z.enum(["incident", "maintenance"]) }).parse(values(form));
  const path = input.type === "incident" ? "/admin/incidents" : "/admin/maintenance";
  try {
    const db = getDb();
    const now = new Date();
    await db.transaction(async (tx) => {
      const links = input.type === "incident"
        ? await tx.select({ serviceId: incidentServices.serviceId }).from(incidentServices).where(eq(incidentServices.incidentId, input.id))
        : await tx.select({ serviceId: maintenanceServices.serviceId }).from(maintenanceServices).where(eq(maintenanceServices.maintenanceId, input.id));
      if (input.type === "incident") await tx.update(incidents).set({ archivedAt: now, updatedAt: now }).where(eq(incidents.id, input.id));
      else await tx.update(maintenances).set({ archivedAt: now, updatedAt: now }).where(eq(maintenances.id, input.id));
      await tx.insert(auditLogs).values({ actorSubject: admin.subject, action: "archive", entityType: input.type, entityId: input.id });
      await recalculateAffectedServices(links.map((link) => link.serviceId), { tx, now });
    });
  } catch (error) { finish(path, error); }
  finish(path);
}

export async function updateSettings(form: FormData) {
  const admin = await requireAdmin();
  const path = "/admin/settings";
  let saved = false;
  try {
    const input = z.object({ companyName: requiredText, statusPageTitle: z.string().trim().min(1, "Enter a status page title.").max(200), publicTimezone: requiredText, uptimeIntervalDays: z.coerce.number().int().min(1).max(3650), plannedMaintenanceAffectsUptime: z.string().optional() }).parse(values(form));
    if (!isValidTimezone(input.publicTimezone)) throw new SafeActionError("Enter a valid IANA timezone, such as Europe/Rome.");
    await getDb().insert(systemSettings).values({ id: 1, companyName: input.companyName, statusPageTitle: input.statusPageTitle, publicTimezone: input.publicTimezone, uptimeIntervalDays: input.uptimeIntervalDays, plannedMaintenanceAffectsUptime: Boolean(input.plannedMaintenanceAffectsUptime) }).onConflictDoUpdate({ target: systemSettings.id, set: { companyName: input.companyName, statusPageTitle: input.statusPageTitle, publicTimezone: input.publicTimezone, uptimeIntervalDays: input.uptimeIntervalDays, plannedMaintenanceAffectsUptime: Boolean(input.plannedMaintenanceAffectsUptime), updatedAt: new Date() } });
    saved = true;
    await recalculateUptimeForAllServices();
    await audit(admin.subject, "update", "settings", "1", input);
  } catch (error) { finish(path, saved ? new SafeActionError("Settings were saved, but the uptime refresh failed. The public page may show the previous calculation until the worker retries.") : error); }
  finish(path);
}
