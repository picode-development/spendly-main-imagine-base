CREATE TABLE IF NOT EXISTS "widget_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "widget_tokens_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "widget_tokens_token_unique" UNIQUE("token")
);
