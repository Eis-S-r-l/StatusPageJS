import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { getDb, type Database, type DatabaseTransaction } from "../../db/client";
import { notificationJobs, services, subscriptionCategories, subscriptionServices, subscriptions, systemSettings } from "../../db/schema";
import { eventNotificationEmail } from "./email-templates";
import { eventNotificationTelegramHtml } from "./telegram-message";
import { eventNotificationWebexText } from "./webex-message";

export interface EventNotification {
  kind: "incident" | "maintenance";
  notificationType?: "incident" | "incident_update" | "maintenance_announcement";
  versionKey?: string;
  sourceId: string;
  slug?: string;
  serviceIds: string[];
  titleEn: string;
  titleIt: string;
  descriptionEn: string;
  descriptionIt: string;
  descriptionHtmlEn?: string;
  descriptionHtmlIt?: string;
  statusEn?: string;
  statusIt?: string;
  startsAt?: Date;
  endsAt?: Date | null;
}

interface EnqueueOptions {
  db?: Database | DatabaseTransaction;
}

export async function enqueueEventNotifications(
  event: EventNotification,
  options: EnqueueOptions = {},
): Promise<number> {
  if (event.serviceIds.length === 0) return 0;
  const db = options.db ?? getDb();
  // Keep these sequential. A transaction is backed by one pg connection, and
  // issuing concurrent statements on it obscures which statement caused a
  // rollback without reducing database round trips.
  const recipients = await db.select().from(subscriptions).where(and(isNotNull(subscriptions.confirmedAt), isNull(subscriptions.unsubscribedAt), event.kind === "incident" ? eq(subscriptions.receiveIncidents, true) : eq(subscriptions.receiveMaintenance, true)));
  const serviceSelections = await db.select().from(subscriptionServices);
  const categorySelections = await db.select().from(subscriptionCategories);
  const affectedServices = await db.select({ id: services.id, categoryId: services.categoryId, nameEn: services.nameEn, nameIt: services.nameIt }).from(services).where(inArray(services.id, event.serviceIds));
  const [appearance] = await db.select({ companyName: systemSettings.companyName, logoDarkFile: systemSettings.logoDarkFile, logoLightFile: systemSettings.logoLightFile, updatedAt: systemSettings.updatedAt }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const logoKind = appearance?.logoDarkFile ? "logo-dark" : appearance?.logoLightFile ? "logo-light" : null;
  const logoPath = logoKind ? `/api/branding/${logoKind}?v=${appearance!.updatedAt.getTime().toString(36)}` : null;
  const logoUrl = logoPath ? new URL(logoPath, appUrl).toString() : null;
  const serviceFilter = new Map<string, Set<string>>();
  const categoryFilter = new Map<string, Set<string>>();
  for (const row of serviceSelections) (serviceFilter.get(row.subscriptionId) ?? serviceFilter.set(row.subscriptionId, new Set()).get(row.subscriptionId)!).add(row.serviceId);
  for (const row of categorySelections) (categoryFilter.get(row.subscriptionId) ?? categoryFilter.set(row.subscriptionId, new Set()).get(row.subscriptionId)!).add(row.categoryId);
  const affectedCategories = new Set(affectedServices.map((row) => row.categoryId));
  const jobs = recipients.filter((recipient) => {
    const selectedServices = serviceFilter.get(recipient.id);
    const selectedCategories = categoryFilter.get(recipient.id);
    if (!selectedServices?.size && !selectedCategories?.size) return true;
    return event.serviceIds.some((id) => selectedServices?.has(id)) || [...affectedCategories].some((id) => selectedCategories?.has(id));
  }).map((recipient) => {
    const italian = recipient.language === "it";
    const locale: "en" | "it" = italian ? "it" : "en";
    const title = italian ? event.titleIt : event.titleEn;
    const text = italian ? event.descriptionIt : event.descriptionEn;
    const richBody = italian ? event.descriptionHtmlIt : event.descriptionHtmlEn;
    const details = [{ label: italian ? "Servizi interessati" : "Affected services", value: affectedServices.map((service) => italian ? service.nameIt : service.nameEn).join(", ") }];
    const eventStatus = italian ? event.statusIt : event.statusEn;
    if (eventStatus) details.unshift({ label: "Status", value: eventStatus });
    const dateLocale = italian ? "it-IT" : "en-GB";
    const timeZone = process.env.APP_TIMEZONE ?? "Europe/Rome";
    if (event.startsAt) details.push({ label: italian ? "Inizio" : "Start", value: event.startsAt.toLocaleString(dateLocale, { timeZone }) });
    if (event.endsAt) details.push({ label: italian ? "Fine" : "End", value: event.endsAt.toLocaleString(dateLocale, { timeZone }) });
    const eventPath = `/${locale}/${event.kind === "incident" ? "incidents" : "maintenance"}/${encodeURIComponent(event.slug ?? event.sourceId)}`;
    const eventUrl = new URL(eventPath, appUrl).toString();
    const messageInput = {
      locale, kind: event.kind, title, body: text || title, bodyHtml: richBody,
      eventUrl, details,
    };
    const payload = {
      ...eventNotificationEmail({
        ...messageInput, unsubscribeUrl: new URL(`/${locale}/unsubscribe`, appUrl).toString(),
        companyName: appearance?.companyName ?? "EIS", logoUrl,
      }),
      telegramHtml: eventNotificationTelegramHtml(messageInput),
      webexText: eventNotificationWebexText(messageInput),
    };
    const type = event.notificationType ?? (event.kind === "incident" ? "incident" : "maintenance_announcement");
    return {
      subscriptionId: recipient.id,
      type,
      sourceId: event.sourceId,
      idempotencyKey: `${type}:${event.sourceId}:${event.versionKey ?? "initial"}:${recipient.id}`,
      payload,
    };
  });
  if (jobs.length) await db.insert(notificationJobs).values(jobs).onConflictDoNothing();
  return jobs.length;
}
