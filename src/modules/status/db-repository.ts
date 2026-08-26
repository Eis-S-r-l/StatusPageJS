import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { getDb, type Database } from "../../db/client";
import {
  categories,
  incidents,
  incidentServices,
  incidentUpdates,
  maintenances,
  maintenanceServices,
  services,
  serviceUptimeMetrics,
  systemSettings,
} from "../../db/schema";

import type {
  DayState,
  PublicStatusRepository,
  PublicStatusSnapshot,
  ServiceCategory,
  ServiceState,
  StatusEvent,
  TimelineEntry,
} from "./types";

const HISTORY_DAYS = 60;
const EVENT_QUERY_LIMIT = 100;
const UPCOMING_DAYS = 90;
const RECENT_EVENT_LIMIT = 20;
const DAY_MS = 86_400_000;

type ServiceRow = {
  id: string;
  slug: string;
  categoryId: string;
  nameEn: string;
  nameIt: string;
  descriptionEn: string;
  descriptionIt: string;
  updatedAt: Date;
  uptimePercentage: string | null;
  uptimeStatus: "available" | "unavailable" | "error" | null;
  metricCalculatedAt: Date | null;
};

type CategoryRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameIt: string;
  updatedAt: Date;
};

type IncidentRow = {
  id: string;
  slug: string;
  titleEn: string;
  titleIt: string;
  descriptionEn: string;
  descriptionIt: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  startedAt: Date;
  resolvedAt: Date | null;
  publishedAt: Date;
  updatedAt: Date;
};

type MaintenanceRow = {
  id: string;
  slug: string;
  titleEn: string;
  titleIt: string;
  descriptionEn: string;
  descriptionIt: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  publishedAt: Date;
  updatedAt: Date;
};

type Association = {
  eventId: string;
  serviceId: string;
  affectsUptime: boolean;
};

export interface StatusReadModel {
  now: Date;
  uptimeIntervalDays: number;
  categories: CategoryRow[];
  services: ServiceRow[];
  incidents: IncidentRow[];
  maintenances: MaintenanceRow[];
  incidentAssociations: Association[];
  maintenanceAssociations: Association[];
}

const toIso = (date: Date): string => date.toISOString();

function formatUptime(
  percentage: string | null,
  status: ServiceRow["uptimeStatus"],
): string {
  if (status !== "available" || percentage === null) return "N/A";
  const parsed = Number(percentage);
  if (!Number.isFinite(parsed)) return "N/A";
  return `${parsed.toFixed(3).replace(/\.?0+$/, "")}%`;
}

function groupAssociations(rows: Association[]): Map<string, Association[]> {
  const grouped = new Map<string, Association[]>();
  for (const row of rows) {
    const current = grouped.get(row.eventId) ?? [];
    current.push(row);
    grouped.set(row.eventId, current);
  }
  return grouped;
}

function mapIncident(
  row: IncidentRow,
  associations: readonly Association[],
  timeline: TimelineEntry[] = [],
): StatusEvent {
  return {
    kind: "incident",
    slug: row.slug,
    title: { en: row.titleEn, it: row.titleIt },
    summary: { en: row.descriptionEn, it: row.descriptionIt },
    state: row.status,
    startsAt: toIso(row.startedAt),
    endsAt: row.resolvedAt ? toIso(row.resolvedAt) : null,
    affectedServiceIds: associations.map((item) => item.serviceId),
    affectsUptime: associations.some((item) => item.affectsUptime),
    timeline,
  };
}

function maintenanceBounds(row: MaintenanceRow): { start: Date; end: Date | null } {
  return {
    start: row.actualStartAt ?? row.scheduledStartAt,
    end:
      row.actualEndAt ??
      (row.status === "in_progress" ? null : row.scheduledEndAt),
  };
}

function mapMaintenance(
  row: MaintenanceRow,
  associations: readonly Association[],
): StatusEvent {
  const bounds = maintenanceBounds(row);
  return {
    kind: "maintenance",
    slug: row.slug,
    title: { en: row.titleEn, it: row.titleIt },
    summary: { en: row.descriptionEn, it: row.descriptionIt },
    state: row.status,
    startsAt: toIso(bounds.start),
    endsAt: bounds.end ? toIso(bounds.end) : null,
    affectedServiceIds: associations.map((item) => item.serviceId),
    affectsUptime: associations.some((item) => item.affectsUptime),
    timeline: [
      {
        id: `maintenance-${row.id}`,
        state: row.status,
        publishedAt: toIso(row.publishedAt),
        message: { en: row.descriptionEn, it: row.descriptionIt },
      },
    ],
  };
}

const statePriority: Record<ServiceState, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  outage: 3,
};

