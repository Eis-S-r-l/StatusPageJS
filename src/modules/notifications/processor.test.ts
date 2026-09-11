import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("./delivery", () => ({ deliver: vi.fn(), PermanentDeliveryError: class extends Error {} }));

import { getDb } from "@/db/client";
import { deliver } from "./delivery";
import { JOB_LEASE_MS } from "@/modules/operations/config";
import { processNotificationBatch, recoverStaleNotificationJobs } from "./processor";

const now = new Date("2026-09-10T12:00:00Z");

function database(options: { claimRejected?: boolean; attempts?: number } = {}) {
  const job = { id: "job", subscriptionId: "subscriber", status: "pending", attemptCount: options.attempts ?? 0, payload: { subject: "Incident", text: "Update" }, channel: "email", destination: "recipient@example.test", confirmedAt: now, type: "incident" };
  const writes: { changes: Record<string, unknown>; condition: SQL }[] = [];
  const reads: SQL[] = [];
  const db = {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: (condition: SQL) => {
      reads.push(condition);
      return { orderBy: () => ({ limit: async () => [job] }) };
    } }) }) }),
    update: () => ({ set: (changes: Record<string, unknown>) => ({ where: (condition: SQL) => {
      writes.push({ changes, condition });
      return { returning: async () => options.claimRejected ? [] : [{ id: job.id }], then: (resolve: () => void) => resolve() };
    } }) }),
  };
  vi.mocked(getDb).mockReturnValue(db as never);
  return { job, writes, reads };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("DATABASE_URL", "postgresql://unused");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("notification recovery and retries", () => {
  it("recovers only expired leases and fails interrupted jobs that exhausted their attempts", async () => {
    const db = database();
    await recoverStaleNotificationJobs(now);
    expect(db.writes.map((write) => write.changes.status)).toEqual(["failed", "pending"]);
    for (const write of db.writes) {
      const query = new PgDialect().sqlToQuery(write.condition);
      expect(query.params).toContain("processing");
      expect(query.params).toContain(new Date(now.getTime() - JOB_LEASE_MS).toISOString());
      expect(query.sql).toContain('"updated_at" <');
      expect(query.sql).toContain('"attempt_count"');
    }
    expect(db.writes[0].changes.nextRetryAt).toBeNull();
    expect(db.writes[1].changes.nextRetryAt).toEqual(now);
  });

  it("does not deliver a job claimed by another worker", async () => {
    database({ claimRejected: true });
    expect(await processNotificationBatch()).toEqual({ processed: 0, sent: 0, failed: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("filters unconfirmed event recipients before limiting the batch and guards delivery completion", async () => {
    const db = database();
    expect(await processNotificationBatch()).toEqual({ processed: 1, sent: 1, failed: 0 });
    const read = new PgDialect().sqlToQuery(db.reads[0]);
    expect(read.sql).toContain('"confirmed_at" is not null');
    expect(read.params).toContain("subscription_confirmation");
    const completion = new PgDialect().sqlToQuery(db.writes[1].condition);
    expect(completion.params).toEqual(["job", "processing", 1, now.toISOString()]);
  });

  it.each([0, 7])("backs off transient failures and stops after the final attempt (previous attempts: %s)", async (attempts) => {
    const db = database({ attempts });
    vi.mocked(deliver).mockRejectedValue(new Error("provider unavailable"));
    expect(await processNotificationBatch()).toEqual({ processed: 1, sent: 0, failed: 1 });
    expect(db.writes.at(-1)?.changes).toMatchObject({
      status: attempts === 7 ? "failed" : "pending",
      nextRetryAt: attempts === 7 ? null : new Date(now.getTime() + 30_000),
      lastError: "provider unavailable",
    });
  });
});
