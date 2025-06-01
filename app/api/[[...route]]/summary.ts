import { db } from "@/db/drizzle";
import { accounts, categories, transactions } from "@/db/schema";
import { calculatePercentageChange, fillMissingDays } from "@/lib/utils";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { parse, addDays, subDays } from "date-fns";
import { and, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
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
        allDates: z.enum(["true"]).optional(),
      })
    ),
    async (c) => {
      const auth = getAuth(c);
      const { from, to, accountId, allDates } = c.req.valid("query");

      if (!auth?.userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const showAllDates = allDates === "true";

      const baseConditions = [
        accountId ? eq(transactions.accountId, accountId) : undefined,
        eq(accounts.userId, auth.userId),
      ].filter(Boolean);

      // Default to last 30 days if no dates provided
      const today = new Date();
      let fromDate = from ? parse(from, "yyyy-MM-dd", new Date()) : subDays(today, 30);
      let toDate = to ? parse(to, "yyyy-MM-dd", new Date()) : today;

      // Current period date range
      const currentDateConditions = [
        gte(transactions.date, fromDate),
        lt(transactions.date, addDays(toDate, 1)),
      ];

      // Calculate previous period with same duration (e.g. previous 30 days before the fromDate)
      const getDaysInPeriod = (start: Date, end: Date) => {
        return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      };

      const daysInCurrentPeriod = getDaysInPeriod(fromDate, toDate);
      const previousFromDate = subDays(fromDate, daysInCurrentPeriod);
      const previousToDate = subDays(fromDate, 1);

      const previousDateConditions = [
        gte(transactions.date, previousFromDate),
        lt(transactions.date, addDays(previousToDate, 1)),
      ];

      const fetchData = async (dateConditions: any[] = []) => {
        const result = await db
          .select({
            income: sql`COALESCE(SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(Number),
            expenses: sql`COALESCE(SUM(CASE WHEN ${transactions.amount} < 0 THEN ${transactions.amount} ELSE 0 END), 0)`.mapWith(Number),
            remaining: sql`COALESCE(SUM(${transactions.amount}), 0)`.mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(...[...baseConditions, ...dateConditions]));
        
        return result[0] || { income: 0, expenses: 0, remaining: 0 };
      };

      // Fetch data for current period
      const currentPeriod = await fetchData(currentDateConditions);

      // Fetch data for previous period (only if not showing all dates)
      const previousPeriod = showAllDates
        ? { income: 0, expenses: 0, remaining: 0 }
        : await fetchData(previousDateConditions);

      // Calculate percentage changes
      const incomeChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.income, previousPeriod.income);
      const expensesChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.expenses, previousPeriod.expenses);
      const remainingChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.remaining, previousPeriod.remaining);

      // Fetch top expense categories
      const category = await db
        .select({
          name: categories.name,
          value: sql`SUM(ABS(${transactions.amount}))`.mapWith(Number),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            ...baseConditions,
            ...currentDateConditions,
            lt(transactions.amount, 0)
          )
        )
        .groupBy(categories.name)
        .orderBy(desc(sql`SUM(ABS(${transactions.amount}))`));

      const topCategories = category.slice(0, 3);
      const otherSum = category.slice(3).reduce((sum, c) => sum + c.value, 0);
      const finalCategories = [...topCategories];
      if (category.length > 3) {
        finalCategories.push({ name: "Other", value: otherSum });
      }

      // Fetch daily data
      const activeDays = await db
        .select({
          date: transactions.date,
          income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
          expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(...[...baseConditions, ...currentDateConditions]))
        .groupBy(transactions.date)
        .orderBy(transactions.date);

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
            showAllDates || !from || !to
              ? activeDays
              : fillMissingDays(
                  activeDays,
                  fromDate,
                  toDate
                ),
          showAllDates,
        },
      });
    }
  );

export default app;