function strongerState(current: ServiceState, candidate: ServiceState): ServiceState {
  return statePriority[candidate] > statePriority[current] ? candidate : current;
}

function eventOverlapsDay(
  start: Date,
  end: Date | null,
  dayStart: number,
  dayEnd: number,
): boolean {
  return start.getTime() < dayEnd && (end?.getTime() ?? dayEnd) > dayStart;
}

/** Pure mapper kept separate from SQL so state precedence remains testable. */
export function buildStatusSnapshot(model: StatusReadModel): PublicStatusSnapshot {
  const serviceSlugById = new Map(model.services.map((row) => [row.id, row.slug]));
  const incidentAssociations = groupAssociations(model.incidentAssociations);
  const maintenanceAssociations = groupAssociations(model.maintenanceAssociations);
  const associationsWithSlugs = (
    associations: readonly Association[],
  ): Association[] =>
    associations.flatMap((item) => {
      const slug = serviceSlugById.get(item.serviceId);
      return slug ? [{ ...item, serviceId: slug }] : [];
    });

  const incidentEvents = model.incidents.map((row) =>
    mapIncident(
      row,
      associationsWithSlugs(incidentAssociations.get(row.id) ?? []),
    ),
  );
  const maintenanceEvents = model.maintenances.map((row) =>
    mapMaintenance(
      row,
      associationsWithSlugs(maintenanceAssociations.get(row.id) ?? []),
    ),
  );

  const currentStateByService = new Map<string, ServiceState>();
  const setCurrentState = (serviceId: string, state: ServiceState) => {
    currentStateByService.set(
      serviceId,
      strongerState(currentStateByService.get(serviceId) ?? "operational", state),
    );
  };

  for (const row of model.incidents) {
    if (row.status === "resolved" || row.resolvedAt || row.startedAt > model.now) {
      continue;
    }
    for (const association of incidentAssociations.get(row.id) ?? []) {
      if (!serviceSlugById.has(association.serviceId)) continue;
      setCurrentState(
        association.serviceId,
        association.affectsUptime ? "outage" : "degraded",
      );
    }
  }
  for (const row of model.maintenances) {
    if (row.status !== "in_progress") continue;
    for (const association of maintenanceAssociations.get(row.id) ?? []) {
      if (!serviceSlugById.has(association.serviceId)) continue;
      setCurrentState(association.serviceId, "maintenance");
    }
  }

  const historyForService = (serviceId: string): DayState[] => {
    const history: DayState[] = [];
    const todayStart = Date.UTC(
      model.now.getUTCFullYear(),
      model.now.getUTCMonth(),
      model.now.getUTCDate(),
    );
    for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
      const dayStart = todayStart - daysAgo * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      let state: ServiceState = "operational";
      for (const row of model.maintenances) {
        if (row.status === "cancelled") continue;
        const association = (maintenanceAssociations.get(row.id) ?? []).find(
          (item) => item.serviceId === serviceId,
        );
        const bounds = maintenanceBounds(row);
        if (association && eventOverlapsDay(bounds.start, bounds.end, dayStart, dayEnd)) {
          state = strongerState(state, "maintenance");
        }
      }
      for (const row of model.incidents) {
        const association = (incidentAssociations.get(row.id) ?? []).find(
          (item) => item.serviceId === serviceId,
        );
        if (
          association &&
          eventOverlapsDay(row.startedAt, row.resolvedAt, dayStart, dayEnd)
        ) {
          state = strongerState(
            state,
            association.affectsUptime ? "outage" : "degraded",
          );
        }
      }
      history.push(state);
    }
    return history;
  };

  const servicesByCategory = new Map<string, ServiceRow[]>();
  for (const service of model.services) {
    const rows = servicesByCategory.get(service.categoryId) ?? [];
    rows.push(service);
    servicesByCategory.set(service.categoryId, rows);
  }
  const publicCategories: ServiceCategory[] = model.categories.map((category) => ({
    id: category.slug,
    name: { en: category.nameEn, it: category.nameIt },
    services: (servicesByCategory.get(category.id) ?? []).map((service) => ({
      id: service.slug,
      name: { en: service.nameEn, it: service.nameIt },
      description: { en: service.descriptionEn, it: service.descriptionIt },
      state: currentStateByService.get(service.id) ?? "operational",
      uptimePercentage: formatUptime(
        service.uptimePercentage,
        service.uptimeStatus,
      ),
      history: historyForService(service.id),
    })),
  }));

  const activeIncidents = incidentEvents.filter(
    (event) => event.endsAt === null && event.state !== "resolved",
  );
  const upcomingMaintenance = maintenanceEvents.filter((event) => {
    const end = event.endsAt ? Date.parse(event.endsAt) : Number.POSITIVE_INFINITY;
    return (event.state === "scheduled" || event.state === "in_progress") && end >= model.now.getTime();
  });
  const recentEvents = [...incidentEvents, ...maintenanceEvents]
    .filter((event) => {
      if (event.kind === "incident") return event.endsAt !== null;
      return event.state === "completed" || event.state === "cancelled";
    })
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, RECENT_EVENT_LIMIT);

  const overallState = [...currentStateByService.values()].reduce<ServiceState>(
    strongerState,
    "operational",
  );
  const timestamps = [
    ...model.categories.map((row) => row.updatedAt),
    ...model.services.flatMap((row) =>
      row.metricCalculatedAt ? [row.updatedAt, row.metricCalculatedAt] : [row.updatedAt],
    ),
    ...model.incidents.map((row) => row.updatedAt),
    ...model.maintenances.map((row) => row.updatedAt),
  ];

  return {
    overallState,
    lastUpdatedAt: toIso(timestamps.length
      ? timestamps.reduce((latest, candidate) => (candidate > latest ? candidate : latest))
      : model.now),
    uptimeIntervalDays: model.uptimeIntervalDays,
    categories: publicCategories,
    activeIncidents,
    upcomingMaintenance,
    recentEvents,
  };
}

