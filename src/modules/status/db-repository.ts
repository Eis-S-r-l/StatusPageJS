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
  maintenanceUpdates,
  services,
  serviceUptimeMetrics,
  systemSettings,
} from "../../db/schema";

import type {
  AffectedService,
  DayEvent,
  PaginatedStatusEvents,
  PublicStatusRepository,
  PublicStatusSnapshot,
  ServiceCategory,
  ServiceState,
  StatusEvent,
  TimelineEntry,
  UptimeDay,
} from "./types";

const EVENT_QUERY_LIMIT = 100;
const UPCOMING_DAYS = 90;
const RECENT_EVENT_LIMIT = 20;
const DAY_MS = 86_400_000;

type ServiceRow = {
  id: string;
  slug: string;
  categoryId: string;
  displayOrder: number;
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
  displayOrder: number;
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
  serviceSlug?: string;
  serviceNameEn?: string;
  serviceNameIt?: string;
};

export interface StatusReadModel {
  now: Date;
  uptimeIntervalDays: number;
  publicTimezone: string;
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
    affectedServices: mapAffectedServices(associations),
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
  updates: TimelineEntry[] = [],
): StatusEvent {
  const bounds = maintenanceBounds(row);
  const timeline = (updates.length ? updates : [{
      id: `maintenance-${row.id}`,
      state: row.status,
      effectiveAt: toIso(row.publishedAt),
      message: { en: row.descriptionEn, it: row.descriptionIt },
    } satisfies TimelineEntry]).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));
  return {
    kind: "maintenance",
    slug: row.slug,
    title: { en: row.titleEn, it: row.titleIt },
    summary: { en: row.descriptionEn, it: row.descriptionIt },
    state: row.status,
    startsAt: toIso(bounds.start),
    endsAt: bounds.end ? toIso(bounds.end) : null,
    affectedServices: mapAffectedServices(associations),
    affectsUptime: associations.some((item) => item.affectsUptime),
    timeline,
  };
}

function mapAffectedServices(associations: readonly Association[]): AffectedService[] {
  return associations.flatMap((association) =>
    association.serviceSlug && association.serviceNameEn && association.serviceNameIt
      ? [{ id: association.serviceSlug, name: { en: association.serviceNameEn, it: association.serviceNameIt } }]
      : [],
  );
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

const FALLBACK_PUBLIC_TIMEZONE = "Europe/Rome";

function validTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return FALLBACK_PUBLIC_TIMEZONE;
  }
}

function calendarDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftCalendarDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

function zonedMidnight(value: string, formatter: Intl.DateTimeFormat): number {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let guess = target;
  for (let index = 0; index < 3; index += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const renderedAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    guess -= renderedAsUtc - target;
  }
  return guess;
}

function historyWindows(now: Date, intervalDays: number, configuredTimezone: string) {
  const timeZone = validTimezone(configuredTimezone);
  const today = calendarDate(now, timeZone);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return Array.from({ length: intervalDays }, (_, index) => {
    const date = shiftCalendarDate(today, index - intervalDays + 1);
    return {
      date,
      start: zonedMidnight(date, formatter),
      end: zonedMidnight(shiftCalendarDate(date, 1), formatter),
    };
  });
}

