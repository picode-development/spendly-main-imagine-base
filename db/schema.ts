import { integer,
        jsonb,
        pgTable,
        text,
        timestamp
        } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";


export const accounts = pgTable("accounts", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    plaidId: text("plaid_id"),
    userId: text("user_id").notNull(),
});

export const accountsRelations = relations(accounts, ({ many }) => ({
    transactions: many(transactions),
}));

export const insertAccountSchema = createInsertSchema(accounts);

export const categories = pgTable("categories", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    plaidId: text("plaid_id"),
    userId: text("user_id").notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
    transactions: many(transactions),
}));

export const insertCategorySchema = createInsertSchema(categories);

export const transactions = pgTable('transactions', {
    id: text("id").primaryKey(),
    amount: integer("amount").notNull(),
    payee: text("payee").notNull(),
    notes: text("notes"),
    date: timestamp("date", {mode: "date"}).notNull(),
    imageUrl: text("image_url"),
    imageUrls: jsonb("image_urls").$type<TransactionImage[]>(),
    // Links the two legs of an account-to-account transfer; such rows are
    // excluded from income/expense stats but still move account balances
    transferId: text("transfer_id"),
    accountId: text("account_id").references(() => accounts.id, {
        onDelete: "cascade",
    }).notNull(),
    categoryId: text("category_id").references(() => categories.id, {
        onDelete: "set null",
    }),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
    account: one(accounts, {
        fields: [transactions.accountId],
        references: [accounts.id],
    }),
    categories: one(categories, {
        fields: [transactions.categoryId],
        references: [categories.id],
    }),
}));

// url = full-resolution hosted image; preview = tiny inline data URL shown
// blurred while the full image downloads (WhatsApp-style blur-up)
export type TransactionImage = {
    url: string;
    preview?: string;
};

export const InsertTransactionSchema = createInsertSchema(transactions, {
    date: z.coerce.date(),
    imageUrls: z.array(z.object({
        url: z.string(),
        preview: z.string().optional(),
    })).max(5).nullish(),
});

// Transactions detected from bank/UPI SMS messages, awaiting user review.
// Confirming one creates a real transaction and deletes the pending row.
export const pendingTransactions = pgTable("pending_transactions", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    rawMessage: text("raw_message").notNull(),
    amount: integer("amount"),          // parsed, miliunits, negative = debit
    payee: text("payee"),               // parsed payee / UPI VPA
    accountHint: text("account_hint"),  // "a/c ..1234" or a matched account name
    categoryHint: text("category_hint"),// LLM-matched category name, if any
    note: text("note"),                 // LLM-written one-line note for the transaction
    imageUrls: jsonb("image_urls").$type<TransactionImage[]>(), // shared screenshot(s)
    date: timestamp("date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const InsertPendingTransactionSchema = createInsertSchema(pendingTransactions, {
    date: z.coerce.date(),
});

// Web Share Target staging: Android share POSTs arrive without session
// cookies (SameSite-Lax is withheld on cross-app POST navigations), so the
// payload is stashed under a one-time token and claimed by the signed-in
// /share-claim page right after.
export const sharedStash = pgTable("shared_stash", {
    id: text("id").primaryKey(),        // one-time claim token
    rawText: text("raw_text"),
    imageUrls: jsonb("image_urls").$type<TransactionImage[]>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Pairing tokens for the Spendly Widgets companion app (Settings → Widgets).
// The token is shown once as a pairing code; the app sends it on every
// /api/widget/summary call. One row per user — regenerating replaces it.
export const widgetTokens = pgTable("widget_tokens", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
});

// Per-field "before/after" anchors — the value sits between them.
// See lib/sms-parser.ts FieldAnchor / SmsRule.
export type SmsRuleAnchors = {
    payee?: { prefix: string; suffix?: string | null } | null;
    amount?: { prefix: string; suffix?: string | null } | null;
    account?: { prefix: string; suffix?: string | null } | null;
    date?: { prefix: string; suffix?: string | null } | null;
};

// User-taught SMS formats (Settings → SMS formats). Applied by the parser
// before its built-in heuristics — see lib/sms-parser.ts SmsRule.
export const smsRules = pgTable("sms_rules", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    matchText: text("match_text").notNull(),      // literal that identifies the format
    direction: text("direction").notNull().default("auto"), // auto | income | expense
    anchors: jsonb("anchors").$type<SmsRuleAnchors>(),
    sample: text("sample"),                       // the message it was taught from
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const InsertSmsRuleSchema = createInsertSchema(smsRules);

// Web Push subscriptions (Settings → Offline & Notifications). One row per
// browser/device install — a user may have several (phone + desktop).
export const pushSubscriptions = pgTable("push_subscriptions", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const InsertPushSubscriptionSchema = createInsertSchema(pushSubscriptions);
