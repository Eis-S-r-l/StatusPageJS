import type { Locale } from "@/modules/i18n/config";
export type LocalizedText = Record<Locale, string>;
export type ServiceState = "operational" | "degraded" | "outage" | "maintenance";
export type DayState = ServiceState;
export interface DayEvent { kind: "incident" | "maintenance"; slug: string; title: LocalizedText; impact: Exclude<ServiceState, "operational">; }
export interface UptimeDay { date: string; state: DayState; events: DayEvent[]; }
export type EventState = "investigating" | "identified" | "monitoring" | "resolved" | "scheduled" | "in_progress" | "completed" | "cancelled";
export interface ServiceSummary { id: string; displayOrder: number; name: LocalizedText; description: LocalizedText; state: ServiceState; /** Persisted and maintained when uptime-affecting events change. */ uptimePercentage: string; history: UptimeDay[]; }
export interface ServiceCategory { id: string; displayOrder: number; name: LocalizedText; services: ServiceSummary[]; }
export interface TimelineEntry { id: string; state: EventState; effectiveAt: string; message: LocalizedText; }
export interface AffectedService { id: string; name: LocalizedText; }
export interface StatusEvent { kind: "incident" | "maintenance"; slug: string; title: LocalizedText; summary: LocalizedText; state: EventState; startsAt: string; endsAt: string | null; affectedServices: AffectedService[]; affectsUptime: boolean; timeline: TimelineEntry[]; }
export interface CalendarMaintenanceEvent extends StatusEvent { kind: "maintenance"; calendarId: string; scheduledStartsAt: string; scheduledEndsAt: string; updatedAt: string; }
export interface PaginatedStatusEvents { events: StatusEvent[]; page: number; pageSize: number; totalItems: number; totalPages: number; }
export interface PublicStatusSnapshot { overallState: ServiceState; lastUpdatedAt: string; uptimeIntervalDays: number; maintenancePreviewDays: number; categories: ServiceCategory[]; activeIncidents: StatusEvent[]; maintenancePreview: StatusEvent[]; upcomingMaintenance: StatusEvent[]; recentEvents: StatusEvent[]; }
export interface PublicStatusRepository { getSnapshot(): Promise<PublicStatusSnapshot>; getIncident(slug: string): Promise<StatusEvent | null>; getMaintenance(slug: string): Promise<CalendarMaintenanceEvent | null>; listIncidents(page: number, pageSize: number): Promise<PaginatedStatusEvents>; listMaintenances(page: number, pageSize: number): Promise<PaginatedStatusEvents>; listCalendarMaintenances(): Promise<CalendarMaintenanceEvent[]>; }
