import { z } from "zod";
import { db } from "@/db/drizzle";
import { pendingTransactions } from "@/db/schema";
import { parseMessage, getLlmContext } from "@/lib/parse-message";
import { llmExtractFromText, llmTranscribe } from "@/lib/groq";
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
                .from(pendingTransactions)
                .where(eq(pendingTransactions.userId, auth.userId))
                .orderBy(desc(pendingTransactions.createdAt));

            return c.json({ data });
        },
    )

    // Unauthenticated ingest for SMS forwarders (MacroDroid/Tasker). Secured by
    // a shared secret token; the token maps to the owning user via env config.
    .post(
        "/ingest",
        zValidator("query", z.object({
            token: z.string(),
        })),
        zValidator("json", z.object({
            message: z.string().min(1).max(2000),
        })),
        async (c) => {
            const { token } = c.req.valid("query");
            const { message } = c.req.valid("json");

            const expectedToken = process.env.SMS_INBOX_TOKEN;
            const inboxUserId = process.env.SMS_INBOX_USER_ID;

            if (!expectedToken || !inboxUserId) {
                return c.json({ error: "SMS inbox not configured" }, 501);
            }
            if (token !== expectedToken) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const parsed = await parseMessage(inboxUserId, message);

            // OTPs, balance alerts, promos — acknowledged but not stored
            if (!parsed) {
                return c.json({ data: { ignored: true as const } });
            }

            const [data] = await db.insert(pendingTransactions).values({
                id: createId(),
                userId: inboxUserId,
                rawMessage: message,
                ...parsed,
            }).returning();

            return c.json({ data });
        },
    )

    // Authenticated create — used by the share-to-Spendly flow. Stores the
    // message even when parsing is incomplete: the user chose to share it.
    .post(
        "/",
        clerkMiddleware(),
        zValidator("json", z.object({
            message: z.string().min(1).max(2000),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { message } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            // Stored even when parsing is incomplete: the user chose to share it
            const parsed = await parseMessage(auth.userId, message);

            const [data] = await db.insert(pendingTransactions).values({
                id: createId(),
                userId: auth.userId,
                rawMessage: message,
                ...(parsed ?? { date: new Date() }),
            }).returning();

            return c.json({ data });
        },
    )

    // Voice input: transcribes the recording; with mode=extract it also pulls
    // out transaction fields (matched against the user's accounts/categories).
    .post(
        "/voice",
        clerkMiddleware(),
        zValidator("query", z.object({
            mode: z.enum(["extract", "transcribe"]).optional(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { mode } = c.req.valid("query");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            if (!process.env.GROQ_KEY) {
                return c.json({ error: "Voice input needs a Groq API key (GROQ_KEY)" }, 501);
            }

            const body = await c.req.parseBody();
            const audio = body["audio"];
            if (!(audio instanceof File)) {
                return c.json({ error: "Missing audio" }, 400);
            }

            const transcript = await llmTranscribe(audio, audio.name || "voice.webm");
            if (!transcript) {
                return c.json({ error: "Couldn't understand the recording" }, 502);
            }

            if (mode === "transcribe") {
                return c.json({ data: { transcript, parsed: null } });
            }

            const parsed = await llmExtractFromText(transcript, await getLlmContext(auth.userId));
            return c.json({ data: { transcript, parsed } });
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
                .delete(pendingTransactions)
                .where(and(
                    eq(pendingTransactions.id, id),
                    eq(pendingTransactions.userId, auth.userId),
                ))
                .returning({ id: pendingTransactions.id });

            if (!data) {
                return c.json({ error: "Not found" }, 404);
            }

            return c.json({ data });
        },
    );

export default app;