export class DatabasePublicStatusRepository implements PublicStatusRepository {
  constructor(private readonly configuredDb?: Database) {}

  private get db(): Database {
    return this.configuredDb ?? getDb();
  }

  async getSnapshot(): Promise<PublicStatusSnapshot> {
    const now = new Date();
    const historySince = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
    const upcomingUntil = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS);

    const [categoryRows, serviceRows, incidentRows, maintenanceRows, [settings]] =
      await Promise.all([
        this.db.select({ id: categories.id, slug: categories.slug, nameEn: categories.nameEn, nameIt: categories.nameIt, updatedAt: categories.updatedAt }).from(categories)
          .where(and(eq(categories.isActive, true), isNull(categories.archivedAt)))
          .orderBy(asc(categories.displayOrder), asc(categories.nameEn)),
        this.db.select({ id: services.id, slug: services.slug, categoryId: services.categoryId, nameEn: services.nameEn, nameIt: services.nameIt, descriptionEn: services.descriptionEn, descriptionIt: services.descriptionIt, updatedAt: services.updatedAt, uptimePercentage: serviceUptimeMetrics.uptimePercentage, uptimeStatus: serviceUptimeMetrics.status, metricCalculatedAt: serviceUptimeMetrics.calculatedAt }).from(services)
          .innerJoin(categories, eq(services.categoryId, categories.id))
          .leftJoin(serviceUptimeMetrics, eq(services.id, serviceUptimeMetrics.serviceId))
          .where(and(eq(services.isActive, true), isNull(services.archivedAt), eq(categories.isActive, true), isNull(categories.archivedAt)))
          .orderBy(asc(services.displayOrder), asc(services.nameEn)),
        this.db.select({ id: incidents.id, slug: incidents.slug, titleEn: incidents.titleEn, titleIt: incidents.titleIt, descriptionEn: incidents.descriptionEn, descriptionIt: incidents.descriptionIt, status: incidents.status, startedAt: incidents.startedAt, resolvedAt: incidents.resolvedAt, publishedAt: incidents.publishedAt, updatedAt: incidents.updatedAt }).from(incidents)
          .where(and(eq(incidents.isPublished, true), isNull(incidents.archivedAt), lte(incidents.startedAt, now), or(isNull(incidents.resolvedAt), gte(incidents.resolvedAt, historySince))))
          .orderBy(desc(incidents.startedAt)).limit(EVENT_QUERY_LIMIT),
        this.db.select({ id: maintenances.id, slug: maintenances.slug, titleEn: maintenances.titleEn, titleIt: maintenances.titleIt, descriptionEn: maintenances.descriptionEn, descriptionIt: maintenances.descriptionIt, status: maintenances.status, scheduledStartAt: maintenances.scheduledStartAt, scheduledEndAt: maintenances.scheduledEndAt, actualStartAt: maintenances.actualStartAt, actualEndAt: maintenances.actualEndAt, publishedAt: maintenances.publishedAt, updatedAt: maintenances.updatedAt }).from(maintenances)
          .where(and(eq(maintenances.isPublished, true), isNull(maintenances.archivedAt), lte(maintenances.scheduledStartAt, upcomingUntil), or(eq(maintenances.status, "in_progress"), gte(sql`coalesce(${maintenances.actualEndAt}, ${maintenances.scheduledEndAt})`, historySince))))
          .orderBy(desc(maintenances.scheduledStartAt)).limit(EVENT_QUERY_LIMIT),
        this.db.select({ uptimeIntervalDays: systemSettings.uptimeIntervalDays }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1),
      ]);

