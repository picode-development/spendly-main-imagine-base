import { Hono } from "hono";
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/db/drizzle";
import { receiptImages } from "@/db/schema";

const app = new Hono()
    // Serve an uploaded receipt image with long-lived immutable cache
    .get("/:id", async (c) => {
        const id = c.req.param("id");
        if (!id) return c.text("Not found", 404);

        const [item] = await db
            .select()
            .from(receiptImages)
            .where(eq(receiptImages.id, id));

        if (!item) return c.text("Not found", 404);

        const buffer = Buffer.from(item.data, "base64");
        return new Response(buffer, {
            status: 200,
            headers: {
                "Content-Type": item.mimeType || "image/jpeg",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    })

    // Upload receipt image: accepts multipart/form-data or JSON payload
    .post("/upload", clerkMiddleware(), async (c) => {
        const auth = getAuth(c);
        const userId = auth?.userId || null;

        let base64Data: string | null = null;
        let mimeType = "image/jpeg";
        let preview: string | undefined;

        const contentType = c.req.header("content-type") || "";

        if (contentType.includes("application/json")) {
            const body = await c.req.json().catch(() => null);
            if (body?.data) {
                const match = body.data.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    mimeType = match[1];
                    base64Data = match[2];
                } else {
                    base64Data = body.data;
                    mimeType = body.mimeType || "image/jpeg";
                }
                preview = body.preview;
            }
        } else {
            const body = await c.req.parseBody();
            const file = body["file"] || body["image"] || body["media"];

            if (file instanceof File) {
                const buffer = Buffer.from(await file.arrayBuffer());
                base64Data = buffer.toString("base64");
                mimeType = file.type && file.type.startsWith("image/")
                    ? file.type
                    : "image/jpeg";

                // Generate blur preview if possible
                try {
                    const thumb = await sharp(buffer)
                        .resize(32, 32, { fit: "inside" })
                        .jpeg({ quality: 60 })
                        .toBuffer();
                    preview = `data:image/jpeg;base64,${thumb.toString("base64")}`;
                } catch {
                    // Preview is optional
                }
            }
        }

        if (!base64Data) {
            return c.json({ error: "Missing image data" }, 400);
        }

        const id = createId();
        await db.insert(receiptImages).values({
            id,
            userId,
            mimeType,
            data: base64Data,
        });

        const url = `/api/images/${id}`;
        return c.json({
            data: {
                id,
                url,
                preview,
            },
        });
    });

export default app;
