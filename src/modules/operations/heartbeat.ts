import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { workerHeartbeats } from "@/db/schema";

export async function recordWorkerHeartbeat(now = new Date()): Promise<void> {
  await getDb().insert(workerHeartbeats).values({ id: 1, lastSeenAt: now })
    .onConflictDoUpdate({ target: workerHeartbeats.id, set: { lastSeenAt: now } });
}

export async function readWorkerHeartbeat(): Promise<Date | null> {
  const [heartbeat] = await getDb().select({ lastSeenAt: workerHeartbeats.lastSeenAt }).from(workerHeartbeats)
    .where(eq(workerHeartbeats.id, 1)).limit(1);
  return heartbeat?.lastSeenAt ?? null;
}
