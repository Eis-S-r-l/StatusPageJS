import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/modules/auth/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/notifications/enqueue", () => ({ enqueueEventNotifications: vi.fn() }));
vi.mock("@/modules/subscriptions/bot-service", () => ({ refreshTelegramProfile: vi.fn() }));
vi.mock("@/modules/uptime/recalculate", () => ({ recalculateAffectedServices: vi.fn(), recalculateUptimeForAllServices: vi.fn() }));

import { getDb } from "@/db/client";
import { auditLogs, maintenances, maintenanceUpdates } from "@/db/schema";
import { requireAdmin } from "@/modules/auth/guard";
import { enqueueEventNotifications } from "@/modules/notifications/enqueue";
import { recalculateAffectedServices } from "@/modules/uptime/recalculate";
import { revalidatePath } from "next/cache";
import { editMaintenanceUpdate } from "./actions";
import { INITIAL_EVENT_ACTION_STATE } from "./event-validation";

const maintenanceId = "00000000-0000-4000-8000-000000000001";
const updateId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-09-10T12:00:00Z");
const effectiveAt = "2026-09-09T10:00:00.000Z";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ maintenanceId, updateId, status: "scheduled", effectiveAt, messageEn: "<p>Corrected update</p>", messageIt: "<p>Aggiornamento corretto</p>", ...overrides })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}

function mockDatabase(options: { missingMaintenance?: boolean; archived?: boolean; missingUpdate?: boolean; published?: boolean } = {}) {
  const current = {
    id: updateId, maintenanceId, status: "in_progress", effectiveAt: new Date("2026-09-09T11:00:00Z"),
    messageEn: "Original update", messageIt: "Aggiornamento originale",
    publishedAt: options.published ? new Date("2026-09-09T11:00:00Z") : null,
  };
  const readConditions: { table: unknown; condition: SQL }[] = [];
  const writes: { table: unknown; changes: Record<string, unknown>; condition: SQL }[] = [];
  const audit = vi.fn();
  const tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
      readConditions.push({ table, condition });
      return { limit: async () => table === maintenances
        ? options.missingMaintenance ? [] : [{ id: maintenanceId, archivedAt: options.archived ? now : null }]
        : options.missingUpdate ? [] : [current] };
    } }) }),
    update: (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: async (condition: SQL) => {
      writes.push({ table, changes, condition });
    } }) }),
    insert: (table: unknown) => {
      expect(table).toBe(auditLogs);
      return { values: audit };
    },
  };
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback(tx));
  vi.mocked(getDb).mockReturnValue({ transaction } as never);
  return { current, readConditions, writes, audit, transaction };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(requireAdmin).mockResolvedValue({ subject: "admin" } as never);
});
afterEach(() => vi.useRealTimers());

describe("maintenance timeline corrections", () => {
  it.each([false, true])("saves and audits a correction while preserving publication and current event state (published: %s)", async (published) => {
    const db = mockDatabase({ published });
    const result = await editMaintenanceUpdate(INITIAL_EVENT_ACTION_STATE, form({
      messageEn: '<p onclick="bad()">Corrected <strong>update</strong></p><script>bad()</script>',
      messageIt: '<p>Aggiornamento <em>corretto</em></p><img src="x" onerror="bad()">',
      publish: "on", notifySubscribers: "on", actualStartAt: effectiveAt,
    }));

    expect(result.status).toBe("success");
    expect(db.writes).toHaveLength(2);
    expect(db.writes[0].table).toBe(maintenanceUpdates);
    expect(db.writes[0].changes).toEqual({
      status: "scheduled", effectiveAt: new Date(effectiveAt), updatedAt: now,
      messageEn: "<p>Corrected <strong>update</strong></p>", messageIt: "<p>Aggiornamento <em>corretto</em></p>",
    });
    expect(db.writes[1].table).toBe(maintenances);
    expect(db.writes[1].changes).toEqual({ updatedAt: now });
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorSubject: "admin", action: "edit", entityType: "maintenance_update", entityId: updateId,
      before: { maintenanceId, status: db.current.status, effectiveAt: db.current.effectiveAt.toISOString(), messageEn: db.current.messageEn, messageIt: db.current.messageIt },
      after: { maintenanceId, status: "scheduled", effectiveAt, messageEn: db.writes[0].changes.messageEn, messageIt: db.writes[0].changes.messageIt },
    }));
    const dialect = new PgDialect();
    for (const { condition } of [...db.readConditions, ...db.writes].filter(({ table }) => table === maintenanceUpdates)) {
      const query = dialect.sqlToQuery(condition);
      expect(query.sql).toContain('"maintenance_updates"."id"');
      expect(query.sql).toContain('"maintenance_updates"."maintenance_id"');
      expect(query.params).toEqual([updateId, maintenanceId]);
    }
    expect(enqueueEventNotifications).not.toHaveBeenCalled();
    expect(recalculateAffectedServices).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/maintenance");
    expect(revalidatePath).toHaveBeenCalledWith("/en", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/it", "layout");
  });

  it.each([
    { missingMaintenance: true }, { archived: true }, { missingUpdate: true },
  ])("rejects unavailable maintenance or updates: %j", async (options) => {
    const db = mockDatabase(options);
    const result = await editMaintenanceUpdate(INITIAL_EVENT_ACTION_STATE, form());
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/no longer/);
    expect(db.writes).toEqual([]);
    expect(db.audit).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    { effectiveAt: "2026-09-11T10:00:00Z" },
    { effectiveAt: "2026-09-09T10:00" },
    { status: "resolved" },
    { messageEn: " " },
    { messageIt: " " },
    { maintenanceId: "invalid" },
    { updateId: "invalid" },
  ])("rejects invalid input and retains the submitted values: %j", async (overrides) => {
    const db = mockDatabase();
    const data = form(overrides);
    const result = await editMaintenanceUpdate(INITIAL_EVENT_ACTION_STATE, data);
    expect(result.status).toBe("error");
    expect(result.values).toEqual(Object.fromEntries(data));
    expect(db.writes).toEqual([]);
    expect(db.audit).not.toHaveBeenCalled();
  });

  it("requires administrator authorization before accessing the database", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("Unauthorized"));
    await expect(editMaintenanceUpdate(INITIAL_EVENT_ACTION_STATE, form())).rejects.toThrow("Unauthorized");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reports transaction failures without refreshing the public pages", async () => {
    const db = mockDatabase();
    db.transaction.mockRejectedValue(new Error("Database unavailable"));
    const result = await editMaintenanceUpdate(INITIAL_EVENT_ACTION_STATE, form());
    expect(result.status).toBe("error");
    expect(result.message).toBe("The change could not be saved. Please try again.");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
