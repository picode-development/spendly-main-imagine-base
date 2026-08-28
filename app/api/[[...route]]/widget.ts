import { db } from "@/db/drizzle";
import { accounts, categories, pendingTransactions, transactions, widgetTokens } from "@/db/schema";
import { hasGroqKey, llmExtractFromText, llmTranscribe } from "@/lib/groq";
import { getLlmContext } from "@/lib/parse-message";
import { calculatePercentageChange } from "@/lib/utils";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, gte, ilike, isNull, lt, sql, sum } from "drizzle-orm";
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

// Prefer the Authorization header (doesn't land in server/proxy access
// logs the way a URL query string does) — the `?token=` query param is
// kept as a fallback only so widgets still running a pre-update JS bundle
// (OTA hasn't reached them yet) don't break outright.
const readWidgetToken = (c: { req: { header: (name: string) => string | undefined } }, queryToken?: string): string | null => {
    const auth = c.req.header("authorization") || "";
    if (auth.startsWith("Bearer ")) return auth.slice(7);
    return queryToken || null;
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

            const [userAccounts, userCategories] = await Promise.all([
                db
                    .select({ id: accounts.id, name: accounts.name })
                    .from(accounts)
                    .where(eq(accounts.userId, row.userId)),
                db
                    .select({ id: categories.id, name: categories.name })
                    .from(categories)
                    .where(eq(categories.userId, row.userId)),
            ]);

            return c.json({
                data: {
                    paired: true,
                    currency: "INR",
                    accounts: userAccounts,
                    categories: userCategories,
                },
            });
        },
    )

    // Numbers for the home-screen widget. Amounts are returned in plain
    // currency units (rupees), not miliunits — the widget only displays them.
    .get(
        "/summary",
        zValidator("query", z.object({
            token: z.string().min(8).max(32).optional(),
            tzOffset: z.coerce.number().int().min(-840).max(840).optional(),
            // Per-widget-instance scope: a custom range (from/to), all time,
            // or the default last-7-days; optionally filtered to one account
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            allDates: z.enum(["true"]).optional(),
            accountId: z.string().optional(),
            categoryId: z.string().optional(),
        })),
        async (c) => {
            const { token: queryToken, tzOffset, from, to, allDates, accountId, categoryId } = c.req.valid("query");
            const token = readWidgetToken(c, queryToken);
            if (!token) return c.json({ error: "Unauthorized" }, 401);

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

            const DAY = 24 * 60 * 60 * 1000;
            const weekStart = new Date(dayStart.getTime() - 6 * DAY);

            // Optional per-instance filters
            const accountCond = accountId ? eq(transactions.accountId, accountId) : undefined;
            const categoryCond = categoryId ? eq(transactions.categoryId, categoryId) : undefined;
            const parseDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

            // The instance's scope window: custom range, all time, or last 7 days
            const isAllDates = allDates === "true";
            const rangeStart = isAllDates
                ? null
                : from && to
                    ? parseDay(from)
                    : weekStart;
            const rangeEnd = isAllDates
                ? dayEnd
                : from && to
                    ? new Date(parseDay(to).getTime() + DAY)
                    : dayEnd;
            const fmtDay = (d: Date) =>
                `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
            const scopedLabel = isAllDates
                ? "All time"
                : from && to
                    ? from === to
                        ? fmtDay(parseDay(from))
                        : `${fmtDay(parseDay(from))} – ${fmtDay(parseDay(to))}`
                    : "Last 7 days";

            const flows = (fromDate: Date | null, toDate: Date) =>
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
                        accountCond,
                        categoryCond,
                        ...(fromDate ? [gte(transactions.date, fromDate)] : []),
                        lt(transactions.date, toDate),
                    ));

            // Daily series window: the scope range, capped to the last 31
            // days so the chart stays readable (all-time → last 31 days)
            const seriesStart = new Date(Math.max(
                rangeStart?.getTime() ?? 0,
                rangeEnd.getTime() - 31 * DAY,
            ));

            // Previous period of equal length for the % change badges — like
            // the dashboard's DataCards (all-time has no previous period)
            const prevStart = rangeStart
                ? new Date(rangeStart.getTime() - (rangeEnd.getTime() - rangeStart.getTime()))
                : null;

            const [[today], [month], [scopedFlows], [prevFlows], accountBalances, dailyRows, categoryRows] = await Promise.all([
                flows(dayStart, dayEnd),
                flows(monthStart, dayEnd),
                flows(rangeStart, rangeEnd),
                rangeStart && prevStart
                    ? flows(prevStart, rangeStart)
                    : Promise.resolve([{ income: null, expenses: null }]),
                db
                    .select({
                        name: accounts.name,
                        balance: sum(transactions.amount).mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .where(and(eq(accounts.userId, userId), accountCond))
                    .groupBy(accounts.name),
                db
                    .select({
                        date: transactions.date,
                        expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
                        income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .where(and(
                        eq(accounts.userId, userId),
                        isNull(transactions.transferId),
                        accountCond,
                        categoryCond,
                        gte(transactions.date, seriesStart),
                        lt(transactions.date, rangeEnd),
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
                        accountCond,
                        categoryCond,
                        lt(transactions.amount, 0),
                        ...(rangeStart ? [gte(transactions.date, rangeStart)] : []),
                        lt(transactions.date, rangeEnd),
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

            // Dense zero-filled series over the (capped) scope window
            const byDay = new Map(
                dailyRows.map((r) => [r.date.toISOString().slice(0, 10), { expenses: r.expenses ?? 0, income: r.income ?? 0 }]),
            );
            const seriesDays = Math.max(1, Math.round((rangeEnd.getTime() - seriesStart.getTime()) / DAY));
            const days = Array.from({ length: seriesDays }, (_, i) => {
                const d = new Date(seriesStart.getTime() + i * DAY);
                const key = d.toISOString().slice(0, 10);
                const row = byDay.get(key);
                return {
                    date: key,
                    expenses: fromMiliunits(row?.expenses ?? 0),
                    income: fromMiliunits(row?.income ?? 0),
                };
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
                    scoped: {
                        label: scopedLabel,
                        expenses: fromMiliunits(scopedFlows?.expenses),
                        income: fromMiliunits(scopedFlows?.income),
                        remaining: fromMiliunits((scopedFlows?.income ?? 0) - (scopedFlows?.expenses ?? 0)),
                        expensesChange: rangeStart
                            ? calculatePercentageChange(scopedFlows?.expenses ?? 0, prevFlows?.expenses ?? 0)
                            : 0,
                        incomeChange: rangeStart
                            ? calculatePercentageChange(scopedFlows?.income ?? 0, prevFlows?.income ?? 0)
                            : 0,
                        remainingChange: rangeStart
                            ? calculatePercentageChange(
                                (scopedFlows?.income ?? 0) - (scopedFlows?.expenses ?? 0),
                                (prevFlows?.income ?? 0) - (prevFlows?.expenses ?? 0),
                            )
                            : 0,
                    },
                    accountName: accountId
                        ? accountBalances[0]?.name ?? null
                        : null,
                    asOf: new Date().toISOString(),
                },
            });
        },
    )

    // Latest transactions for the list widget — display-ready rows only
    .get(
        "/transactions",
        zValidator("query", z.object({
            token: z.string().min(8).max(32).optional(),
            limit: z.coerce.number().int().min(1).max(100).optional(),
            accountId: z.string().optional(),
            categoryId: z.string().optional(),
            from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            direction: z.enum(["income", "expense"]).optional(),
            sort: z.enum(["date", "amount"]).optional(),
            q: z.string().max(80).optional(),
        })),
        async (c) => {
            const { token: queryToken, limit, accountId, categoryId, from, to, direction, sort, q } =
                c.req.valid("query");
            const token = readWidgetToken(c, queryToken);
            if (!token) return c.json({ error: "Unauthorized" }, 401);

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
                .where(and(
                    eq(accounts.userId, tokenRow.userId),
                    accountId ? eq(transactions.accountId, accountId) : undefined,
                    categoryId ? eq(transactions.categoryId, categoryId) : undefined,
                    from ? gte(transactions.date, new Date(`${from}T00:00:00.000Z`)) : undefined,
                    to ? lt(transactions.date, new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)) : undefined,
                    direction === "income" ? gte(transactions.amount, 0) : undefined,
                    direction === "expense" ? lt(transactions.amount, 0) : undefined,
                    q ? ilike(transactions.payee, `%${q}%`) : undefined,
                ))
                .orderBy(
                    ...(sort === "amount"
                        ? [desc(sql`ABS(${transactions.amount})`)]
                        : [desc(transactions.date), desc(transactions.id)]),
                )
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
    )

    // Voice capture from the widget popup: transcribe + extract like the
    // in-app mic, then stage a pending transaction the user reviews in
    // Spendly (same flow as SMS-detected transactions).
    .post(
        "/voice",
        zValidator("query", z.object({
            token: z.string().min(8).max(32).optional(),
        })),
        async (c) => {
            const { token: queryToken } = c.req.valid("query");
            const token = readWidgetToken(c, queryToken);
            if (!token) return c.json({ error: "Unauthorized" }, 401);

            const [tokenRow] = await db
                .select({ id: widgetTokens.id, userId: widgetTokens.userId })
                .from(widgetTokens)
                .where(eq(widgetTokens.token, normalizeCode(token)));

            if (!tokenRow) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            if (!hasGroqKey()) {
                return c.json({ error: "No voice transcription backend is configured" }, 501);
            }

            const body = await c.req.parseBody();
            const audio = body["audio"];
            if (!(audio instanceof File)) {
                return c.json({ error: "Missing audio" }, 400);
            }
            if (audio.size > 15 * 1024 * 1024) {
                return c.json({ error: "Recording too large" }, 413);
            }

            const ctx = await getLlmContext(tokenRow.userId);
            const transcribed = await llmTranscribe(
                audio,
                audio.name || "voice.m4a",
                [...ctx.accounts, ...ctx.categories],
            );
            if (!transcribed.ok) {
                return c.json({
                    error: transcribed.reason === "no_speech"
                        ? "Couldn't understand the recording"
                        : "Voice service is unavailable right now — try again shortly",
                }, 502);
            }
            const transcript = transcribed.text;

            // A retry-after-1s-sleep here used to double the extraction
            // latency (a second full Groq round-trip) on any voice note
            // without an explicit payee — a very common case for casual
            // dictation. A single attempt is trusted; an incomplete result
            // still stages a pending transaction the user can fill in.
            const parsed = await llmExtractFromText(transcript, ctx);

            const [pending] = await db.insert(pendingTransactions).values({
                id: createId(),
                userId: tokenRow.userId,
                rawMessage: transcript,
                amount: parsed?.amount ?? null,
                payee: parsed?.payee ?? null,
                accountHint: parsed?.accountName ?? null,
                categoryHint: parsed?.categoryName ?? null,
                note: parsed?.note ?? null,
                date: parsed?.date ? new Date(parsed.date) : new Date(),
            }).returning({ id: pendingTransactions.id });

            return c.json({
                data: {
                    transcript,
                    pendingId: pending.id,
                    parsed: parsed
                        ? {
                            amount: parsed.amount != null ? parsed.amount / 1000 : null,
                            payee: parsed.payee ?? null,
                            accountName: parsed.accountName ?? null,
                            categoryName: parsed.categoryName ?? null,
                            note: parsed.note ?? null,
                            date: parsed.date ?? null,
                        }
                        : null,
                },
            });
        },
    );

export default app;
