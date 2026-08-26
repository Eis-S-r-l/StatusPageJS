import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { subscriptions } from "@/db/schema";

export type BotChannel = "telegram" | "webex";

export async function subscribeBot(input: { channel: BotChannel; destination: string; language: "en" | "it" }) {
  const now = new Date();
  await getDb().insert(subscriptions).values({
    channel: input.channel, destination: input.destination, language: input.language,
    receiveIncidents: true, receiveMaintenance: true, confirmedAt: now,
    confirmationTokenHash: null, unsubscribedAt: null,
  }).onConflictDoUpdate({
    target: [subscriptions.channel, subscriptions.destination],
    set: { language: input.language, receiveIncidents: true, receiveMaintenance: true, confirmedAt: now, confirmationTokenHash: null, unsubscribedAt: null, updatedAt: now },
  });
}

export async function unsubscribeBot(channel: BotChannel, destination: string) {
  await getDb().update(subscriptions).set({ unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptions.channel, channel), eq(subscriptions.destination, destination)));
}
