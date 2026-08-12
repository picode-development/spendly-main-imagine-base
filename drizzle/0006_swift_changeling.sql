CREATE TABLE IF NOT EXISTS "pending_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"raw_message" text NOT NULL,
	"amount" integer,
	"payee" text,
	"account_hint" text,
	"date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
