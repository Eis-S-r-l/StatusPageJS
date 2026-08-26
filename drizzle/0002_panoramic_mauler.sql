ALTER TYPE "public"."notification_type" ADD VALUE 'unsubscription_confirmation' BEFORE 'incident';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "channel_username" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "channel_display_name" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "unsubscribe_token_hash" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "unsubscribe_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_unsubscribe_token_unique" ON "subscriptions" USING btree ("unsubscribe_token_hash");