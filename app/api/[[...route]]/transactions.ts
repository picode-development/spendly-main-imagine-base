import { z } from "zod";
import { db } from "@/db/drizzle";
import { transactions, InsertTransactionSchema, categories, accounts } from "@/db/schema";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { and, eq, inArray, gte, lte, desc, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createId } from "@paralleldrive/cuid2";
import { zValidator } from "@hono/zod-validator";
import { subDays, parse } from "date-fns";
 

const app = new Hono()
    .get(
        "/",
        zValidator("query", z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            accountId: z.string().optional(),
            allDates: z.enum(["true"]).optional(),
        })),
        clerkMiddleware(),
         async (c) => {
            const auth = getAuth(c);
            const { from, to, accountId, allDates } = c.req.valid("query");

            if(!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const showAllDates = allDates === "true";

            const defaultTo = new Date();
            const defaultFrom = subDays(defaultTo, 30);

            const startDate = from
             ? parse(from, "yyyy-MM-dd", new Date())
             : defaultFrom;

            const endDate = to
                ? parse(to, "yyyy-MM-dd", new Date())
                : defaultTo;
            
            const data = await db
                .select({
                    id: transactions.id,
                    date: transactions.date,
                    category: categories.name,
                    categoryId: transactions.categoryId,
                    payee: transactions.payee,
                    amount: transactions.amount,
                    notes: transactions.notes,
                    account: accounts.name,
                    accountId: transactions.accountId,
                    transferId: transactions.transferId,
                    })
                    .from(transactions)
                    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                    .leftJoin(categories, eq(transactions.categoryId, categories.id))
                    .where(
                        and(
                            accountId ? eq(transactions.accountId, accountId) : undefined,
                            eq(accounts.userId, auth.userId),
                            ...(showAllDates
                                ? []
                                : [
                                    gte(transactions.date, startDate),
                                    lte(transactions.date, endDate),
                                ]),
                        )
                    )
                    .orderBy(desc(transactions.date));

                // When viewing all accounts, collapse each transfer pair into a
                // single row: keep the source (negative) leg and label it with
                // the destination account. Filtering by an account keeps that
                // account's own leg so its balance activity stays visible.
                const rows = data.map((r) => ({ ...r, transferTo: null as string | null }));
                let result = rows;
                if (!accountId) {
                    const destByTransfer = new Map<string, typeof rows[number]>();
                    const sourceTransferIds = new Set<string>();
                    for (const r of rows) {
                        if (!r.transferId) continue;
                        if (r.amount > 0) destByTransfer.set(r.transferId, r);
                        else sourceTransferIds.add(r.transferId);
                    }
                    result = rows
                        .filter((r) => !(
                            r.transferId &&
                            r.amount > 0 &&
                            sourceTransferIds.has(r.transferId)
                        ))
                        .map((r) => {
                            if (r.transferId && r.amount < 0) {
                                const dest = destByTransfer.get(r.transferId);
                                if (dest) return { ...r, transferTo: dest.account };
                            }
                            return r;
                        });
                }

                return c.json({ data: result });

    })

    .get(
        "/:id",
        zValidator("param", z.object({
            id: z.string().optional(),
        })),
        clerkMiddleware(),
        async (c) => {
            const auth = getAuth(c);
            const { id } = c.req.valid("param");

            if (!id) {
                return c.json({error: "Missing id"}, 400);
            }

            if (!auth?.userId) {
                return c.json({error: "Unauthorized"}, 400);
            }

            const [data] = await db
            .select({
                id: transactions.id,
                date: transactions.date,
                categoryId: transactions.categoryId,
                payee: transactions.payee,
                amount: transactions.amount,
                notes: transactions.notes,
                imageUrls: transactions.imageUrls,
                accountId: transactions.accountId,
                transferId: transactions.transferId,
            })
            .from(transactions)
            .innerJoin(accounts, eq(transactions.accountId, accounts.id))
            .where(
                and(
                    eq(transactions.id, id),
                    eq(accounts.userId, auth.userId),
                ),
            );

        if(!data) {
            return c.json({error: "Not found"}, 404);
        }

        return c.json({data});

        }
    )

    .post(
        "/", 
        clerkMiddleware(),
        zValidator("json", InsertTransactionSchema.omit({
            id: true,
        })),
        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({error: "Unauthorized"}, 401);
            }

            const [data] = await db.insert(transactions).values({
                id: createId(),
                ...values,
            }).returning();


        return c.json({ data });
    })

    .post(
        "/bulk-create",
        clerkMiddleware(),
        zValidator(
            "json",
            z.array(
                InsertTransactionSchema.omit({
                    id: true,
                }),
            ),
        ),

        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({error: "Unauthorized"}, 401);
            }

            const data = await db
                .insert(transactions)
                .values(
                    values.map((value) => ({
                        id: createId(),
                        ...value,
                    }))
                )
                .returning();

            return c.json({ data });
        },
    )

    .post(
        "/transfer",
        clerkMiddleware(),
        zValidator(
            "json",
            z.object({
                fromAccountId: z.string(),
                toAccountId: z.string(),
                amount: z.number().int().positive(),
                date: z.coerce.date(),
                notes: z.string().nullish(),
                imageUrls: z.array(z.object({
                    url: z.string(),
                    preview: z.string().optional(),
                })).max(5).nullish(),
            }),
        ),
        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({error: "Unauthorized"}, 401);
            }

            if (values.fromAccountId === values.toAccountId) {
                return c.json({error: "Cannot transfer to the same account"}, 400);
            }

            const userAccounts = await db
                .select({ id: accounts.id, name: accounts.name })
                .from(accounts)
                .where(and(
                    eq(accounts.userId, auth.userId),
                    inArray(accounts.id, [values.fromAccountId, values.toAccountId]),
                ));

            const fromAccount = userAccounts.find((a) => a.id === values.fromAccountId);
            const toAccount = userAccounts.find((a) => a.id === values.toAccountId);

            if (!fromAccount || !toAccount) {
                return c.json({error: "Account not found"}, 404);
            }

            const transferId = createId();

            const data = await db.insert(transactions).values([
                {
                    id: createId(),
                    accountId: fromAccount.id,
                    amount: -values.amount,
                    payee: `Transfer to ${toAccount.name}`,
                    date: values.date,
                    notes: values.notes,
                    imageUrls: values.imageUrls,
                    transferId,
                },
                {
                    id: createId(),
                    accountId: toAccount.id,
                    amount: values.amount,
                    payee: `Transfer from ${fromAccount.name}`,
                    date: values.date,
                    notes: values.notes,
                    imageUrls: values.imageUrls,
                    transferId,
                },
            ]).returning();

            return c.json({ data });
        },
    )

    .post(
        "/bulk-delete",
        clerkMiddleware(),
        zValidator(
            "json",
            z.object({
                ids: z.array(z.string()),
            })
        ),
        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({error: "Unauthorized"}, 401);
            }

            const transactionsToDelete = db.$with("transactions_to_delete").as(
                db.select({
                    id: transactions.id,
                    transferId: transactions.transferId,
                }).from(transactions)
                  .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                  .where(and(
                    inArray(transactions.id, values.ids),
                    eq(accounts.userId, auth.userId),
                  )),
            );

            // Also delete the partner leg of any selected transfer
            const data = await db
            .with(transactionsToDelete)
            .delete(transactions)
            .where(
                or(
                    inArray(transactions.id, sql`(select id from ${transactionsToDelete})`),
                    inArray(transactions.transferId, sql`(select transfer_id from ${transactionsToDelete} where transfer_id is not null)`),
                )
            )

            .returning({
                id: transactions.id,
            });

            return c.json ({ data });
        },
    )

    .patch(
        "/:id",
        clerkMiddleware(),
        zValidator(
            "param",
            z.object({
                id: z.string().optional(),
            }),
        ),
        zValidator(
            "json",
            InsertTransactionSchema.omit({
                id: true,
            })
        ),
        async (c) => {
            const auth = getAuth(c);
            const { id } = c.req.valid("param");
            const values = c.req.valid("json");

            if (!id) {
                return c.json({error: "Missing id"}, 400);
            }

            if (!auth?.userId) {
                return c.json({erroe: "Unauthorized"}, 401);
            }

            const transactionsToUpdate = db.$with("transactions_to_update").as(
                db.select({id: transactions.id})
                .from(transactions)
                .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                .where(and(
                    eq(transactions.id, id),
                    eq(accounts.userId, auth.userId),
                ))

            );

            const [data] = await db
            .with(transactionsToUpdate)
            .update(transactions)
            .set(values)
            .where(
                inArray(transactions.id, sql`(select id from ${transactionsToUpdate})`)
            )

            .returning();

            if (!data) {
                return c.json({error: "Not found"}, 404);
            }

            // Keep the other leg of a transfer in sync (mirrored amount)
            if (data.transferId) {
                await db
                    .update(transactions)
                    .set({
                        amount: -data.amount,
                        date: data.date,
                        notes: data.notes,
                        imageUrls: data.imageUrls,
                    })
                    .where(and(
                        eq(transactions.transferId, data.transferId),
                        ne(transactions.id, data.id),
                    ));
            }

            return c.json({ data });

        },


    )

    .delete(
        "/:id",
        clerkMiddleware(),
        zValidator(
            "param",
            z.object({
                id: z.string().optional(),
            }),
        ),
        
        async (c) => {
            const auth = getAuth(c);
            const { id } = c.req.valid("param");

            if (!id) {
                return c.json({error: "Missing id"}, 400);
            }

            if (!auth?.userId) {
                return c.json({erroe: "Unauthorized"}, 401);
            }

            const [target] = await db
                .select({ id: transactions.id, transferId: transactions.transferId })
                .from(transactions)
                .innerJoin(accounts, eq(transactions.accountId, accounts.id))
                .where(and(
                    eq(transactions.id, id),
                    eq(accounts.userId, auth.userId),
                ));

            if (!target) {
                return c.json({error: "Not found"}, 404);
            }

            // Deleting one leg of a transfer removes its partner too
            await db
                .delete(transactions)
                .where(
                    target.transferId
                        ? eq(transactions.transferId, target.transferId)
                        : eq(transactions.id, target.id),
                );

            return c.json({ data: { id: target.id } });

        },


    );

export default app;