/** Pure mapper kept separate from SQL so state precedence remains testable. */
export function buildStatusSnapshot(model: StatusReadModel): PublicStatusSnapshot {
  const serviceSlugById = new Map(model.services.map((row) => [row.id, row.slug]));
  const serviceNameById = new Map(model.services.map((row) => [row.id, { en: row.nameEn, it: row.nameIt }]));
  const incidentAssociations = groupAssociations(model.incidentAssociations);
  const maintenanceAssociations = groupAssociations(model.maintenanceAssociations);
  const associationsWithSlugs = (
    associations: readonly Association[],
  ): Association[] =>
    associations.flatMap((item) => {
      if (item.serviceSlug && item.serviceNameEn && item.serviceNameIt) return [item];
      const slug = serviceSlugById.get(item.serviceId);
      const name = serviceNameById.get(item.serviceId);
      return slug && name ? [{ ...item, serviceSlug: slug, serviceNameEn: name.en, serviceNameIt: name.it }] : [];
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
  const dayWindows = historyWindows(
    model.now,
    model.uptimeIntervalDays,
    model.publicTimezone,
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

  const historyForService = (serviceId: string): UptimeDay[] => {
    const history: UptimeDay[] = [];
    for (const window of dayWindows) {
      let state: ServiceState = "operational";
      const events: DayEvent[] = [];
      for (const row of model.maintenances) {
        if (row.status === "cancelled") continue;
        const association = (maintenanceAssociations.get(row.id) ?? []).find(
          (item) => item.serviceId === serviceId,
        );
        const bounds = maintenanceBounds(row);
        if (association && eventOverlapsDay(bounds.start, bounds.end, window.start, window.end)) {
          state = strongerState(state, "maintenance");
          events.push({
            kind: "maintenance",
            slug: row.slug,
            title: { en: row.titleEn, it: row.titleIt },
            impact: "maintenance",
          });
        }
      }
      for (const row of model.incidents) {
        const association = (incidentAssociations.get(row.id) ?? []).find(
          (item) => item.serviceId === serviceId,
        );
        if (
          association &&
          eventOverlapsDay(row.startedAt, row.resolvedAt, window.start, window.end)
        ) {
          const impact = association.affectsUptime ? "outage" : "degraded";
          state = strongerState(
            state,
            impact,
          );
          events.push({
            kind: "incident",
            slug: row.slug,
            title: { en: row.titleEn, it: row.titleIt },
            impact,
          });
        }
      }
      history.push({
        date: window.date,
        state,
        events: events.sort((a, b) => statePriority[b.impact] - statePriority[a.impact] || a.title.en.localeCompare(b.title.en)),
      });
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
    displayOrder: category.displayOrder,
    name: { en: category.nameEn, it: category.nameIt },
    services: (servicesByCategory.get(category.id) ?? []).map((service) => ({
      id: service.slug,
      displayOrder: service.displayOrder,
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
    const [settings] = await this.db.select({
      uptimeIntervalDays: systemSettings.uptimeIntervalDays,
      publicTimezone: systemSettings.publicTimezone,
    }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
    const uptimeIntervalDays = settings?.uptimeIntervalDays ?? 30;
    const publicTimezone = settings?.publicTimezone ?? FALLBACK_PUBLIC_TIMEZONE;
    const historySince = new Date(now.getTime() - (uptimeIntervalDays + 1) * DAY_MS);
    const upcomingUntil = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS);

    const [categoryRows, serviceRows, incidentRows, maintenanceRows] =
      await Promise.all([
        this.db.select({ id: categories.id, slug: categories.slug, displayOrder: categories.displayOrder, nameEn: categories.nameEn, nameIt: categories.nameIt, updatedAt: categories.updatedAt }).from(categories)
          .where(and(eq(categories.isActive, true), isNull(categories.archivedAt)))
          .orderBy(asc(categories.displayOrder), asc(categories.nameEn)),
        this.db.select({ id: services.id, slug: services.slug, categoryId: services.categoryId, displayOrder: services.displayOrder, nameEn: services.nameEn, nameIt: services.nameIt, descriptionEn: services.descriptionEn, descriptionIt: services.descriptionIt, updatedAt: services.updatedAt, uptimePercentage: serviceUptimeMetrics.uptimePercentage, uptimeStatus: serviceUptimeMetrics.status, metricCalculatedAt: serviceUptimeMetrics.calculatedAt }).from(services)
          .innerJoin(categories, eq(services.categoryId, categories.id))
          .leftJoin(serviceUptimeMetrics, eq(services.id, serviceUptimeMetrics.serviceId))
          .where(and(eq(services.isActive, true), isNull(services.archivedAt), eq(categories.isActive, true), isNull(categories.archivedAt)))
          .orderBy(asc(services.displayOrder), asc(services.nameEn)),
        this.db.select({ id: incidents.id, slug: incidents.slug, titleEn: incidents.titleEn, titleIt: incidents.titleIt, descriptionEn: incidents.descriptionEn, descriptionIt: incidents.descriptionIt, status: incidents.status, startedAt: incidents.startedAt, resolvedAt: incidents.resolvedAt, publishedAt: incidents.publishedAt, updatedAt: incidents.updatedAt }).from(incidents)
          .where(and(eq(incidents.isPublished, true), isNull(incidents.archivedAt), lte(incidents.startedAt, now), or(isNull(incidents.resolvedAt), gte(incidents.resolvedAt, historySince))))
          .orderBy(desc(incidents.startedAt)),
        this.db.select({ id: maintenances.id, slug: maintenances.slug, titleEn: maintenances.titleEn, titleIt: maintenances.titleIt, descriptionEn: maintenances.descriptionEn, descriptionIt: maintenances.descriptionIt, status: maintenances.status, scheduledStartAt: maintenances.scheduledStartAt, scheduledEndAt: maintenances.scheduledEndAt, actualStartAt: maintenances.actualStartAt, actualEndAt: maintenances.actualEndAt, publishedAt: maintenances.publishedAt, updatedAt: maintenances.updatedAt }).from(maintenances)
          .where(and(eq(maintenances.isPublished, true), isNull(maintenances.archivedAt), lte(maintenances.scheduledStartAt, upcomingUntil), or(eq(maintenances.status, "in_progress"), gte(sql`coalesce(${maintenances.actualEndAt}, ${maintenances.scheduledEndAt})`, historySince))))
          .orderBy(desc(maintenances.scheduledStartAt)),
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
        ? this.db.select({ eventId: incidentServices.incidentId, serviceId: incidentServices.serviceId, affectsUptime: incidentServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(incidentServices).innerJoin(services, eq(incidentServices.serviceId, services.id)).where(inArray(incidentServices.incidentId, incidentIds))
        : Promise.resolve([]),
      maintenanceIds.length
        ? this.db.select({ eventId: maintenanceServices.maintenanceId, serviceId: maintenanceServices.serviceId, affectsUptime: maintenanceServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(maintenanceServices).innerJoin(services, eq(maintenanceServices.serviceId, services.id)).where(inArray(maintenanceServices.maintenanceId, maintenanceIds))
        : Promise.resolve([]),
    ]);

    return buildStatusSnapshot({ now, uptimeIntervalDays, publicTimezone, categories: categoryRows, services: serviceRows, incidents: publishedIncidents, maintenances: publishedMaintenances, incidentAssociations: incidentLinks, maintenanceAssociations: maintenanceLinks });
  }

  async getIncident(slug: string): Promise<StatusEvent | null> {
    const [row] = await this.db.select({ id: incidents.id, slug: incidents.slug, titleEn: incidents.titleEn, titleIt: incidents.titleIt, descriptionEn: incidents.descriptionEn, descriptionIt: incidents.descriptionIt, status: incidents.status, startedAt: incidents.startedAt, resolvedAt: incidents.resolvedAt, publishedAt: incidents.publishedAt, updatedAt: incidents.updatedAt }).from(incidents)
      .where(and(eq(incidents.slug, slug), eq(incidents.isPublished, true), isNull(incidents.archivedAt))).limit(1);
    if (!row?.publishedAt) return null;

    const [links, updates] = await Promise.all([
      this.db.select({ eventId: incidentServices.incidentId, serviceId: incidentServices.serviceId, affectsUptime: incidentServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(incidentServices)
        .innerJoin(services, eq(incidentServices.serviceId, services.id)).where(eq(incidentServices.incidentId, row.id)),
      this.db.select({ id: incidentUpdates.id, state: incidentUpdates.status, effectiveAt: incidentUpdates.effectiveAt, publishedAt: incidentUpdates.publishedAt, messageEn: incidentUpdates.messageEn, messageIt: incidentUpdates.messageIt }).from(incidentUpdates)
        .where(and(eq(incidentUpdates.incidentId, row.id), isNotNull(incidentUpdates.publishedAt)))
        .orderBy(desc(incidentUpdates.effectiveAt)).limit(EVENT_QUERY_LIMIT),
    ]);
    const timeline: TimelineEntry[] = updates.flatMap((update) =>
      update.publishedAt ? [{ id: update.id, state: update.state, effectiveAt: toIso(update.effectiveAt), message: { en: update.messageEn, it: update.messageIt } }] : [],
    );
    return mapIncident({ ...row, publishedAt: row.publishedAt }, links, timeline);
  }

  async getMaintenance(slug: string): Promise<StatusEvent | null> {
    const [row] = await this.db.select({ id: maintenances.id, slug: maintenances.slug, titleEn: maintenances.titleEn, titleIt: maintenances.titleIt, descriptionEn: maintenances.descriptionEn, descriptionIt: maintenances.descriptionIt, status: maintenances.status, scheduledStartAt: maintenances.scheduledStartAt, scheduledEndAt: maintenances.scheduledEndAt, actualStartAt: maintenances.actualStartAt, actualEndAt: maintenances.actualEndAt, publishedAt: maintenances.publishedAt, updatedAt: maintenances.updatedAt }).from(maintenances)
      .where(and(eq(maintenances.slug, slug), eq(maintenances.isPublished, true), isNull(maintenances.archivedAt))).limit(1);
    if (!row?.publishedAt) return null;

    const [links, updates] = await Promise.all([
      this.db.select({ eventId: maintenanceServices.maintenanceId, serviceId: maintenanceServices.serviceId, affectsUptime: maintenanceServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(maintenanceServices)
        .innerJoin(services, eq(maintenanceServices.serviceId, services.id)).where(eq(maintenanceServices.maintenanceId, row.id)),
      this.db.select({ id: maintenanceUpdates.id, state: maintenanceUpdates.status, effectiveAt: maintenanceUpdates.effectiveAt, publishedAt: maintenanceUpdates.publishedAt, messageEn: maintenanceUpdates.messageEn, messageIt: maintenanceUpdates.messageIt }).from(maintenanceUpdates)
        .where(and(eq(maintenanceUpdates.maintenanceId, row.id), isNotNull(maintenanceUpdates.publishedAt)))
        .orderBy(desc(maintenanceUpdates.effectiveAt)).limit(EVENT_QUERY_LIMIT),
    ]);
    const timeline: TimelineEntry[] = updates.flatMap((update) =>
      update.publishedAt ? [{ id: update.id, state: update.state, effectiveAt: toIso(update.effectiveAt), message: { en: update.messageEn, it: update.messageIt } }] : [],
    );
    return mapMaintenance({ ...row, publishedAt: row.publishedAt }, links, timeline);
  }

  async listIncidents(page: number, pageSize: number): Promise<PaginatedStatusEvents> {
    const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 1;
    const where = and(eq(incidents.isPublished, true), isNull(incidents.archivedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)` }).from(incidents).where(where);
    const totalItems = Number(count);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const currentPage = Math.min(requestedPage, totalPages);
    const rows = await this.db.select({ id: incidents.id, slug: incidents.slug, titleEn: incidents.titleEn, titleIt: incidents.titleIt, descriptionEn: incidents.descriptionEn, descriptionIt: incidents.descriptionIt, status: incidents.status, startedAt: incidents.startedAt, resolvedAt: incidents.resolvedAt, publishedAt: incidents.publishedAt, updatedAt: incidents.updatedAt }).from(incidents).where(where).orderBy(desc(incidents.startedAt), desc(incidents.id)).limit(safePageSize).offset((currentPage - 1) * safePageSize);
    const ids = rows.map((row) => row.id);
    const links = ids.length ? await this.db.select({ eventId: incidentServices.incidentId, serviceId: incidentServices.serviceId, affectsUptime: incidentServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(incidentServices).innerJoin(services, eq(incidentServices.serviceId, services.id)).where(inArray(incidentServices.incidentId, ids)) : [];
    const byEvent = groupAssociations(links);
    return { events: rows.flatMap((row) => row.publishedAt ? [mapIncident({ ...row, publishedAt: row.publishedAt }, byEvent.get(row.id) ?? [])] : []), page: currentPage, pageSize: safePageSize, totalItems, totalPages };
  }

  async listMaintenances(page: number, pageSize: number): Promise<PaginatedStatusEvents> {
    const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 1;
    const where = and(eq(maintenances.isPublished, true), isNull(maintenances.archivedAt));
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)` }).from(maintenances).where(where);
    const totalItems = Number(count);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
    const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    const currentPage = Math.min(requestedPage, totalPages);
    const rows = await this.db.select({ id: maintenances.id, slug: maintenances.slug, titleEn: maintenances.titleEn, titleIt: maintenances.titleIt, descriptionEn: maintenances.descriptionEn, descriptionIt: maintenances.descriptionIt, status: maintenances.status, scheduledStartAt: maintenances.scheduledStartAt, scheduledEndAt: maintenances.scheduledEndAt, actualStartAt: maintenances.actualStartAt, actualEndAt: maintenances.actualEndAt, publishedAt: maintenances.publishedAt, updatedAt: maintenances.updatedAt }).from(maintenances).where(where).orderBy(desc(maintenances.scheduledStartAt), desc(maintenances.id)).limit(safePageSize).offset((currentPage - 1) * safePageSize);
    const ids = rows.map((row) => row.id);
    const links = ids.length ? await this.db.select({ eventId: maintenanceServices.maintenanceId, serviceId: maintenanceServices.serviceId, affectsUptime: maintenanceServices.affectsUptime, serviceSlug: services.slug, serviceNameEn: services.nameEn, serviceNameIt: services.nameIt }).from(maintenanceServices).innerJoin(services, eq(maintenanceServices.serviceId, services.id)).where(inArray(maintenanceServices.maintenanceId, ids)) : [];
    const byEvent = groupAssociations(links);
    return { events: rows.flatMap((row) => row.publishedAt ? [mapMaintenance({ ...row, publishedAt: row.publishedAt }, byEvent.get(row.id) ?? [])] : []), page: currentPage, pageSize: safePageSize, totalItems, totalPages };
  }
}
