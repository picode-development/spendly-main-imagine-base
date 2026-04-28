import { db } from "@/db/drizzle";
import { accounts, categories, transactions } from "@/db/schema";
import { calculatePercentageChange, fillMissingDays } from "@/lib/utils";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { parse, addDays, subDays, differenceInDays } from "date-fns";
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

        const result = await db
          .select({
            income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            remaining: sum(transactions.amount).mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(...conditions.filter(Boolean)));

        return result.length > 0 ? result : [{ income: 0, expenses: 0, remaining: 0 }];
      };

      const [currentPeriod] = await fetchData(currentFromDate, currentToDate);

      let lastPeriod = { income: 0, expenses: 0, remaining: 0 };
      
      if (!showAllDates && currentFromDate && currentToDate) {
        const periodLength = differenceInDays(currentToDate, currentFromDate);
        const previousFromDate = subDays(currentFromDate, periodLength + 1);
        const previousToDate = subDays(currentFromDate, 1);
        
        const [previousPeriodData] = await fetchData(previousFromDate, previousToDate);
        lastPeriod = previousPeriodData;
      }

      const incomeChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.income, lastPeriod.income);
      const expensesChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.expenses, lastPeriod.expenses);
      const remainingChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.remaining, lastPeriod.remaining);

      const dateConditions = [];
      if (currentFromDate && currentToDate) {
        dateConditions.push(
          gte(transactions.date, currentFromDate),
          lt(transactions.date, addDays(currentToDate, 1))
        );
      }

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
            ...baseConditions.filter(Boolean),
            ...dateConditions,
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

      const activeDays = await db
        .select({
          date: transactions.date,
          income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
          expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ABS(${transactions.amount}) ELSE 0 END)`.mapWith(Number),
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(...baseConditions.filter(Boolean), ...dateConditions))
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