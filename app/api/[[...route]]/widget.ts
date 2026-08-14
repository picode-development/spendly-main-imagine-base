import { db } from "@/db/drizzle";
import { accounts, categories, transactions, widgetTokens } from "@/db/schema";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gte, isNull, lt, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

// Base32 without lookalikes (0/O, 1/I/L) — the user may type this by hand
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

// Stored and compared undashed; clients may show it as XXXX-XXXX-XXXX
const generatePairingCode = () => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
};

const normalizeCode = (code: string) =>
    code.toUpperCase().replace(/[^A-Z2-9]/g, "");

// Transactions store calendar dates as midnight timestamps, so "today" for the
// widget is the user's calendar date (from tzOffset, minutes east of UTC)
// mapped back to a midnight-UTC window.
const userDayStartUtc = (tzOffsetMinutes: number) => {
    const local = new Date(Date.now() + tzOffsetMinutes * 60_000);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
};

const app = new Hono()

    // ----- Clerk-authenticated management (Settings → Widgets card) -----

    .get("/token", clerkMiddleware(), async (c) => {
        const auth = getAuth(c);
        if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

        const [row] = await db
            .select({
                token: widgetTokens.token,
                createdAt: widgetTokens.createdAt,
                lastUsedAt: widgetTokens.lastUsedAt,
            })
            .from(widgetTokens)
            .where(eq(widgetTokens.userId, auth.userId));

        return c.json({ data: row ?? null });
    })

    // Create or regenerate — regenerating unpairs any device using the old code
    .post("/token", clerkMiddleware(), async (c) => {
        const auth = getAuth(c);
        if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

        const token = generatePairingCode();
        const [row] = await db
            .insert(widgetTokens)
            .values({ id: createId(), userId: auth.userId, token })
            .onConflictDoUpdate({
                target: widgetTokens.userId,
                set: { token, createdAt: new Date(), lastUsedAt: null },
            })
            .returning({
                token: widgetTokens.token,
                createdAt: widgetTokens.createdAt,
                lastUsedAt: widgetTokens.lastUsedAt,
            });

        return c.json({ data: row });
    })

    .delete("/token", clerkMiddleware(), async (c) => {
        const auth = getAuth(c);
        if (!auth?.userId) return c.json({ error: "Unauthorized" }, 401);

        await db.delete(widgetTokens).where(eq(widgetTokens.userId, auth.userId));
        return c.json({ data: { deleted: true } });
    })

    // ----- Token-authenticated endpoints for the Spendly Widgets app -----

    // One-time pairing check: confirms the code and returns account names so
    // the app can show what it paired with.
    .post(
        "/pair",
        zValidator("json", z.object({ code: z.string().min(8).max(32) })),
        async (c) => {
            const { code } = c.req.valid("json");

            const [row] = await db
                .select({ userId: widgetTokens.userId })
                .from(widgetTokens)
                .where(eq(widgetTokens.token, normalizeCode(code)));

            if (!row) {
                return c.json({ error: "Invalid pairing code" }, 401);
            }

            const userAccounts = await db
                .select({ id: accounts.id, name: accounts.name })
                .from(accounts)
                .where(eq(accounts.userId, row.userId));

            return c.json({ data: { paired: true, currency: "INR", accounts: userAccounts } });
        },
    )

    // Numbers for the home-screen widget. Amounts are returned in plain
    // currency units (rupees), not miliunits — the widget only displays them.
    .get(
        "/summary",
        zValidator("query", z.object({
            token: z.string().min(8).max(32),
            tzOffset: z.coerce.number().int().min(-840).max(840).optional(),
        })),
        async (c) => {
            const { token, tzOffset } = c.req.valid("query");

            const [tokenRow] = await db
                .select({ id: widgetTokens.id, userId: widgetTokens.userId })
                .from(widgetTokens)
                .where(eq(widgetTokens.token, normalizeCode(token)));

            if (!tokenRow) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const userId = tokenRow.userId;
            // IST default — the app always sends its real offset
            const offset = tzOffset ?? 330;
            const dayStart = userDayStartUtc(offset);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));

            const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

            const flows = (from: Date, to: Date) =>
                db
                    .select({
                        income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
                        expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .where(and(
                        eq(accounts.userId, userId),
                        isNull(transactions.transferId),
                        gte(transactions.date, from),
                        lt(transactions.date, to),
                    ));

            const [[today], [month], accountBalances, dailyRows, categoryRows] = await Promise.all([
                flows(dayStart, dayEnd),
                flows(monthStart, dayEnd),
                db
                    .select({
                        name: accounts.name,
                        balance: sum(transactions.amount).mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .where(eq(accounts.userId, userId))
                    .groupBy(accounts.name),
                db
                    .select({
                        date: transactions.date,
                        expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .where(and(
                        eq(accounts.userId, userId),
                        isNull(transactions.transferId),
                        gte(transactions.date, weekStart),
                        lt(transactions.date, dayEnd),
                    ))
                    .groupBy(transactions.date),
                db
                    .select({
                        name: categories.name,
                        value: sql`SUM(ABS(${transactions.amount}))`.mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .innerJoin(categories, eq(transactions.categoryId, categories.id))
                    .where(and(
                        eq(accounts.userId, userId),
                        isNull(transactions.transferId),
                        lt(transactions.amount, 0),
                        gte(transactions.date, monthStart),
                        lt(transactions.date, dayEnd),
                    ))
                    .groupBy(categories.name)
                    .orderBy(desc(sql`SUM(ABS(${transactions.amount}))`)),
                db
                    .update(widgetTokens)
                    .set({ lastUsedAt: new Date() })
                    .where(eq(widgetTokens.id, tokenRow.id)),
            ]);

            const fromMiliunits = (v: number | null) => (v ?? 0) / 1000;
            const totalBalance = accountBalances.reduce((acc, a) => acc + (a.balance ?? 0), 0);

            // Dense 7-day series ending today (user's calendar), zero-filled
            const byDay = new Map(
                dailyRows.map((r) => [r.date.toISOString().slice(0, 10), r.expenses ?? 0]),
            );
            const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
                const key = d.toISOString().slice(0, 10);
                return { date: key, expenses: fromMiliunits(byDay.get(key) ?? 0) };
            });

            const topCategories = categoryRows.slice(0, 3).map((r) => ({
                name: r.name,
                value: fromMiliunits(r.value),
            }));
            const otherValue = categoryRows.slice(3).reduce((acc, r) => acc + (r.value ?? 0), 0);
            if (otherValue > 0) {
                topCategories.push({ name: "Other", value: fromMiliunits(otherValue) });
            }

            return c.json({
                data: {
                    currency: "INR",
                    todayExpenses: fromMiliunits(today?.expenses),
                    todayIncome: fromMiliunits(today?.income),
                    monthExpenses: fromMiliunits(month?.expenses),
                    monthIncome: fromMiliunits(month?.income),
                    totalBalance: fromMiliunits(totalBalance),
                    accounts: accountBalances.map((a) => ({
                        name: a.name,
                        balance: fromMiliunits(a.balance),
                    })),
                    days,
                    topCategories,
                    asOf: new Date().toISOString(),
                },
            });
        },
    )

    // Latest transactions for the list widget — display-ready rows only
    .get(
        "/transactions",
        zValidator("query", z.object({
            token: z.string().min(8).max(32),
            limit: z.coerce.number().int().min(1).max(20).optional(),
        })),
        async (c) => {
            const { token, limit } = c.req.valid("query");

            const [tokenRow] = await db
                .select({ id: widgetTokens.id, userId: widgetTokens.userId })
                .from(widgetTokens)
                .where(eq(widgetTokens.token, normalizeCode(token)));

            if (!tokenRow) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const rows = await db
                .select({
                    id: transactions.id,
                    payee: transactions.payee,
                    amount: transactions.amount,
                    date: transactions.date,
                    transferId: transactions.transferId,
                    category: categories.name,
                    account: accounts.name,
                })
                .from(transactions)
                .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                .leftJoin(categories, eq(transactions.categoryId, categories.id))
                .where(eq(accounts.userId, tokenRow.userId))
                .orderBy(desc(transactions.date), desc(transactions.id))
                .limit(limit ?? 10);

            return c.json({
                data: rows.map((r) => ({
                    id: r.id,
                    payee: r.payee,
                    amount: r.amount / 1000,
                    date: r.date.toISOString().slice(0, 10),
                    category: r.category ?? (r.transferId ? "Transfer" : null),
                    account: r.account,
                })),
            });
        },
    );

export default app;
