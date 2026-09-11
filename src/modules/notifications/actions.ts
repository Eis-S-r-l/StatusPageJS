"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { auditLogs, notificationJobs, subscriptions } from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";
import { notificationRetryProblem } from "./retry";

export async function retryNotification(form: FormData) {
  const admin = await requireAdmin();
  const parsed = z.string().uuid().safeParse(form.get("id"));
  let error: string | null = null;
  if (!parsed.success) {
    error = "Choose a valid notification delivery.";
  } else {
    try {
      error = await getDb().transaction(async (tx) => {
        const [candidate] = await tx.select({ subscriptionId: notificationJobs.subscriptionId }).from(notificationJobs).where(eq(notificationJobs.id, parsed.data)).limit(1);
        if (!candidate) return "This delivery no longer exists.";
        // Lock the parent before its job, matching subscription deletion order.
        const [subscriber] = await tx.select().from(subscriptions).where(eq(subscriptions.id, candidate.subscriptionId)).limit(1).for("update");
        if (!subscriber) return "This subscription no longer exists.";
        const [job] = await tx.select().from(notificationJobs).where(eq(notificationJobs.id, parsed.data)).limit(1).for("update");
        if (!job) return "This delivery no longer exists.";
        const now = new Date();
        const problem = notificationRetryProblem(job, subscriber, now);
        if (problem) return problem;
        await tx.update(notificationJobs).set({
          status: "pending", attemptCount: 0, scheduledAt: now, nextRetryAt: null, lastError: null, sentAt: null, updatedAt: now,
        }).where(and(eq(notificationJobs.id, job.id), eq(notificationJobs.status, "failed")));
        await tx.insert(auditLogs).values({
          actorSubject: admin.subject, action: "retry_notification", entityType: "notification_job", entityId: job.id,
          before: { status: job.status, attemptCount: job.attemptCount, lastError: job.lastError },
          after: { status: "pending", attemptCount: 0 },
        });
        return null;
      });
    } catch {
      error = "The delivery could not be queued. Please try again.";
    }
  }
  revalidatePath("/admin");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/subscribers");
  redirect(error ? `/admin/notifications?status=failed&error=${encodeURIComponent(error)}` : "/admin/notifications?status=pending&queued=1");
}
