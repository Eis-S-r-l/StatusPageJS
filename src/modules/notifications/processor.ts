import { and, asc, eq, gte, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notificationJobs, subscriptions } from "@/db/schema";

import { deliver, PermanentDeliveryError } from "./delivery";

import { JOB_LEASE_MS, MAX_NOTIFICATION_ATTEMPTS } from "@/modules/operations/config";

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : "Unknown delivery failure";
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 1000);
}

export async function recoverStaleNotificationJobs(now = new Date()) {
  const staleAt = new Date(now.getTime() - JOB_LEASE_MS);
  await getDb().update(notificationJobs).set({ status: "failed", nextRetryAt: null, lastError: "Delivery interrupted after the final attempt. Review before retrying.", updatedAt: now })
    .where(and(eq(notificationJobs.status, "processing"), lt(notificationJobs.updatedAt, staleAt), gte(notificationJobs.attemptCount, MAX_NOTIFICATION_ATTEMPTS)));
  await getDb().update(notificationJobs).set({ status: "pending", nextRetryAt: now, lastError: "Recovered after an interrupted delivery", updatedAt: now })
    .where(and(eq(notificationJobs.status, "processing"), lt(notificationJobs.updatedAt, staleAt), lt(notificationJobs.attemptCount, MAX_NOTIFICATION_ATTEMPTS)));
}

export async function processNotificationBatch(limit = 20, now = new Date()): Promise<{ processed: number; sent: number; failed: number }> {
  if (!process.env.DATABASE_URL) return { processed: 0, sent: 0, failed: 0 };
  const db = getDb();
  const candidates = await db.select({
    id: notificationJobs.id, subscriptionId: notificationJobs.subscriptionId, status: notificationJobs.status, attemptCount: notificationJobs.attemptCount,
    payload: notificationJobs.payload, channel: subscriptions.channel, destination: subscriptions.destination,
    confirmedAt: subscriptions.confirmedAt, type: notificationJobs.type,
  }).from(notificationJobs).innerJoin(subscriptions, eq(notificationJobs.subscriptionId, subscriptions.id)).where(and(
    eq(notificationJobs.status, "pending"), lte(notificationJobs.scheduledAt, now),
    or(isNull(notificationJobs.nextRetryAt), lte(notificationJobs.nextRetryAt, now)),
    or(eq(notificationJobs.type, "subscription_confirmation"), and(isNull(subscriptions.unsubscribedAt), isNotNull(subscriptions.confirmedAt))),
  )).orderBy(asc(notificationJobs.scheduledAt), asc(notificationJobs.createdAt), asc(notificationJobs.id)).limit(Math.max(1, Math.min(limit, 100)));

  let sent = 0; let failed = 0;
  for (const job of candidates) {
    if (job.type !== "subscription_confirmation" && !job.confirmedAt) continue;
    const claimedAt = new Date();
    const ownedClaim = and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, "processing"), eq(notificationJobs.attemptCount, job.attemptCount + 1), eq(notificationJobs.updatedAt, claimedAt));
    const [claimed] = await db.update(notificationJobs).set({ status: "processing", attemptCount: job.attemptCount + 1, updatedAt: claimedAt })
      .where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, job.status), eq(notificationJobs.attemptCount, job.attemptCount))).returning({ id: notificationJobs.id });
    if (!claimed) continue;
    try {
      await deliver({ channel: job.channel, destination: job.destination, payload: job.payload });
      await db.update(notificationJobs).set({ status: "sent", sentAt: new Date(), nextRetryAt: null, lastError: null, updatedAt: new Date() }).where(ownedClaim);
      sent++;
    } catch (error) {
      const deliveryError = safeError(error);
      console.error("Notification delivery failed", {
        jobId: job.id, channel: job.channel, attempt: job.attemptCount + 1,
        permanent: error instanceof PermanentDeliveryError, error: deliveryError,
      });
      if (error instanceof PermanentDeliveryError) {
        await db.delete(subscriptions).where(eq(subscriptions.id, job.subscriptionId));
        failed++;
        continue;
      }
      const attempts = job.attemptCount + 1;
      const terminal = attempts >= MAX_NOTIFICATION_ATTEMPTS;
      const retryDelay = Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
      await db.update(notificationJobs).set({ status: terminal ? "failed" : "pending", nextRetryAt: terminal ? null : new Date(Date.now() + retryDelay), lastError: deliveryError, updatedAt: new Date() }).where(ownedClaim);
      failed++;
    }
  }
  return { processed: sent + failed, sent, failed };
}
