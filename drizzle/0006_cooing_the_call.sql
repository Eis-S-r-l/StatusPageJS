CREATE TABLE "maintenance_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_id" uuid NOT NULL,
	"status" "maintenance_status" NOT NULL,
	"message_en" text NOT NULL,
	"message_it" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "status_effective_at" timestamp with time zone;--> statement-breakpoint
UPDATE "incidents" SET "status_effective_at" = CASE WHEN "status" = 'resolved' THEN coalesce("resolved_at", "updated_at") ELSE "updated_at" END;--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "status_effective_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenances" ADD COLUMN "status_effective_at" timestamp with time zone;--> statement-breakpoint
UPDATE "maintenances" SET "status_effective_at" = CASE WHEN "status" = 'completed' THEN coalesce("actual_end_at", "updated_at") WHEN "status" = 'in_progress' THEN coalesce("actual_start_at", "updated_at") ELSE "updated_at" END;--> statement-breakpoint
ALTER TABLE "maintenances" ALTER COLUMN "status_effective_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_updates" ADD CONSTRAINT "maintenance_updates_maintenance_id_maintenances_id_fk" FOREIGN KEY ("maintenance_id") REFERENCES "public"."maintenances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_updates_timeline_idx" ON "maintenance_updates" USING btree ("maintenance_id","effective_at");
