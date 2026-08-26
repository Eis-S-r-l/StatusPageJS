import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notificationJobs, subscriptions } from "@/db/schema";

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
    confirmationTokenHash: hash, confirmedAt: null, unsubscribedAt: null,
  }).onConflictDoUpdate({
    target: [subscriptions.channel, subscriptions.destination],
    set: { language: input.language, receiveIncidents: input.receiveIncidents, receiveMaintenance: input.receiveMaintenance, confirmationTokenHash: hash, confirmedAt: null, unsubscribedAt: null, updatedAt: new Date() },
  }).returning({ id: subscriptions.id });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const confirmationUrl = new URL("/api/subscribe/confirm", appUrl);
  confirmationUrl.searchParams.set("token", token);
  await db.insert(notificationJobs).values({
    subscriptionId: subscription.id,
    type: "subscription_confirmation",
    idempotencyKey: `subscription-confirmation:${subscription.id}:${hash.slice(0, 16)}`,
    payload: {
      subject: input.language === "it" ? "Conferma la tua iscrizione" : "Confirm your status updates",
      text: input.language === "it" ? `Conferma l'iscrizione: ${confirmationUrl}` : `Confirm your subscription: ${confirmationUrl}`,
      html: `<p>${input.language === "it" ? "Conferma la tua iscrizione" : "Confirm your subscription"}: <a href="${confirmationUrl}">${input.language === "it" ? "Conferma" : "Confirm"}</a></p>`,
    },
  }).onConflictDoNothing();
}

export async function confirmEmailSubscription(token: string): Promise<boolean> {
  const validSince = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [updated] = await getDb().update(subscriptions).set({ confirmedAt: new Date(), confirmationTokenHash: null, updatedAt: new Date() })
    .where(and(eq(subscriptions.confirmationTokenHash, hashSubscriptionToken(token)), gt(subscriptions.updatedAt, validSince))).returning({ id: subscriptions.id });
  return Boolean(updated);
}
