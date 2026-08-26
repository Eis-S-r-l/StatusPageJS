ALTER TABLE "system_settings" ADD COLUMN "light_palette" jsonb DEFAULT '{"background":"#f8faf8","surface":"#ffffff","text":"#14221d","muted":"#66756e","primary":"#087f5b","primaryText":"#ffffff","border":"#dfe7e2","success":"#15946c","warning":"#d49b28","danger":"#c85148"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "dark_palette" jsonb DEFAULT '{"background":"#0d1512","surface":"#15201b","text":"#eef6f1","muted":"#9caea5","primary":"#45c795","primaryText":"#07110d","border":"#2a3a33","success":"#45c795","warning":"#e1ad45","danger":"#ef7770"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "logo_light_file" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "logo_light_mime_type" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "logo_dark_file" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "logo_dark_mime_type" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "favicon_file" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "favicon_mime_type" text;