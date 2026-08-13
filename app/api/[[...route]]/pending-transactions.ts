import { z } from "zod";
import { db } from "@/db/drizzle";
import { pendingTransactions, sharedStash } from "@/db/schema";
import { parseMessage, getLlmContext } from "@/lib/parse-message";
import { llmCleanFieldValue, llmExtractFromImage, llmExtractFromText, llmTranscribe } from "@/lib/groq";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { and, desc, eq, lt } from "drizzle-orm";
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

    // Claims a share-target stash (see app/share-target/route.ts) into the
    // signed-in user's pending transactions, running extraction with their
    // account/category context.
    .post(
        "/claim-share",
        clerkMiddleware(),
        zValidator("json", z.object({
            token: z.string(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { token } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const [stash] = await db
                .select()
                .from(sharedStash)
                .where(eq(sharedStash.id, token));

            if (!stash) {
                return c.json({ error: "Nothing to claim" }, 404);
            }

            let parsed = null;
            if (stash.imageUrls?.length) {
                const extracted = await llmExtractFromImage(
                    stash.imageUrls[0].url,
                    await getLlmContext(auth.userId),
                );
                if (extracted) {
                    parsed = {
                        amount: extracted.isTransaction ? extracted.amount : null,
                        payee: extracted.payee,
                        accountHint: extracted.accountName ?? extracted.accountHint,
                        categoryHint: extracted.categoryName,
                        note: extracted.note,
                        date: extracted.date ?? new Date(),
                    };
                }
            } else if (stash.rawText) {
                parsed = await parseMessage(auth.userId, stash.rawText);
            }

            const [data] = await db.insert(pendingTransactions).values({
                id: createId(),
                userId: auth.userId,
                rawMessage: stash.rawText || "Shared screenshot",
                imageUrls: stash.imageUrls,
                ...(parsed ?? { date: new Date() }),
            }).returning();

            // Burn the token and sweep stale unclaimed stashes
            await db.delete(sharedStash).where(eq(sharedStash.id, token));
            await db.delete(sharedStash).where(
                lt(sharedStash.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
            );

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
            field: z.enum(["payee", "amount", "notes"]).optional(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { mode, field } = c.req.valid("query");

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
                // Per-field dictation: clean the raw transcript into just the
                // value for that field ("uh, the chicken shopkeeper." → name)
                const value = field
                    ? (await llmCleanFieldValue(field, transcript)) ?? transcript
                    : transcript;
                return c.json({ data: { transcript, value, parsed: null } });
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
