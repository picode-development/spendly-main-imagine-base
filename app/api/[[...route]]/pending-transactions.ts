import { z } from "zod";
import { db } from "@/db/drizzle";
import { pendingTransactions, sharedStash } from "@/db/schema";
import { parseMessage, getLlmContext } from "@/lib/parse-message";
import { hasGroqKey, llmCleanFieldValue, llmExtractFromImage, llmExtractFromText, llmTranscribe } from "@/lib/groq";
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

    // Dismiss every detected transaction at once
    .post(
        "/clear-all",
        clerkMiddleware(),
        async (c) => {
            const auth = getAuth(c);
            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            const data = await db
                .delete(pendingTransactions)
                .where(eq(pendingTransactions.userId, auth.userId))
                .returning({ id: pendingTransactions.id });
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

            let rows;
            if (stash.imageUrls?.length) {
                // Each shared screenshot becomes its own detected transaction.
                // UPI apps attach a summary caption — the vision model reads it
                // alongside each image.
                const ctx = await getLlmContext(auth.userId);
                rows = await Promise.all(stash.imageUrls.map(async (image) => {
                    const extracted = await llmExtractFromImage(image.url, ctx, stash.rawText);
                    const parsed = extracted ? {
                        amount: extracted.isTransaction ? extracted.amount : null,
                        payee: extracted.payee,
                        accountHint: extracted.accountName ?? extracted.accountHint,
                        categoryHint: extracted.categoryName,
                        note: extracted.note,
                        date: extracted.date ?? new Date(),
                    } : (stash.rawText ? await parseMessage(auth.userId, stash.rawText) : null);

                    return {
                        id: createId(),
                        userId: auth.userId!,
                        rawMessage: stash.rawText || "Shared screenshot",
                        imageUrls: [image],
                        ...(parsed ?? { date: new Date() }),
                    };
                }));
            } else {
                const parsed = stash.rawText
                    ? await parseMessage(auth.userId, stash.rawText)
                    : null;
                rows = [{
                    id: createId(),
                    userId: auth.userId,
                    rawMessage: stash.rawText || "Shared content",
                    imageUrls: null,
                    ...(parsed ?? { date: new Date() }),
                }];
            }

            const data = await db.insert(pendingTransactions).values(rows).returning();

            // Burn the token and sweep stale unclaimed stashes
            await db.delete(sharedStash).where(eq(sharedStash.id, token));
            await db.delete(sharedStash).where(
                lt(sharedStash.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
            );

            return c.json({ data });
        },
    )

    // Extraction-only. Accepts a local data-URL copy (the initial detection,
    // before hosting completes) or a hosted https URL (every AI task after
    // the upload). Single attempt, no retry — matches llmExtractFromImage's
    // own contract (hermesPost is one-shot; a failure resolves to null, not
    // a throw), same as every other Hermes-backed extraction call site.
    .post(
        "/extract-image",
        clerkMiddleware(),
        zValidator("json", z.object({
            image: z.string().max(3_500_000).refine(
                (v) => v.startsWith("data:image/") || v.startsWith("https://"),
                "Must be an image data URL or an https URL",
            ),
            text: z.string().max(2000).nullish(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { image, text } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const ctx = await getLlmContext(auth.userId);
            const extracted = await llmExtractFromImage(image, ctx, text);
            return c.json({ data: extracted });
        },
    )

    // Insert-only: the client already has the extraction and the hosted
    // full-quality image; this just records the detected transaction.
    .post(
        "/create-detected",
        clerkMiddleware(),
        zValidator("json", z.object({
            rawMessage: z.string().min(1).max(2000),
            amount: z.number().int().nullish(),
            payee: z.string().max(200).nullish(),
            accountHint: z.string().max(200).nullish(),
            categoryHint: z.string().max(200).nullish(),
            note: z.string().max(500).nullish(),
            date: z.coerce.date().nullish(),
            imageUrls: z.array(z.object({
                url: z.string().url(),
                preview: z.string().optional(),
            })).max(5).nullish(),
            // Content hash of the screenshot — makes inserts idempotent when
            // Android re-delivers a share intent on app resume
            clientKey: z.string().regex(/^[a-f0-9]{16,64}$/).nullish(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const values = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }

            const id = values.clientKey
                ? `img${values.clientKey.slice(0, 32)}`
                : createId();

            const [data] = await db.insert(pendingTransactions).values({
                id,
                userId: auth.userId,
                rawMessage: values.rawMessage,
                amount: values.amount ?? null,
                payee: values.payee ?? null,
                accountHint: values.accountHint ?? null,
                categoryHint: values.categoryHint ?? null,
                note: values.note ?? null,
                imageUrls: values.imageUrls ?? null,
                date: values.date ?? new Date(),
            }).onConflictDoNothing().returning();

            // Conflict = this exact screenshot is already pending — a
            // re-delivered share, not a new transaction
            return c.json({ data: data ?? null });
        },
    )

    // Fill an existing (blank) pending row after a retry succeeded
    .patch(
        "/detected/:id",
        clerkMiddleware(),
        zValidator("param", z.object({ id: z.string() })),
        zValidator("json", z.object({
            amount: z.number().int().nullish(),
            payee: z.string().max(200).nullish(),
            accountHint: z.string().max(200).nullish(),
            categoryHint: z.string().max(200).nullish(),
            note: z.string().max(500).nullish(),
            date: z.coerce.date().nullish(),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { id } = c.req.valid("param");
            const v = c.req.valid("json");
            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            const [data] = await db
                .update(pendingTransactions)
                .set({
                    amount: v.amount ?? null,
                    payee: v.payee ?? null,
                    accountHint: v.accountHint ?? null,
                    categoryHint: v.categoryHint ?? null,
                    note: v.note ?? null,
                    ...(v.date ? { date: v.date } : {}),
                })
                .where(and(
                    eq(pendingTransactions.id, id),
                    eq(pendingTransactions.userId, auth.userId),
                ))
                .returning();
            return c.json({ data: data ?? null });
        },
    )

    // Client-uploaded share (service-worker path): images are already hosted
    // by the page; extract each and fan out one pending per image.
    .post(
        "/from-share",
        clerkMiddleware(),
        zValidator("json", z.object({
            text: z.string().max(2000).nullish(),
            images: z.array(z.object({
                url: z.string().url(),
                preview: z.string().optional(),
            })).max(25),
        })),
        async (c) => {
            const auth = getAuth(c);
            const { text, images } = c.req.valid("json");

            if (!auth?.userId) {
                return c.json({ error: "Unauthorized" }, 401);
            }
            if (images.length === 0 && !text?.trim()) {
                return c.json({ error: "Nothing to read" }, 400);
            }

            let rows;
            if (images.length > 0) {
                const ctx = await getLlmContext(auth.userId);
                rows = await Promise.all(images.map(async (image) => {
                    const extracted = await llmExtractFromImage(image.url, ctx, text);
                    const parsed = extracted ? {
                        amount: extracted.isTransaction ? extracted.amount : null,
                        payee: extracted.payee,
                        accountHint: extracted.accountName ?? extracted.accountHint,
                        categoryHint: extracted.categoryName,
                        note: extracted.note,
                        date: extracted.date ?? new Date(),
                    } : (text ? await parseMessage(auth.userId!, text) : null);

                    return {
                        id: createId(),
                        userId: auth.userId!,
                        rawMessage: text || "Shared screenshot",
                        imageUrls: [image],
                        ...(parsed ?? { date: new Date() }),
                    };
                }));
            } else {
                const parsed = await parseMessage(auth.userId, text!.trim());
                rows = [{
                    id: createId(),
                    userId: auth.userId,
                    rawMessage: text!.trim(),
                    imageUrls: null,
                    ...(parsed ?? { date: new Date() }),
                }];
            }

            const data = await db.insert(pendingTransactions).values(rows).returning();
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
            if (!hasGroqKey()) {
                // Whisper is Groq-only; Gemini can't transcribe here
                return c.json({ error: "Voice input needs a Groq API key" }, 501);
            }

            const body = await c.req.parseBody();
            const audio = body["audio"];
            if (!(audio instanceof File)) {
                return c.json({ error: "Missing audio" }, 400);
            }
            if (audio.size > 15 * 1024 * 1024) {
                return c.json({ error: "Recording too large" }, 413);
            }

            // Prime Whisper with the user's own account/category names so
            // spoken proper nouns transcribe correctly
            const ctx = await getLlmContext(auth.userId);
            const transcribed = await llmTranscribe(
                audio,
                audio.name || "voice.webm",
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

            if (mode === "transcribe") {
                // Per-field dictation: clean the raw transcript into just the
                // value for that field ("uh, the chicken shopkeeper." → name)
                const value = field
                    ? (await llmCleanFieldValue(field, transcript)) ?? transcript
                    : transcript;
                return c.json({ data: { transcript, value, parsed: null } });
            }

            // A transcript that transcribed fine should never come back with
            // no fields because of a transient rate-limit — retry until it
            // yields something usable (or attempts run out)
            // Any stated field counts — a partial edit ("change category to
            // Food") is a valid, usable result, not a failure
            const isUsable = (p: Awaited<ReturnType<typeof llmExtractFromText>>) =>
                !!p && (
                    p.amount != null || !!p.payee || !!p.accountName || !!p.categoryName ||
                    !!p.toAccountName || !!p.note || !!p.date || p.isTransfer || !!p.switchTo
                );
            let parsed = await llmExtractFromText(transcript, ctx);
            for (let attempt = 0; attempt < 2 && !isUsable(parsed); attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                parsed = await llmExtractFromText(transcript, ctx);
            }
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
