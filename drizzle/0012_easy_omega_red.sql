CREATE TABLE IF NOT EXISTS "shared_stash" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_text" text,
	"image_urls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
