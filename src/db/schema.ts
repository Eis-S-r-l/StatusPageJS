import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE, type ThemePalette } from "../modules/appearance/palette";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);
export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export const uptimeCalculationStatusEnum = pgEnum(
  "uptime_calculation_status",
  ["available", "unavailable", "error"],
);
export const subscriptionChannelEnum = pgEnum("subscription_channel", [
  "email",
  "telegram",
  "webex",
]);
export const subscriptionLanguageEnum = pgEnum("subscription_language", [
  "en",
  "it",
]);
export const notificationJobStatusEnum = pgEnum("notification_job_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "subscription_confirmation",
  "unsubscription_confirmation",
  "incident",
  "incident_update",
  "maintenance_announcement",
  "maintenance_reminder",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameIt: text("name_it").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_display_order_idx").on(table.displayOrder),
    check("categories_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameIt: text("name_it").notNull(),
    descriptionEn: text("description_en").default("").notNull(),
    descriptionIt: text("description_it").default("").notNull(),
    monitoringStartedAt: timestamp("monitoring_started_at", {
      withTimezone: true,
    }).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("services_slug_unique").on(table.slug),
    index("services_category_display_idx").on(
      table.categoryId,
      table.displayOrder,
    ),
    index("services_active_idx").on(table.isActive),
    check("services_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    titleEn: text("title_en").notNull(),
    titleIt: text("title_it").notNull(),
    descriptionEn: text("description_en").default("").notNull(),
    descriptionIt: text("description_it").default("").notNull(),
    status: incidentStatusEnum("status").default("investigating").notNull(),
    statusEffectiveAt: timestamp("status_effective_at", { withTimezone: true })
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("incidents_slug_unique").on(table.slug),
    index("incidents_started_at_idx").on(table.startedAt),
    index("incidents_public_idx").on(table.isPublished, table.archivedAt),
    index("incidents_public_history_idx").on(
      table.isPublished,
      table.archivedAt,
      table.startedAt,
      table.id,
    ),
    check(
      "incidents_resolved_after_start",
      sql`${table.resolvedAt} is null or ${table.resolvedAt} >= ${table.startedAt}`,
    ),
    check(
      "incidents_published_timestamp",
      sql`not ${table.isPublished} or ${table.publishedAt} is not null`,
    ),
  ],
);

export const incidentUpdates = pgTable(
  "incident_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: incidentStatusEnum("status").notNull(),
    messageEn: text("message_en").notNull(),
    messageIt: text("message_it").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("incident_updates_timeline_idx").on(
      table.incidentId,
      table.effectiveAt,
    ),
  ],
);

export const incidentServices = pgTable(
  "incident_services",
  {
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    affectsUptime: boolean("affects_uptime").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.incidentId, table.serviceId] }),
    index("incident_services_service_idx").on(table.serviceId),
  ],
);

export const maintenances = pgTable(
  "maintenances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    titleEn: text("title_en").notNull(),
    titleIt: text("title_it").notNull(),
    descriptionEn: text("description_en").default("").notNull(),
    descriptionIt: text("description_it").default("").notNull(),
    status: maintenanceStatusEnum("status").default("scheduled").notNull(),
    statusEffectiveAt: timestamp("status_effective_at", { withTimezone: true })
      .notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", {
      withTimezone: true,
    }).notNull(),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    isPublished: boolean("is_published").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("maintenances_slug_unique").on(table.slug),
    index("maintenances_scheduled_start_idx").on(table.scheduledStartAt),
    index("maintenances_public_idx").on(table.isPublished, table.archivedAt),
    index("maintenances_public_history_idx").on(
      table.isPublished,
      table.archivedAt,
      table.scheduledStartAt,
      table.id,
    ),
    check(
      "maintenances_schedule_order",
      sql`${table.scheduledEndAt} >= ${table.scheduledStartAt}`,
    ),
    check(
      "maintenances_actual_order",
      sql`${table.actualEndAt} is null or (${table.actualStartAt} is not null and ${table.actualEndAt} >= ${table.actualStartAt})`,
    ),
    check(
      "maintenances_published_timestamp",
      sql`not ${table.isPublished} or ${table.publishedAt} is not null`,
    ),
  ],
);

export const maintenanceUpdates = pgTable(
  "maintenance_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    maintenanceId: uuid("maintenance_id")
      .notNull()
      .references(() => maintenances.id, { onDelete: "cascade" }),
    status: maintenanceStatusEnum("status").notNull(),
    messageEn: text("message_en").notNull(),
    messageIt: text("message_it").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("maintenance_updates_timeline_idx").on(
      table.maintenanceId,
      table.effectiveAt,
    ),
  ],
);

export const maintenanceServices = pgTable(
  "maintenance_services",
  {
    maintenanceId: uuid("maintenance_id")
      .notNull()
      .references(() => maintenances.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    affectsUptime: boolean("affects_uptime").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.maintenanceId, table.serviceId] }),
    index("maintenance_services_service_idx").on(table.serviceId),
  ],
);

