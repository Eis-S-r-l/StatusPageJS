import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/client", () => ({
  getDb: () => {
    throw new Error("unexpected independent database access");
  },
}));

import {
  services,
  subscriptionCategories,
  subscriptionServices,
  subscriptions,
  systemSettings,
} from "../../db/schema";

import { enqueueEventNotifications } from "./enqueue";

describe("enqueueEventNotifications transaction participation", () => {
  it("uses the supplied transaction and propagates outbox insert failures", async () => {
    const outboxFailure = new Error("outbox unavailable");
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          if (table === subscriptions) {
            return { where: async () => [{
              id: "subscriber",
              language: "en",
            }] };
          }
          if (table === subscriptionServices || table === subscriptionCategories) {
            return Promise.resolve([]);
          }
          if (table === services) {
            return { where: async () => [{ id: "service", categoryId: "category", nameEn: "Service", nameIt: "Servizio" }] };
          }
          if (table === systemSettings) {
            return { where: () => ({ limit: async () => [{ companyName: "EIS", logoDarkFile: null, logoLightFile: null, updatedAt: new Date(0) }] }) };
          }
          throw new Error("unexpected table");
        },
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: async () => {
            throw outboxFailure;
          },
        }),
      }),
    };

    await expect(enqueueEventNotifications({
      kind: "incident",
      sourceId: "incident",
      serviceIds: ["service"],
      titleEn: "Incident",
      titleIt: "Incidente",
      descriptionEn: "Description",
      descriptionIt: "Descrizione",
    }, { db: tx as never })).rejects.toBe(outboxFailure);
  });
});
