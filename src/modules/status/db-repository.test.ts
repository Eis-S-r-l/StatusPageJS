import { describe, expect, it } from "vitest";

import {
  buildStatusSnapshot,
  type StatusReadModel,
} from "./db-repository";

const date = (value: string) => new Date(value);
const now = date("2026-08-26T12:00:00Z");

function baseModel(): StatusReadModel {
  return {
    now,
    uptimeIntervalDays: 45,
    maintenancePreviewDays: 7,
    publicTimezone: "Europe/Rome",
    categories: [
      {
        id: "category-id",
        slug: "core",
        displayOrder: 0,
        nameEn: "Core",
        nameIt: "Principali",
        updatedAt: date("2026-08-20T10:00:00Z"),
      },
    ],
    services: [
      {
        id: "service-a-id",
        slug: "service-a",
        categoryId: "category-id",
        displayOrder: 0,
        nameEn: "Service A",
        nameIt: "Servizio A",
        descriptionEn: "First service",
        descriptionIt: "Primo servizio",
        updatedAt: date("2026-08-20T11:00:00Z"),
        uptimePercentage: "99.987654000000",
        uptimeStatus: "available",
        metricCalculatedAt: date("2026-08-26T11:55:00Z"),
      },
      {
        id: "service-b-id",
        slug: "service-b",
        categoryId: "category-id",
        displayOrder: 1,
        nameEn: "Service B",
        nameIt: "Servizio B",
        descriptionEn: "Second service",
        descriptionIt: "Secondo servizio",
        updatedAt: date("2026-08-20T11:00:00Z"),
        uptimePercentage: null,
        uptimeStatus: "unavailable",
        metricCalculatedAt: null,
      },
    ],
    incidents: [],
    maintenances: [],
    incidentAssociations: [],
    maintenanceAssociations: [],
  };
}

