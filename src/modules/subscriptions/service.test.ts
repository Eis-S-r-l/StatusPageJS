import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/modules/appearance/server", () => ({
  loadPublicAppearance: async () => ({ companyName: "EIS" }), brandingAssetUrl: () => null,
}));

import { getDb } from "@/db/client";
import { notificationJobs, subscriptions } from "@/db/schema";
import { confirmEmailSubscription, pendingEmailSubscriptionLocale, requestEmailSubscription } from "./service";
import { hashSubscriptionToken } from "./tokens";

const now = new Date("2026-09-10T12:00:00Z");
const originalConfirmation = new Date("2026-08-01T12:00:00Z");
const desired = { language: "it" as const, receiveIncidents: false, receiveMaintenance: true };

function database(options: { rateLimited?: boolean; missing?: boolean; outboxFailure?: boolean } = {}) {
  const row = {
    id: "subscriber", language: "en", receiveIncidents: true, receiveMaintenance: false,
    confirmedAt: originalConfirmation, unsubscribedAt: null, confirmationTokenHash: hashSubscriptionToken("token"),
    confirmationRequestedAt: now, pendingEmailPreferences: desired,
    unsubscribeTokenHash: "existing-unsubscribe-token", unsubscribeRequestedAt: now,
  };
  const reads: SQL[] = [];
  const conflicts: { set: Record<string, unknown>; setWhere: SQL }[] = [];
  const outbox = vi.fn(async () => { if (options.outboxFailure) throw new Error("outbox failed"); });
  const lock = vi.fn(async () => options.missing || !row.confirmationTokenHash ? [] : [row]);
  const update = vi.fn((changes: Record<string, unknown>) => ({ where: async () => { Object.assign(row, changes); } }));
  const tx = {
    insert: (table: unknown) => ({ values: () => {
      if (table === notificationJobs) return { onConflictDoNothing: outbox };
      expect(table).toBe(subscriptions);
      return { onConflictDoUpdate: (config: { set: Record<string, unknown>; setWhere: SQL }) => {
        conflicts.push(config);
        return { returning: async () => {
          if (options.rateLimited) return [];
          Object.assign(row, config.set);
          return [{ id: row.id }];
        } };
      } };
    } }),
    select: () => ({ from: () => ({ where: (condition: SQL) => {
      reads.push(condition);
      return { limit: () => ({
        for: lock,
        then: (resolve: (value: unknown) => void) => resolve(options.missing ? [] : [row]),
      }) };
    } }) }),
    update: () => ({ set: update }),
  };
  const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx));
  vi.mocked(getDb).mockReturnValue({ ...tx, transaction } as never);
  return { row, reads, conflicts, outbox, lock, update, transaction };
}

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe("email subscription changes", () => {
  it("keeps active delivery and unsubscription links intact until inbox confirmation", async () => {
    const db = database();
    await requestEmailSubscription({ email: "subscriber@example.test", ...desired });
    expect(db.row).toMatchObject({
      confirmedAt: originalConfirmation, language: "en", receiveIncidents: true, receiveMaintenance: false,
      unsubscribeTokenHash: "existing-unsubscribe-token", pendingEmailPreferences: desired,
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.outbox).toHaveBeenCalledOnce();
    const condition = new PgDialect().sqlToQuery(db.conflicts[0].setWhere);
    expect(condition.sql).toContain('"confirmation_requested_at"');
    expect(condition.params).toContainEqual(new Date(now.getTime() - 60_000).toISOString());
  });

  it("does not enqueue mail when the atomic cooldown rejects a repeated request", async () => {
    const db = database({ rateLimited: true });
    await requestEmailSubscription({ email: "subscriber@example.test", ...desired });
    expect(db.outbox).not.toHaveBeenCalled();
  });

  it("propagates an outbox failure through the same subscription transaction", async () => {
    const db = database({ outboxFailure: true });
    await expect(requestEmailSubscription({ email: "subscriber@example.test", ...desired })).rejects.toThrow("outbox failed");
    expect(db.transaction).toHaveBeenCalledOnce();
  });

  it("applies the pending preferences once and preserves the original confirmation date", async () => {
    const db = database();
    expect(await confirmEmailSubscription("token")).toBe("it");
    expect(db.row).toMatchObject({ ...desired, confirmedAt: originalConfirmation, pendingEmailPreferences: null, confirmationTokenHash: null });
    expect(db.lock).toHaveBeenCalledWith("update");
    expect(await confirmEmailSubscription("token")).toBeNull();
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("does not use unrelated subscription edits to extend token expiry", async () => {
    const db = database({ missing: true });
    expect(await confirmEmailSubscription("expired-token")).toBeNull();
    const condition = new PgDialect().sqlToQuery(db.reads[0]);
    expect(condition.sql).toContain('"confirmation_requested_at"');
    expect(condition.sql).not.toContain('"updated_at"');
    expect(condition.params).toContainEqual(new Date(now.getTime() - 7 * 86_400_000).toISOString());
    expect(db.update).not.toHaveBeenCalled();
  });

  it("renders confirmation in the requested language while the active language stays unchanged", async () => {
    const db = database();
    expect(await pendingEmailSubscriptionLocale("token")).toBe("it");
    expect(db.row.language).toBe("en");
  });
});
