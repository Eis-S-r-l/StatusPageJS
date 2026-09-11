CREATE TABLE "worker_heartbeats" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "worker_heartbeats_singleton" CHECK ("worker_heartbeats"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "confirmation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "pending_email_preferences" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_confirmation_token_unique" ON "subscriptions" USING btree ("confirmation_token_hash");
--> statement-breakpoint
UPDATE "subscriptions"
SET "confirmation_requested_at" = "updated_at",
    "pending_email_preferences" = jsonb_build_object(
      'language', "language", 'receiveIncidents', "receive_incidents", 'receiveMaintenance', "receive_maintenance"
    )
WHERE "confirmation_token_hash" IS NOT NULL;
