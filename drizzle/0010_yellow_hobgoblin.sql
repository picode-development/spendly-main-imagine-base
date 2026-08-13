ALTER TABLE "pending_transactions" ADD COLUMN "category_hint" text;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD COLUMN "image_urls" jsonb;