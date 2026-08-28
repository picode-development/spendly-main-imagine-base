import { z } from "zod";
import { db } from "@/db/drizzle";
import { pushSubscriptions } from "@/db/schema";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createId } from "@paralleldrive/cuid2";
import { zValidator } from "@hono/zod-validator";

const app = new Hono()
    // Upserts by endpoint: re-subscribing the same browser (e.g. after
    // clearing site data) just refreshes the row instead of erroring.
    .post(
        "/subscribe",
        clerkMiddleware(),
        zValidator("json", z.object({
            endpoint: z.string().url(),
            keys: z.object({
                p256dh: z.string().min(1),
                auth: z.string().min(1),
            }),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { endpoint, keys } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const [data] = await db
                .insert(pushSubscriptions)
                .values({
                    id: createId(),
                    userId: auth.userId,
                    endpoint,
                    p256dh: keys.p256dh,
                    auth: keys.auth,
                    userAgent: c.req.header("user-agent") ?? null,
                })
                .onConflictDoUpdate({
                    target: pushSubscriptions.endpoint,
                    set: { userId: auth.userId, p256dh: keys.p256dh, auth: keys.auth },
                })
                .returning({ id: pushSubscriptions.id });

            return c.json({ data });
        },
    )

    .delete(
        "/subscribe",
        clerkMiddleware(),
        zValidator("json", z.object({
            endpoint: z.string().url(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { endpoint } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            await db
                .delete(pushSubscriptions)
                .where(and(
                    eq(pushSubscriptions.endpoint, endpoint),
                    eq(pushSubscriptions.userId, auth.userId),
                ));

            return c.json({ data: { deleted: true } });
        },
    )

    .get(
        "/status",
        clerkMiddleware(),
        async (c) => {
            const auth = getAuth(c);
            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            const rows = await db
                .select({ id: pushSubscriptions.id })
                .from(pushSubscriptions)
                .where(eq(pushSubscriptions.userId, auth.userId));

            return c.json({ data: { subscriptionCount: rows.length } });
        },
    );

export default app;
