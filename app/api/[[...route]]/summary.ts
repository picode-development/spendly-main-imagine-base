import { db } from "@/db/drizzle";
import { accounts, categories, transactions } from "@/db/schema";
import { calculatePercentageChange, fillMissingDays } from "@/lib/utils";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { zValidator } from "@hono/zod-validator";
import { parse, addDays } from "date-fns";
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
      ];

      const dateConditions =
        !showAllDates && from && to
          ? [
              gte(transactions.date, parse(from, "yyyy-MM-dd", new Date())),
              lt(transactions.date, addDays(parse(to, "yyyy-MM-dd", new Date()), 1)),
            ]
          : [];

      const fetchData = async (additionalConditions: any[] = []) => {
        return await db
          .select({
            income: sql`SUM(CASE WHEN ${transactions.amount} >= 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            expenses: sql`SUM(CASE WHEN ${transactions.amount} < 0 THEN ${transactions.amount} ELSE 0 END)`.mapWith(Number),
            remaining: sum(transactions.amount).mapWith(Number),
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(...[...baseConditions, ...dateConditions, ...additionalConditions]));
      };

      const [currentPeriod] = await fetchData();

      const [lastPeriod] = showAllDates
        ? [{ income: 0, expenses: 0, remaining: 0 }]
        : await fetchData();

      const incomeChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.income, lastPeriod.income);
      const expensesChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.expenses, lastPeriod.expenses);
      const remainingChange = showAllDates
        ? 0
        : calculatePercentageChange(currentPeriod.remaining, lastPeriod.remaining);

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
        .where(and(...[...baseConditions, ...dateConditions]))
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
                  parse(from, "yyyy-MM-dd", new Date()),
                  parse(to, "yyyy-MM-dd", new Date())
                ),
          showAllDates,
        },
      });
    }
  );

export default app;