    const publishedIncidents = incidentRows.filter(
      (row): row is typeof row & { publishedAt: Date } => row.publishedAt !== null,
    );
    const publishedMaintenances = maintenanceRows.filter(
      (row): row is typeof row & { publishedAt: Date } => row.publishedAt !== null,
    );
    const incidentIds = publishedIncidents.map((row) => row.id);
    const maintenanceIds = publishedMaintenances.map((row) => row.id);
    const [incidentLinks, maintenanceLinks] = await Promise.all([
      incidentIds.length
        ? this.db.select({ eventId: incidentServices.incidentId, serviceId: incidentServices.serviceId, affectsUptime: incidentServices.affectsUptime }).from(incidentServices).where(inArray(incidentServices.incidentId, incidentIds))
        : Promise.resolve([]),
      maintenanceIds.length
        ? this.db.select({ eventId: maintenanceServices.maintenanceId, serviceId: maintenanceServices.serviceId, affectsUptime: maintenanceServices.affectsUptime }).from(maintenanceServices).where(inArray(maintenanceServices.maintenanceId, maintenanceIds))
        : Promise.resolve([]),
    ]);

    return buildStatusSnapshot({ now, uptimeIntervalDays: settings?.uptimeIntervalDays ?? 30, categories: categoryRows, services: serviceRows, incidents: publishedIncidents, maintenances: publishedMaintenances, incidentAssociations: incidentLinks, maintenanceAssociations: maintenanceLinks });
  }

  async getIncident(slug: string): Promise<StatusEvent | null> {
    const [row] = await this.db.select({ id: incidents.id, slug: incidents.slug, titleEn: incidents.titleEn, titleIt: incidents.titleIt, descriptionEn: incidents.descriptionEn, descriptionIt: incidents.descriptionIt, status: incidents.status, startedAt: incidents.startedAt, resolvedAt: incidents.resolvedAt, publishedAt: incidents.publishedAt, updatedAt: incidents.updatedAt }).from(incidents)
      .where(and(eq(incidents.slug, slug), eq(incidents.isPublished, true), isNull(incidents.archivedAt))).limit(1);
    if (!row?.publishedAt) return null;

    const [links, updates] = await Promise.all([
      this.db.select({ eventId: incidentServices.incidentId, serviceId: services.slug, affectsUptime: incidentServices.affectsUptime }).from(incidentServices)
        .innerJoin(services, eq(incidentServices.serviceId, services.id)).where(eq(incidentServices.incidentId, row.id)),
      this.db.select({ id: incidentUpdates.id, state: incidentUpdates.status, publishedAt: incidentUpdates.publishedAt, messageEn: incidentUpdates.messageEn, messageIt: incidentUpdates.messageIt }).from(incidentUpdates)
        .where(and(eq(incidentUpdates.incidentId, row.id), isNotNull(incidentUpdates.publishedAt)))
        .orderBy(desc(incidentUpdates.effectiveAt)).limit(EVENT_QUERY_LIMIT),
    ]);
    const timeline: TimelineEntry[] = updates.flatMap((update) =>
      update.publishedAt ? [{ id: update.id, state: update.state, publishedAt: toIso(update.publishedAt), message: { en: update.messageEn, it: update.messageIt } }] : [],
    );
    return mapIncident({ ...row, publishedAt: row.publishedAt }, links, timeline);
  }

  async getMaintenance(slug: string): Promise<StatusEvent | null> {
    const [row] = await this.db.select({ id: maintenances.id, slug: maintenances.slug, titleEn: maintenances.titleEn, titleIt: maintenances.titleIt, descriptionEn: maintenances.descriptionEn, descriptionIt: maintenances.descriptionIt, status: maintenances.status, scheduledStartAt: maintenances.scheduledStartAt, scheduledEndAt: maintenances.scheduledEndAt, actualStartAt: maintenances.actualStartAt, actualEndAt: maintenances.actualEndAt, publishedAt: maintenances.publishedAt, updatedAt: maintenances.updatedAt }).from(maintenances)
      .where(and(eq(maintenances.slug, slug), eq(maintenances.isPublished, true), isNull(maintenances.archivedAt))).limit(1);
    if (!row?.publishedAt) return null;

    const links = await this.db.select({ eventId: maintenanceServices.maintenanceId, serviceId: services.slug, affectsUptime: maintenanceServices.affectsUptime }).from(maintenanceServices)
      .innerJoin(services, eq(maintenanceServices.serviceId, services.id)).where(eq(maintenanceServices.maintenanceId, row.id));
    return mapMaintenance({ ...row, publishedAt: row.publishedAt }, links);
  }
}
