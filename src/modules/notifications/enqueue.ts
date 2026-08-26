import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notificationJobs, services, subscriptionCategories, subscriptionServices, subscriptions } from "@/db/schema";

interface EventNotification {
  kind: "incident" | "maintenance";
  notificationType?: "incident" | "incident_update" | "maintenance_announcement";
  versionKey?: string;
  sourceId: string;
  serviceIds: string[];
  titleEn: string;
  titleIt: string;
  descriptionEn: string;
  descriptionIt: string;
}

export async function enqueueEventNotifications(event: EventNotification): Promise<number> {
  if (event.serviceIds.length === 0) return 0;
  const db = getDb();
  const [recipients, serviceSelections, categorySelections, affectedServices] = await Promise.all([
    db.select().from(subscriptions).where(and(isNotNull(subscriptions.confirmedAt), isNull(subscriptions.unsubscribedAt), event.kind === "incident" ? eq(subscriptions.receiveIncidents, true) : eq(subscriptions.receiveMaintenance, true))),
    db.select().from(subscriptionServices),
    db.select().from(subscriptionCategories),
    db.select({ id: services.id, categoryId: services.categoryId }).from(services).where(inArray(services.id, event.serviceIds)),
  ]);
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
    const subject = italian ? event.titleIt : event.titleEn;
    const text = italian ? event.descriptionIt : event.descriptionEn;
    const type = event.notificationType ?? (event.kind === "incident" ? "incident" : "maintenance_announcement");
    return {
      subscriptionId: recipient.id,
      type,
      sourceId: event.sourceId,
      idempotencyKey: `${type}:${event.sourceId}:${event.versionKey ?? "initial"}:${recipient.id}`,
      payload: { subject, text: text || subject },
    };
  });
  if (jobs.length) await db.insert(notificationJobs).values(jobs).onConflictDoNothing();
  return jobs.length;
}
