import type { notificationJobs, subscriptions } from "@/db/schema";

type Job = Pick<typeof notificationJobs.$inferSelect, "status" | "type" | "idempotencyKey">;
type Subscriber = Pick<typeof subscriptions.$inferSelect, "confirmedAt" | "unsubscribedAt" | "confirmationTokenHash" | "confirmationRequestedAt" | "unsubscribeTokenHash" | "unsubscribeRequestedAt">;

export function notificationRetryProblem(job: Job, subscriber: Subscriber, now = new Date()): string | null {
  if (job.status !== "failed") return "Only failed deliveries can be retried. This delivery may already have been queued by another administrator.";
  if (subscriber.unsubscribedAt && job.type !== "subscription_confirmation") return "This subscription is no longer active.";
  if (job.type === "subscription_confirmation" || job.type === "unsubscription_confirmation") {
    const confirming = job.type === "subscription_confirmation";
    const tokenHash = confirming ? subscriber.confirmationTokenHash : subscriber.unsubscribeTokenHash;
    const requestedAt = confirming ? subscriber.confirmationRequestedAt : subscriber.unsubscribeRequestedAt;
    const lifetime = (confirming ? 7 : 1) * 24 * 60 * 60_000;
    if (!tokenHash || !requestedAt || now.getTime() - requestedAt.getTime() >= lifetime || !job.idempotencyKey.endsWith(`:${tokenHash.slice(0, 16)}`)) {
      return "This confirmation link has expired, was replaced, or has already been used. Request a new link from the public page.";
    }
  }
  if (job.type !== "subscription_confirmation" && !subscriber.confirmedAt) return "This subscription has not been confirmed.";
  return null;
}
