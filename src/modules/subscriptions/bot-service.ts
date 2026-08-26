import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { subscriptions } from "@/db/schema";

export type BotChannel = "telegram" | "webex";

export async function subscribeBot(input: { channel: BotChannel; destination: string; language: "en" | "it"; username?: string | null; displayName?: string | null }) {
  const now = new Date();
  await getDb().insert(subscriptions).values({
    channel: input.channel, destination: input.destination, language: input.language,
    channelUsername: input.username ?? null, channelDisplayName: input.displayName ?? null,
    receiveIncidents: true, receiveMaintenance: true, confirmedAt: now,
    confirmationTokenHash: null, unsubscribeTokenHash: null, unsubscribeRequestedAt: null, unsubscribedAt: null,
  }).onConflictDoUpdate({
    target: [subscriptions.channel, subscriptions.destination],
    set: { language: input.language, channelUsername: input.username ?? null, channelDisplayName: input.displayName ?? null, receiveIncidents: true, receiveMaintenance: true, confirmedAt: now, confirmationTokenHash: null, unsubscribeTokenHash: null, unsubscribeRequestedAt: null, unsubscribedAt: null, updatedAt: now },
  });
}

export async function unsubscribeBot(channel: BotChannel, destination: string) {
  await getDb().delete(subscriptions)
    .where(and(eq(subscriptions.channel, channel), eq(subscriptions.destination, destination)));
}

export async function refreshTelegramProfile(subscriptionId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  const db = getDb();
  const [subscription] = await db.select({ destination: subscriptions.destination }).from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.channel, "telegram"))).limit(1);
  if (!subscription) throw new Error("That Telegram subscriber no longer exists");
  const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(subscription.destination)}`, { signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null) as { ok?: boolean; result?: { username?: string; first_name?: string; last_name?: string; title?: string }; description?: string } | null;
  if (!response.ok || !body?.ok || !body.result) throw new Error(`Telegram profile refresh failed (${response.status}): ${body?.description ?? "unknown response"}`);
  const displayName = body.result.title ?? ([body.result.first_name, body.result.last_name].filter(Boolean).join(" ") || null);
  await db.update(subscriptions).set({ channelUsername: body.result.username ?? null, channelDisplayName: displayName, updatedAt: new Date() }).where(eq(subscriptions.id, subscriptionId));
}
