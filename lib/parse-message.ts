/**
 * Server-side message → pending-transaction pipeline: Groq LLM first, the
 * offline regex parser (with the user's taught rules) as fallback.
 */

import { db } from "@/db/drizzle";
import { accounts, categories, smsRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseTransactionSms, SmsRule } from "@/lib/sms-parser";
import { llmExtractFromText, LlmContext } from "@/lib/groq";

export const getUserRules = async (userId: string): Promise<SmsRule[]> =>
    db
        .select()
        .from(smsRules)
        .where(eq(smsRules.userId, userId)) as Promise<SmsRule[]>;

export const getLlmContext = async (userId: string): Promise<LlmContext> => {
    const [userAccounts, userCategories] = await Promise.all([
        db.select({ name: accounts.name }).from(accounts).where(eq(accounts.userId, userId)),
        db.select({ name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    ]);
    return {
        accounts: userAccounts.map((a) => a.name.trim()),
        categories: userCategories.map((c) => c.name.trim()),
    };
};

export type ParsedPendingFields = {
    amount: number | null;
    payee: string | null;
    accountHint: string | null;
    categoryHint: string | null;
    date: Date;
};

/**
 * Groq-first parsing with regex fallback. Returns the fields for a pending
 * row, or null when the text clearly isn't a transaction.
 */
export const parseMessage = async (
    userId: string,
    message: string,
): Promise<ParsedPendingFields | null> => {
    const llm = await llmExtractFromText(message, await getLlmContext(userId));
    if (llm) {
        if (!llm.isTransaction) return null;
        return {
            amount: llm.amount,
            payee: llm.payee,
            accountHint: llm.accountName ?? llm.accountHint,
            categoryHint: llm.categoryName,
            date: llm.date ?? new Date(),
        };
    }

    // Groq unavailable — the trained regex parser still works offline
    const parsed = parseTransactionSms(message, await getUserRules(userId));
    if (!parsed.isTransaction) return null;
    return {
        amount: parsed.amount,
        payee: parsed.payee,
        accountHint: parsed.accountHint,
        categoryHint: null,
        date: parsed.date ?? new Date(),
    };
};
