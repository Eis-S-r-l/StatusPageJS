CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_job_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('subscription_confirmation', 'incident', 'incident_update', 'maintenance_announcement', 'maintenance_reminder');--> statement-breakpoint
CREATE TYPE "public"."subscription_channel" AS ENUM('email', 'telegram', 'webex');--> statement-breakpoint
CREATE TYPE "public"."subscription_language" AS ENUM('en', 'it');--> statement-breakpoint
CREATE TYPE "public"."uptime_calculation_status" AS ENUM('available', 'unavailable', 'error');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_subject" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_it" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_display_order_nonnegative" CHECK ("categories"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "incident_services" (
	"incident_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"affects_uptime" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_services_incident_id_service_id_pk" PRIMARY KEY("incident_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"status" "incident_status" NOT NULL,
	"message_en" text NOT NULL,
	"message_it" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_it" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_it" text DEFAULT '' NOT NULL,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_resolved_after_start" CHECK ("incidents"."resolved_at" is null or "incidents"."resolved_at" >= "incidents"."started_at"),
	CONSTRAINT "incidents_published_timestamp" CHECK (not "incidents"."is_published" or "incidents"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "maintenance_services" (
	"maintenance_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"affects_uptime" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_services_maintenance_id_service_id_pk" PRIMARY KEY("maintenance_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "maintenances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_en" text NOT NULL,
	"title_it" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_it" text DEFAULT '' NOT NULL,
	"status" "maintenance_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenances_schedule_order" CHECK ("maintenances"."scheduled_end_at" >= "maintenances"."scheduled_start_at"),
	CONSTRAINT "maintenances_actual_order" CHECK ("maintenances"."actual_end_at" is null or ("maintenances"."actual_start_at" is not null and "maintenances"."actual_end_at" >= "maintenances"."actual_start_at")),
	CONSTRAINT "maintenances_published_timestamp" CHECK (not "maintenances"."is_published" or "maintenances"."published_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"source_id" uuid,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_job_status" DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_jobs_attempt_count_nonnegative" CHECK ("notification_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_uptime_metrics" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"interval_days" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"total_monitored_seconds" numeric(20, 6) NOT NULL,
	"downtime_seconds" numeric(20, 6) NOT NULL,
	"uptime_percentage" numeric(15, 12),
	"status" "uptime_calculation_status" NOT NULL,
	"calculation_error" text,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uptime_interval_positive" CHECK ("service_uptime_metrics"."interval_days" > 0),
	CONSTRAINT "uptime_seconds_valid" CHECK ("service_uptime_metrics"."total_monitored_seconds" >= 0 and "service_uptime_metrics"."downtime_seconds" >= 0 and "service_uptime_metrics"."downtime_seconds" <= "service_uptime_metrics"."total_monitored_seconds"),
	CONSTRAINT "uptime_percentage_valid" CHECK ("service_uptime_metrics"."uptime_percentage" is null or ("service_uptime_metrics"."uptime_percentage" >= 0 and "service_uptime_metrics"."uptime_percentage" <= 100))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_en" text NOT NULL,
	"name_it" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_it" text DEFAULT '' NOT NULL,
	"monitoring_started_at" timestamp with time zone NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_display_order_nonnegative" CHECK ("services"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_categories" (
	"subscription_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "subscription_categories_subscription_id_category_id_pk" PRIMARY KEY("subscription_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_services" (
	"subscription_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "subscription_services_subscription_id_service_id_pk" PRIMARY KEY("subscription_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "subscription_channel" NOT NULL,
	"destination" text NOT NULL,
	"language" "subscription_language" DEFAULT 'en' NOT NULL,
	"confirmation_token_hash" text,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"receive_incidents" boolean DEFAULT true NOT NULL,
	"receive_maintenance" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"uptime_interval_days" integer DEFAULT 30 NOT NULL,
	"planned_maintenance_affects_uptime" boolean DEFAULT false NOT NULL,
	"public_timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"company_name" text DEFAULT 'EIS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_singleton" CHECK ("system_settings"."id" = 1),
	CONSTRAINT "system_settings_interval_positive" CHECK ("system_settings"."uptime_interval_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_services" ADD CONSTRAINT "incident_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_services" ADD CONSTRAINT "maintenance_services_maintenance_id_maintenances_id_fk" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_services" ADD CONSTRAINT "maintenance_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_uptime_metrics" ADD CONSTRAINT "service_uptime_metrics_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_categories" ADD CONSTRAINT "subscription_categories_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_categories" ADD CONSTRAINT "subscription_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_services" ADD CONSTRAINT "subscription_services_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_services" ADD CONSTRAINT "subscription_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_display_order_idx" ON "categories" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "incident_services_service_idx" ON "incident_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "incident_updates_timeline_idx" ON "incident_updates" USING btree ("incident_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incidents_slug_unique" ON "incidents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "incidents_started_at_idx" ON "incidents" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "incidents_public_idx" ON "incidents" USING btree ("is_published","archived_at");--> statement-breakpoint
CREATE INDEX "maintenance_services_service_idx" ON "maintenance_services" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenances_slug_unique" ON "maintenances" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "maintenances_scheduled_start_idx" ON "maintenances" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "maintenances_public_idx" ON "maintenances" USING btree ("is_published","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_jobs_idempotency_unique" ON "notification_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_jobs_dequeue_idx" ON "notification_jobs" USING btree ("status","scheduled_at","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_unique" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "services_category_display_idx" ON "services" USING btree ("category_id","display_order");--> statement-breakpoint
CREATE INDEX "services_active_idx" ON "services" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscription_categories_category_idx" ON "subscription_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "subscription_services_service_idx" ON "subscription_services" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_channel_destination_unique" ON "subscriptions" USING btree ("channel","destination");--> statement-breakpoint
CREATE INDEX "subscriptions_active_idx" ON "subscriptions" USING btree ("channel","confirmed_at","unsubscribed_at");
--> statement-breakpoint
INSERT INTO "system_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