describe("buildStatusSnapshot", () => {
  it("uses persisted uptime and maps UUID associations to public slugs", () => {
    const model = baseModel();
    model.incidents.push({
      id: "incident-id",
      slug: "current-incident",
      titleEn: "Current incident",
      titleIt: "Incidente corrente",
      descriptionEn: "Details",
      descriptionIt: "Dettagli",
      status: "monitoring",
      startedAt: date("2026-08-26T10:00:00Z"),
      resolvedAt: null,
      publishedAt: date("2026-08-26T10:05:00Z"),
      updatedAt: date("2026-08-26T10:30:00Z"),
    });
    model.incidentAssociations.push({
      eventId: "incident-id",
      serviceId: "service-a-id",
      affectsUptime: true,
    });

    const snapshot = buildStatusSnapshot(model);
    const [first, second] = snapshot.categories[0]!.services;

    expect(first?.uptimePercentage).toBe("99.988%");
    expect(second?.uptimePercentage).toBe("N/A");
    expect(first?.state).toBe("outage");
    expect(first?.history).toHaveLength(45);
    expect(first?.history.at(-1)).toMatchObject({ date: "2026-08-26", state: "outage" });
    expect(first?.history.at(-1)?.events).toEqual([
      { kind: "incident", slug: "current-incident", title: { en: "Current incident", it: "Incidente corrente" }, impact: "outage" },
    ]);
    expect(snapshot.overallState).toBe("outage");
    expect(snapshot.activeIncidents[0]?.affectedServices).toEqual([
      { id: "service-a", name: { en: "Service A", it: "Servizio A" } },
    ]);
    expect(snapshot.lastUpdatedAt).toBe("2026-08-26T11:55:00.000Z");
    expect(snapshot.uptimeIntervalDays).toBe(45);
    expect(snapshot.maintenancePreviewDays).toBe(7);
  });

  it("applies outage, degradation, and maintenance state precedence", () => {
    const model = baseModel();
    model.incidents.push(
      {
        id: "degraded-id",
        slug: "degraded",
        titleEn: "Degraded",
        titleIt: "Degradato",
        descriptionEn: "",
        descriptionIt: "",
        status: "investigating",
        startedAt: date("2026-08-26T09:00:00Z"),
        resolvedAt: null,
        publishedAt: date("2026-08-26T09:00:00Z"),
        updatedAt: date("2026-08-26T09:00:00Z"),
      },
      {
        id: "outage-id",
        slug: "outage",
        titleEn: "Outage",
        titleIt: "Disservizio",
        descriptionEn: "",
        descriptionIt: "",
        status: "identified",
        startedAt: date("2026-08-26T10:00:00Z"),
        resolvedAt: null,
        publishedAt: date("2026-08-26T10:00:00Z"),
        updatedAt: date("2026-08-26T10:00:00Z"),
      },
    );
    model.incidentAssociations.push(
      { eventId: "degraded-id", serviceId: "service-a-id", affectsUptime: false },
      { eventId: "outage-id", serviceId: "service-a-id", affectsUptime: true },
    );
    model.maintenances.push({
      id: "maintenance-id",
      slug: "maintenance",
      titleEn: "Maintenance",
      titleIt: "Manutenzione",
      descriptionEn: "Work",
      descriptionIt: "Lavori",
      status: "in_progress",
      scheduledStartAt: date("2026-08-26T11:00:00Z"),
      scheduledEndAt: date("2026-08-26T13:00:00Z"),
      actualStartAt: date("2026-08-26T11:05:00Z"),
      actualEndAt: null,
      publishedAt: date("2026-08-25T10:00:00Z"),
      updatedAt: date("2026-08-26T11:05:00Z"),
    });
    model.maintenanceAssociations.push({
      eventId: "maintenance-id",
      serviceId: "service-b-id",
      affectsUptime: false,
    });

    const snapshot = buildStatusSnapshot(model);

    expect(snapshot.categories[0]?.services.map((service) => service.state)).toEqual([
      "outage",
      "maintenance",
    ]);
    expect(snapshot.categories[0]?.services[0]?.history.at(-1)?.events.map((event) => event.impact)).toEqual([
      "outage",
      "degraded",
    ]);
    expect(snapshot.overallState).toBe("outage");
    expect(snapshot.upcomingMaintenance[0]?.affectedServices).toEqual([
      { id: "service-b", name: { en: "Service B", it: "Servizio B" } },
    ]);
  });

  it("separates active, upcoming, and recent events", () => {
    const model = baseModel();
    model.incidents.push({
      id: "resolved-id",
      slug: "resolved",
      titleEn: "Resolved",
      titleIt: "Risolto",
      descriptionEn: "",
      descriptionIt: "",
      status: "resolved",
      startedAt: date("2026-08-24T10:00:00Z"),
      resolvedAt: date("2026-08-24T11:00:00Z"),
      publishedAt: date("2026-08-24T10:00:00Z"),
      updatedAt: date("2026-08-24T11:00:00Z"),
    });
    model.maintenances.push({
      id: "scheduled-id",
      slug: "scheduled",
      titleEn: "Scheduled",
      titleIt: "Programmata",
      descriptionEn: "",
      descriptionIt: "",
      status: "scheduled",
      scheduledStartAt: date("2026-08-27T10:00:00Z"),
      scheduledEndAt: date("2026-08-27T11:00:00Z"),
      actualStartAt: null,
      actualEndAt: null,
      publishedAt: date("2026-08-20T10:00:00Z"),
      updatedAt: date("2026-08-20T10:00:00Z"),
    });

    const snapshot = buildStatusSnapshot(model);

    expect(snapshot.activeIncidents).toHaveLength(0);
    expect(snapshot.upcomingMaintenance.map((event) => event.slug)).toEqual([
      "scheduled",
    ]);
    expect(snapshot.recentEvents.map((event) => event.slug)).toEqual([
      "resolved",
    ]);
  });

  it("limits upcoming maintenance to the configured preview window", () => {
    const model = baseModel();
    model.maintenancePreviewDays = 7;
    model.maintenances.push(
      {
        id: "inside-window-id",
        slug: "inside-window",
        titleEn: "Inside window",
        titleIt: "Nella finestra",
        descriptionEn: "Soon",
        descriptionIt: "Presto",
        status: "scheduled",
        scheduledStartAt: date("2026-09-02T12:00:00Z"),
        scheduledEndAt: date("2026-09-02T13:00:00Z"),
        actualStartAt: null,
        actualEndAt: null,
        publishedAt: date("2026-08-20T10:00:00Z"),
        updatedAt: date("2026-08-20T10:00:00Z"),
      },
      {
        id: "outside-window-id",
        slug: "outside-window",
        titleEn: "Outside window",
        titleIt: "Fuori dalla finestra",
        descriptionEn: "Later",
        descriptionIt: "Più avanti",
        status: "scheduled",
        scheduledStartAt: date("2026-09-02T12:00:01Z"),
        scheduledEndAt: date("2026-09-02T13:00:01Z"),
        actualStartAt: null,
        actualEndAt: null,
        publishedAt: date("2026-08-20T10:00:00Z"),
        updatedAt: date("2026-08-20T10:00:00Z"),
      },
    );

    expect(buildStatusSnapshot(model).upcomingMaintenance.map((event) => event.slug)).toEqual([
      "inside-window",
    ]);
  });

  it("keeps affected service names when the service is no longer public", () => {
    const model = baseModel();
    model.incidents.push({
      id: "archived-service-incident",
      slug: "archived-service-incident",
      titleEn: "Archived service",
      titleIt: "Servizio archiviato",
      descriptionEn: "Details",
      descriptionIt: "Dettagli",
      status: "resolved",
      startedAt: date("2026-08-25T10:00:00Z"),
      resolvedAt: date("2026-08-25T10:30:00Z"),
      publishedAt: date("2026-08-25T10:00:00Z"),
      updatedAt: date("2026-08-25T10:30:00Z"),
    });
    model.incidentAssociations.push({
      eventId: "archived-service-incident",
      serviceId: "archived-service-id",
      serviceSlug: "retired-service",
      serviceNameEn: "Retired service",
      serviceNameIt: "Servizio ritirato",
      affectsUptime: true,
    });

    expect(buildStatusSnapshot(model).recentEvents[0]?.affectedServices).toEqual([
      { id: "retired-service", name: { en: "Retired service", it: "Servizio ritirato" } },
    ]);
  });

  it("aligns history length with the uptime interval and uses local calendar days across DST", () => {
    const model = baseModel();
    model.now = date("2026-03-30T12:00:00Z");
    model.uptimeIntervalDays = 3;
    model.incidents.push({
      id: "dst-incident",
      slug: "dst-incident",
      titleEn: "Overnight incident",
      titleIt: "Incidente notturno",
      descriptionEn: "",
      descriptionIt: "",
      status: "resolved",
      startedAt: date("2026-03-28T23:30:00Z"),
      resolvedAt: date("2026-03-29T00:30:00Z"),
      publishedAt: date("2026-03-28T23:30:00Z"),
      updatedAt: date("2026-03-29T00:30:00Z"),
    });
    model.incidentAssociations.push({ eventId: "dst-incident", serviceId: "service-a-id", affectsUptime: false });

    const history = buildStatusSnapshot(model).categories[0]!.services[0]!.history;

    expect(history.map((day) => day.date)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(history.map((day) => day.state)).toEqual(["operational", "degraded", "operational"]);
  });
});
