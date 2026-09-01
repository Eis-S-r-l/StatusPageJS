import "server-only";

import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notificationJobs, subscriptions } from "@/db/schema";
import { brandingAssetUrl, loadPublicAppearance } from "@/modules/appearance/server";
import { subscriptionConfirmationEmail, unsubscriptionConfirmationEmail } from "@/modules/notifications/email-templates";

import { createSubscriptionToken, hashSubscriptionToken } from "./tokens";

export async function requestEmailSubscription(input: { email: string; language: "en" | "it"; receiveIncidents: boolean; receiveMaintenance: boolean }) {
  const email = input.email.trim().toLowerCase();
  const { token, hash } = createSubscriptionToken();
  const db = getDb();
  const [recent] = await db.select({ updatedAt: subscriptions.updatedAt }).from(subscriptions).where(and(eq(subscriptions.channel, "email"), eq(subscriptions.destination, email))).limit(1);
  if (recent && recent.updatedAt.getTime() > Date.now() - 60_000) return;
  const [subscription] = await db.insert(subscriptions).values({
    channel: "email", destination: email, language: input.language,
    receiveIncidents: input.receiveIncidents, receiveMaintenance: input.receiveMaintenance,
    confirmationTokenHash: hash, unsubscribeTokenHash: null, unsubscribeRequestedAt: null, confirmedAt: null, unsubscribedAt: null,
  }).onConflictDoUpdate({
    target: [subscriptions.channel, subscriptions.destination],
    set: { language: input.language, receiveIncidents: input.receiveIncidents, receiveMaintenance: input.receiveMaintenance, confirmationTokenHash: hash, unsubscribeTokenHash: null, unsubscribeRequestedAt: null, confirmedAt: null, unsubscribedAt: null, updatedAt: new Date() },
  }).returning({ id: subscriptions.id });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const confirmationUrl = new URL("/api/subscribe/confirm", appUrl);
  confirmationUrl.searchParams.set("token", token);
  confirmationUrl.searchParams.set("lang", input.language);
  const appearance = await loadPublicAppearance();
  const logoPath = brandingAssetUrl("logo-dark", appearance) ?? brandingAssetUrl("logo-light", appearance);
  const template = subscriptionConfirmationEmail({
    locale: input.language,
    actionUrl: confirmationUrl.toString(),
    companyName: appearance.companyName,
    logoUrl: logoPath ? new URL(logoPath, appUrl).toString() : null,
  });
  await db.insert(notificationJobs).values({
    subscriptionId: subscription.id,
    type: "subscription_confirmation",
    idempotencyKey: `subscription-confirmation:${subscription.id}:${hash.slice(0, 16)}`,
    payload: template,
  }).onConflictDoNothing();
}

export async function confirmEmailSubscription(token: string): Promise<"en" | "it" | null> {
  const validSince = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [updated] = await getDb().update(subscriptions).set({ confirmedAt: new Date(), confirmationTokenHash: null, updatedAt: new Date() })
    .where(and(eq(subscriptions.confirmationTokenHash, hashSubscriptionToken(token)), gt(subscriptions.updatedAt, validSince))).returning({ language: subscriptions.language });
  return updated?.language ?? null;
}

export async function pendingEmailSubscriptionLocale(token: string): Promise<"en" | "it" | null> {
  const validSince = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [subscription] = await getDb().select({ language: subscriptions.language }).from(subscriptions)
    .where(and(eq(subscriptions.confirmationTokenHash, hashSubscriptionToken(token)), gt(subscriptions.updatedAt, validSince))).limit(1);
  return subscription?.language ?? null;
}

export async function requestEmailUnsubscription(input: { email: string; language: "en" | "it" }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const db = getDb();
  const [subscription] = await db.select({ id: subscriptions.id, language: subscriptions.language, unsubscribeRequestedAt: subscriptions.unsubscribeRequestedAt })
    .from(subscriptions).where(and(eq(subscriptions.channel, "email"), eq(subscriptions.destination, email), isNotNull(subscriptions.confirmedAt), isNull(subscriptions.unsubscribedAt))).limit(1);
  if (!subscription || (subscription.unsubscribeRequestedAt && subscription.unsubscribeRequestedAt.getTime() > Date.now() - 60_000)) return;

  const { token, hash } = createSubscriptionToken();
  const now = new Date();
  await db.update(subscriptions).set({ unsubscribeTokenHash: hash, unsubscribeRequestedAt: now, updatedAt: now }).where(eq(subscriptions.id, subscription.id));
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const confirmationUrl = new URL("/api/unsubscribe/confirm", appUrl);
  confirmationUrl.searchParams.set("token", token);
  confirmationUrl.searchParams.set("lang", input.language);
  const appearance = await loadPublicAppearance();
  const logoPath = brandingAssetUrl("logo-dark", appearance) ?? brandingAssetUrl("logo-light", appearance);
  const template = unsubscriptionConfirmationEmail({
    locale: input.language,
    actionUrl: confirmationUrl.toString(),
    companyName: appearance.companyName,
    logoUrl: logoPath ? new URL(logoPath, appUrl).toString() : null,
  });
  await db.insert(notificationJobs).values({
    subscriptionId: subscription.id,
    type: "unsubscription_confirmation",
    idempotencyKey: `unsubscription-confirmation:${subscription.id}:${hash.slice(0, 16)}`,
    payload: template,
  }).onConflictDoNothing();
}

export async function confirmEmailUnsubscription(token: string): Promise<"en" | "it" | null> {
  const validSince = new Date(Date.now() - 24 * 60 * 60_000);
  const [deleted] = await getDb().delete(subscriptions)
    .where(and(eq(subscriptions.unsubscribeTokenHash, hashSubscriptionToken(token)), gt(subscriptions.unsubscribeRequestedAt, validSince)))
    .returning({ language: subscriptions.language });
  return deleted?.language ?? null;
}
