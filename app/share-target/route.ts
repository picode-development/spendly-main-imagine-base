import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { db } from "@/db/drizzle";
import { sharedStash, TransactionImage } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

// Android PWA share target (see app/manifest.ts). Share launches are
// top-level POSTs, and browsers withhold SameSite-Lax session cookies on
// those — so this endpoint is deliberately UNAUTHENTICATED. It stashes the
// shared content under a one-time token and redirects to the signed-in
// /share-claim page (a GET, where cookies flow), which claims the stash
// into the user's pending transactions.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const uploadToImgBB = async (buffer: Buffer): Promise<string | null> => {
    const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
    if (!apiKey) return null;
    try {
        const form = new FormData();
        form.append("image", buffer.toString("base64"));
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: form,
        });
        const data = await res.json();
        if (!data?.success) {
            console.error("Share-target ImgBB upload failed:", data?.error);
            return null;
        }
        return data.data.url as string;
    } catch (e) {
        console.error("Share-target ImgBB upload failed:", e);
        return null;
    }
};

const makeBlurPreview = async (buffer: Buffer): Promise<string | undefined> => {
    try {
        const preview = await sharp(buffer)
            .resize(32, 32, { fit: "inside" })
            .jpeg({ quality: 60 })
            .toBuffer();
        return `data:image/jpeg;base64,${preview.toString("base64")}`;
    } catch {
        return undefined;
    }
};

export async function POST(req: NextRequest) {
    // NOTE: no Sec-Fetch-Site gating here — Android labels genuine share
    // launches as "cross-site" (the initiator is the sharing app), so
    // blocking cross-site blocks real shares. Residual risk is limited to
    // planting a harmless stash suggestion (claim needs a signed-in user and
    // the exact one-time token; nothing is written without user review).

    const form = await req.formData();
    const text = [form.get("title"), form.get("text"), form.get("url")]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ")
        .trim()
        .slice(0, 2000);
    // Bulk shares supported: each screenshot becomes its own detected
    // transaction at claim time
    const images = form
        .getAll("media")
        .filter((f): f is File =>
            f instanceof File && f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES)
        .slice(0, 10);

    if (images.length === 0 && !text) {
        return NextResponse.redirect(new URL("/transactions", req.url), 303);
    }

    const uploaded = await Promise.all(
        images.map(async (image): Promise<TransactionImage | null> => {
            const buffer = Buffer.from(await image.arrayBuffer());
            const [hostedUrl, preview] = await Promise.all([
                uploadToImgBB(buffer),
                makeBlurPreview(buffer),
            ]);
            return hostedUrl ? { url: hostedUrl, preview } : null;
        }),
    );
    const imageUrls = uploaded.filter((u): u is TransactionImage => u !== null);

    const token = createId();
    await db.insert(sharedStash).values({
        id: token,
        rawText: text || null,
        imageUrls: imageUrls.length > 0 ? imageUrls : null,
    });

    return NextResponse.redirect(new URL(`/share-claim?token=${token}`, req.url), 303);
}
