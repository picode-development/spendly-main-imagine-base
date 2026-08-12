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
    accountHint: text("account_hint"),  // e.g. "a/c ..1234" from the message
    date: timestamp("date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const InsertPendingTransactionSchema = createInsertSchema(pendingTransactions, {
    date: z.coerce.date(),
});
