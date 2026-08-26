import type { Locale } from "@/modules/i18n/config";
export type LocalizedText = Record<Locale, string>;
export type ServiceState = "operational" | "degraded" | "outage" | "maintenance";
export type DayState = ServiceState;
export type EventState = "investigating" | "identified" | "monitoring" | "resolved" | "scheduled" | "in_progress" | "completed" | "cancelled";
export interface ServiceSummary { id: string; name: LocalizedText; description: LocalizedText; state: ServiceState; /** Persisted and maintained when uptime-affecting events change. */ uptimePercentage: string; history: DayState[]; }
export interface ServiceCategory { id: string; name: LocalizedText; services: ServiceSummary[]; }
export interface TimelineEntry { id: string; state: EventState; publishedAt: string; message: LocalizedText; }
export interface StatusEvent { kind: "incident" | "maintenance"; slug: string; title: LocalizedText; summary: LocalizedText; state: EventState; startsAt: string; endsAt: string | null; affectedServiceIds: string[]; affectsUptime: boolean; timeline: TimelineEntry[]; }
export interface PublicStatusSnapshot { overallState: ServiceState; lastUpdatedAt: string; uptimeIntervalDays: number; categories: ServiceCategory[]; activeIncidents: StatusEvent[]; upcomingMaintenance: StatusEvent[]; recentEvents: StatusEvent[]; }
export interface PublicStatusRepository { getSnapshot(): Promise<PublicStatusSnapshot>; getIncident(slug: string): Promise<StatusEvent | null>; getMaintenance(slug: string): Promise<StatusEvent | null>; }
