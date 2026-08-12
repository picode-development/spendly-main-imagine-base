import { z } from "zod";
import { db } from "@/db/drizzle";
import { smsRules } from "@/db/schema";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createId } from "@paralleldrive/cuid2";
import { zValidator } from "@hono/zod-validator";

const app = new Hono()
    .get(
        "/",
        clerkMiddleware(),
        async (c) => {
            const auth = getAuth(c);

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const data = await db
                .select()
                .from(smsRules)
                .where(eq(smsRules.userId, auth.userId))
                .orderBy(desc(smsRules.createdAt));

            return c.json({ data });
        },
    )

    .post(
        "/",
        clerkMiddleware(),
        zValidator("json", z.object({
            matchText: z.string().min(2).max(100),
            direction: z.enum(["auto", "income", "expense"]),
            anchors: z.object({
                payee: z.object({ prefix: z.string().min(1).max(80), suffix: z.string().max(80).nullish() }).nullish(),
                amount: z.object({ prefix: z.string().min(1).max(80), suffix: z.string().max(80).nullish() }).nullish(),
                account: z.object({ prefix: z.string().min(1).max(80), suffix: z.string().max(80).nullish() }).nullish(),
                date: z.object({ prefix: z.string().min(1).max(80), suffix: z.string().max(80).nullish() }).nullish(),
            }).nullish(),
            sample: z.string().max(2000).nullish(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const [data] = await db.insert(smsRules).values({
                id: createId(),
                userId: auth.userId,
                ...values,
            }).returning();

            return c.json({ data });
        },
    )

    .delete(
        "/:id",
        clerkMiddleware(),
        zValidator("param", z.object({
            id: z.string(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { id } = c.req.valid("param");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const [data] = await db
                .delete(smsRules)
                .where(and(
                    eq(smsRules.id, id),
                    eq(smsRules.userId, auth.userId),
                ))
                .returning({ id: smsRules.id });

            if (!data) {
                return c.json({ error: "Not found" }, 404);
            }

            return c.json({ data });
        },
    );

export default app;