export const serviceUptimeMetrics = pgTable(
  "service_uptime_metrics",
  {
    serviceId: uuid("service_id")
      .primaryKey()
      .references(() => services.id, { onDelete: "cascade" }),
    intervalDays: integer("interval_days").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    totalMonitoredSeconds: numeric("total_monitored_seconds", {
      precision: 20,
      scale: 6,
    }).notNull(),
    downtimeSeconds: numeric("downtime_seconds", {
      precision: 20,
      scale: 6,
    }).notNull(),
    uptimePercentage: numeric("uptime_percentage", {
      precision: 15,
      scale: 12,
    }),
    status: uptimeCalculationStatusEnum("status").notNull(),
    calculationError: text("calculation_error"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check("uptime_interval_positive", sql`${table.intervalDays} > 0`),
    check(
      "uptime_seconds_valid",
      sql`${table.totalMonitoredSeconds} >= 0 and ${table.downtimeSeconds} >= 0 and ${table.downtimeSeconds} <= ${table.totalMonitoredSeconds}`,
    ),
    check(
      "uptime_percentage_valid",
      sql`${table.uptimePercentage} is null or (${table.uptimePercentage} >= 0 and ${table.uptimePercentage} <= 100)`,
    ),
  ],
);

export const systemSettings = pgTable(
  "system_settings",
  {
    id: integer("id").primaryKey().default(1),
    uptimeIntervalDays: integer("uptime_interval_days").default(30).notNull(),
    maintenancePreviewDays: integer("maintenance_preview_days")
      .default(7)
      .notNull(),
    plannedMaintenanceAffectsUptime: boolean(
      "planned_maintenance_affects_uptime",
    )
      .default(false)
      .notNull(),
    publicTimezone: text("public_timezone").default("Europe/Rome").notNull(),
    companyName: text("company_name").default("EIS").notNull(),
    statusPageTitle: text("status_page_title")
      .default("EIS Service Status")
      .notNull(),
    lightPalette: jsonb("light_palette").$type<ThemePalette>().default(DEFAULT_LIGHT_PALETTE).notNull(),
    darkPalette: jsonb("dark_palette").$type<ThemePalette>().default(DEFAULT_DARK_PALETTE).notNull(),
    logoLightFile: text("logo_light_file"),
    logoLightMimeType: text("logo_light_mime_type"),
    logoDarkFile: text("logo_dark_file"),
    logoDarkMimeType: text("logo_dark_mime_type"),
    faviconFile: text("favicon_file"),
    faviconMimeType: text("favicon_mime_type"),
    ...timestamps,
  },
  (table) => [
    check("system_settings_singleton", sql`${table.id} = 1`),
    check(
      "system_settings_interval_positive",
      sql`${table.uptimeIntervalDays} > 0`,
    ),
    check(
      "system_settings_maintenance_preview_positive",
      sql`${table.maintenancePreviewDays} > 0`,
    ),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    channel: subscriptionChannelEnum("channel").notNull(),
    destination: text("destination").notNull(),
    channelUsername: text("channel_username"),
    channelDisplayName: text("channel_display_name"),
    language: subscriptionLanguageEnum("language").default("en").notNull(),
    confirmationTokenHash: text("confirmation_token_hash"),
    unsubscribeTokenHash: text("unsubscribe_token_hash"),
    unsubscribeRequestedAt: timestamp("unsubscribe_requested_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    receiveIncidents: boolean("receive_incidents").default(true).notNull(),
    receiveMaintenance: boolean("receive_maintenance").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscriptions_channel_destination_unique").on(
      table.channel,
      table.destination,
    ),
    index("subscriptions_active_idx").on(
      table.channel,
      table.confirmedAt,
      table.unsubscribedAt,
    ),
    uniqueIndex("subscriptions_unsubscribe_token_unique").on(table.unsubscribeTokenHash),
  ],
);

export const subscriptionServices = pgTable(
  "subscription_services",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.serviceId] }),
    index("subscription_services_service_idx").on(table.serviceId),
  ],
);

export const subscriptionCategories = pgTable(
  "subscription_categories",
  {
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.categoryId] }),
    index("subscription_categories_category_idx").on(table.categoryId),
  ],
);

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    sourceId: uuid("source_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: notificationJobStatusEnum("status").default("pending").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("notification_jobs_idempotency_unique").on(
      table.idempotencyKey,
    ),
    index("notification_jobs_dequeue_idx").on(
      table.status,
      table.scheduledAt,
      table.nextRetryAt,
    ),
    check(
      "notification_jobs_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorSubject: text("actor_subject").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_occurred_at_idx").on(table.occurredAt),
  ],
);

export type Service = typeof services.$inferSelect;
export type ServiceUptimeMetric = typeof serviceUptimeMetrics.$inferSelect;
