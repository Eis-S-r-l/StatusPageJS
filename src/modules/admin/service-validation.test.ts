import { describe, expect, it } from "vitest";

import { categoryAuditPayload, categoryInputSchema, monitoringStartChanged, serviceAuditPayload, serviceInputSchema, sortServicesForManagement } from "./service-validation";

const categoryId = "11111111-1111-4111-8111-111111111111";

describe("category and service administration validation", () => {
  it("preserves every editable category field in the edit payload", () => {
    const input = categoryInputSchema.parse({ slug: "core-platform", nameEn: " Core platform ", nameIt: " Piattaforma core ", displayOrder: "3" });
    expect(categoryAuditPayload(input)).toEqual({ slug: "core-platform", nameEn: "Core platform", nameIt: "Piattaforma core", displayOrder: 3 });
  });

  it("validates service category, order, and an explicit UTC monitoring timestamp", () => {
    expect(serviceInputSchema.safeParse({ categoryId, slug: "api", nameEn: "API", nameIt: "API", descriptionEn: "", descriptionIt: "", displayOrder: "-1", monitoringStartedAt: "2026-08-27T10:00" }).success).toBe(false);
    const input = serviceInputSchema.parse({ categoryId, slug: "api", nameEn: "API", nameIt: "API", descriptionEn: " English ", descriptionIt: " Italiano ", displayOrder: "2", monitoringStartedAt: "2026-08-27T10:00:00+02:00" });
    expect(serviceAuditPayload(input)).toEqual({ categoryId, slug: "api", nameEn: "API", nameIt: "API", descriptionEn: "English", descriptionIt: "Italiano", displayOrder: 2, monitoringStartedAt: "2026-08-27T08:00:00.000Z" });
  });

  it("keeps category moves and order changes in the service audit payload", () => {
    const movedCategoryId = "22222222-2222-4222-8222-222222222222";
    const input = serviceInputSchema.parse({ categoryId: movedCategoryId, slug: "customer-portal", nameEn: "Customer portal", nameIt: "Portale clienti", descriptionEn: "", descriptionIt: "", displayOrder: 8, monitoringStartedAt: "2026-08-27T08:00:00Z" });
    expect(serviceAuditPayload(input)).toMatchObject({ categoryId: movedCategoryId, displayOrder: 8, monitoringStartedAt: "2026-08-27T08:00:00.000Z" });
  });

  it("recalculates uptime only when the monitoring start changes", () => {
    expect(monitoringStartChanged(new Date("2026-08-27T08:00:00Z"), new Date("2026-08-27T08:00:00.000Z"))).toBe(false);
    expect(monitoringStartChanged(new Date("2026-08-27T08:00:00Z"), new Date("2026-08-27T09:00:00Z"))).toBe(true);
  });

  it("orders services within their category with names as a stable tie-breaker", () => {
    const ordered = sortServicesForManagement([{ id: "platform" }, { id: "apps" }], [
      { categoryId: "apps", displayOrder: 0, nameEn: "Zeta" },
      { categoryId: "platform", displayOrder: 2, nameEn: "Gateway" },
      { categoryId: "apps", displayOrder: 0, nameEn: "Alpha" },
      { categoryId: "platform", displayOrder: 1, nameEn: "API" },
    ]);
    expect(ordered.map((service) => service.nameEn)).toEqual(["API", "Gateway", "Alpha", "Zeta"]);
  });
});
