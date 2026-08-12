CREATE TABLE IF NOT EXISTS "sms_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"match_text" text NOT NULL,
	"direction" text DEFAULT 'auto' NOT NULL,
	"payee_prefix" text,
	"payee_suffix" text,
	"sample" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
