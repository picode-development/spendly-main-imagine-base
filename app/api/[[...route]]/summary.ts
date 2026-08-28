import { db } from "@/db/drizzle";
import { accounts, categories, transactions } from "@/db/schema";
import { calculatePercentageChange, fillMissingDays } from "@/lib/utils";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { parse, addDays, subDays, differenceInDays } from "date-fns";
import { and, desc, eq, gte, isNull, lt, sql, sum } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono()
  .get(
    "/",
    clerkMiddleware(),
    zValidator(
      "query",
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        accountId: z.string().optional(),
        categoryId: z.string().optional(),
        allDates: z.enum(["true"]).optional(),
      })
    ),
    async (c) => {
      const auth = getAuth(c);
      const { from, to, accountId, categoryId, allDates } = c.req.valid("query");

      if (!auth?.userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const showAllDates = allDates === "true";

      const baseConditions = [
        accountId ? eq(transactions.accountId, accountId) : undefined,
        categoryId ? eq(transactions.categoryId, categoryId) : undefined,
        eq(accounts.userId, auth.userId),
      ].filter(Boolean);

      const currentFromDate = from ? parse(from, "yyyy-MM-dd", new Date()) : null;
      const currentToDate = to ? parse(to, "yyyy-MM-dd", new Date()) : null;

      const fetchData = async (fromDate?: Date | null, toDate?: Date | null) => {
        const conditions = [...baseConditions];
        
        if (fromDate && toDate) {
          conditions.push(
            gte(transactions.date, fromDate),
            lt(transactions.date, addDays(toDate, 1))
          );
        }

        // Transfers between accounts (transfer_id set) are not real income or
        // expenses — they only move balances, so only `remaining` counts them
        const result = await db
          .select({
            income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 AND ${transactions.transferId} IS NULL THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 AND ${transactions.transferId} IS NULL THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            remaining: sum(transactions.amount).mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(...conditions.filter(Boolean)));

        return result.length > 0 ? result : [{ income: 0, expenses: 0, remaining: 0 }];
      };

      const wantsPreviousPeriod = !showAllDates && currentFromDate && currentToDate;
      let previousFromDate: Date | null = null;
      let previousToDate: Date | null = null;
      if (wantsPreviousPeriod) {
        const periodLength = differenceInDays(currentToDate!, currentFromDate!);
        previousFromDate = subDays(currentFromDate!, periodLength + 1);
        previousToDate = subDays(currentFromDate!, 1);
      }

      const dateConditions = [];
      if (currentFromDate && currentToDate) {
        dateConditions.push(
          gte(transactions.date, currentFromDate),
          lt(transactions.date, addDays(currentToDate, 1))
        );
      }

      // Independent of each other — run concurrently instead of one at a time
      const [[currentPeriod], [previousPeriodData], category, activeDays] = await Promise.all([
        fetchData(currentFromDate, currentToDate),
        wantsPreviousPeriod
          ? fetchData(previousFromDate, previousToDate)
          : Promise.resolve([{ income: 0, expenses: 0, remaining: 0 }]),
        db
          .select({
            name: categories.name,
            value: sql`SUM(ABS(${transactions.amount}))`.mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .innerJoin(categories, eq(transactions.categoryId, categories.id))
          .where(
            and(
              ...baseConditions.filter(Boolean),
              ...dateConditions,
              lt(transactions.amount, 0),
              isNull(transactions.transferId)
            )
          )
          .groupBy(categories.name)
          .orderBy(desc(sql`SUM(ABS(${transactions.amount}))`)),
        db
          .select({
            date: transactions.date,
            income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 AND ${transactions.transferId} IS NULL THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 AND ${transactions.transferId} IS NULL THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(...baseConditions.filter(Boolean), ...dateConditions))
          .groupBy(transactions.date)
          .orderBy(transactions.date),
      ]);
      const lastPeriod = previousPeriodData;

      const incomeChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.income, lastPeriod.income);
      const expensesChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.expenses, lastPeriod.expenses);
      const remainingChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.remaining, lastPeriod.remaining);

      const topCategories = category.slice(0, 3);
      const otherSum = category.slice(3).reduce((sum, c) => sum + c.value, 0);
      const finalCategories = [...topCategories];
      if (category.length > 3) {
        finalCategories.push({ name: "Other", value: otherSum });
      }

      return c.json({
        data: {
          remainingAmount: currentPeriod.remaining,
          remainingChange,
          incomeAmount: currentPeriod.income,
          incomeChange,
          expensesAmount: currentPeriod.expenses,
          expensesChange,
          categories: finalCategories,
          days:
            showAllDates || !currentFromDate || !currentToDate
              ? activeDays
              : fillMissingDays(
                  activeDays,
                  currentFromDate,
                  currentToDate
                ),
          showAllDates,
        },
      });
    }
  );

export default app;