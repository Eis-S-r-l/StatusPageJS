import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/modules/auth/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));

import { getDb } from "@/db/client";
import { auditLogs, notificationJobs, subscriptions } from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";
import { retryNotification } from "./actions";

const id = "00000000-0000-4000-8000-000000000001";
function form() { const form = new FormData(); form.set("id", id); return form; }

function database() {
  const job = { id, subscriptionId: "subscriber", status: "failed", attemptCount: 8, type: "incident", idempotencyKey: "incident:subscriber", lastError: "provider failure" };
  const subscriber = { id: "subscriber", confirmedAt: new Date(), unsubscribedAt: null };
  const writes = vi.fn(async (changes: Record<string, unknown>) => { Object.assign(job, changes); });
  const audit = vi.fn();
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: () => ({
      for: async () => [{ ...(table === subscriptions ? subscriber : job) }],
      then: (resolve: (value: unknown) => void) => resolve([job]),
    }) }) }) }),
    update: (table: unknown) => { expect(table).toBe(notificationJobs); return { set: (changes: Record<string, unknown>) => ({ where: () => writes(changes) }) }; },
    insert: (table: unknown) => { expect(table).toBe(auditLogs); return { values: audit }; },
  };
  const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx));
  vi.mocked(getDb).mockReturnValue({ transaction } as never);
  return { job, writes, audit, transaction };
}

beforeEach(() => { vi.resetAllMocks(); vi.mocked(requireAdmin).mockResolvedValue({ subject: "admin" }); });
afterEach(() => vi.restoreAllMocks());

describe("notification retry authorization and audit", () => {
  it("checks administrator access before touching the queue", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("not authorized"));
    await expect(retryNotification(form())).rejects.toThrow("not authorized");
    expect(getDb).not.toHaveBeenCalled();
  });
  it("requeues and audits one failed job, then rejects another retry of the same job", async () => {
    const db = database();
    await expect(retryNotification(form())).rejects.toThrow("redirect:/admin/notifications?status=pending&queued=1");
    expect(db.job).toMatchObject({ status: "pending", attemptCount: 0, lastError: null });
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorSubject: "admin", action: "retry_notification", entityId: id,
      before: { status: "failed", attemptCount: 8, lastError: "provider failure" },
    }));
    await expect(retryNotification(form())).rejects.toThrow("redirect:/admin/notifications?status=failed&error=");
    expect(db.writes).toHaveBeenCalledOnce();
    expect(db.audit).toHaveBeenCalledOnce();
  });
});
