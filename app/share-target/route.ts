import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { db } from "@/db/drizzle";
import { receiptImages, sharedStash, TransactionImage } from "@/db/schema";
import { normalizeShareFormData } from "@/features/share-intake";
import { createId } from "@paralleldrive/cuid2";

// Android PWA share target (see app/manifest.ts). Share launches are
// top-level POSTs, and browsers withhold SameSite-Lax session cookies on
// those — so this endpoint is deliberately UNAUTHENTICATED. It stashes the
// shared content under a one-time token and redirects to the signed-in
// /share-claim page (a GET, where cookies flow), which claims the stash
// into the user's pending transactions.

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const uploadToImgBB = async (buffer: Buffer): Promise<string | null> => {
    const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY || process.env.IMGBB_API_KEY;
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
            console.warn("Share-target ImgBB upload failed:", data?.error?.message || data?.error);
            return null;
        }
        return (data.data?.display_url || data.data?.url) as string;
    } catch (e) {
        console.warn("Share-target ImgBB upload error:", e);
        return null;
    }
};

const saveImageReliably = async (buffer: Buffer, mimeType: string): Promise<string> => {
    // Try ImgBB if configured
    const imgbbUrl = await uploadToImgBB(buffer);
    if (imgbbUrl) return imgbbUrl;

    // Fall back to database storage so no image is ever dropped
    const id = createId();
    await db.insert(receiptImages).values({
        id,
        mimeType: mimeType || "image/jpeg",
        data: buffer.toString("base64"),
    });
    return `/api/images/${id}`;
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

const detectBufferMime = (buffer: Buffer): string | null => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return "image/png";
    }
    if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        return "image/webp";
    }
    if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return "image/gif";
    }
    if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
        return "image/bmp";
    }
    return null;
};

export async function POST(req: NextRequest) {
    // NOTE: no Sec-Fetch-Site gating here — Android labels genuine share
    // launches as "cross-site" (the initiator is the sharing app), so
    // blocking cross-site blocks real shares. Residual risk is limited to
    // planting a harmless stash suggestion (claim needs a signed-in user and
    // the exact one-time token; nothing is written without user review).

    const form = await req.formData();
    const { text, images: normalizedImages } = await normalizeShareFormData(form, 10);

    console.log("[share-target:route] text:", text);
    console.log("[share-target:route] imageCount:", normalizedImages.length, "textLen:", text.length);

    if (normalizedImages.length === 0 && !text) {
        return NextResponse.redirect(new URL("/transactions", req.url), 303);
    }

    const uploaded = await Promise.all(
        normalizedImages.map(async (image): Promise<TransactionImage | null> => {
            try {
                const buffer = Buffer.from(image.data);
                if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;

                const detectedMime = detectBufferMime(buffer);
                let mimeType = detectedMime || image.type;
                if (!mimeType || !mimeType.startsWith("image/")) {
                    const name = (image.name || "").toLowerCase();
                    if (name.endsWith(".png")) mimeType = "image/png";
                    else if (name.endsWith(".webp")) mimeType = "image/webp";
                    else mimeType = "image/jpeg";
                }

                const [hostedUrl, preview] = await Promise.all([
                    saveImageReliably(buffer, mimeType),
                    makeBlurPreview(buffer),
                ]);
                return hostedUrl ? { url: hostedUrl, preview } : null;
            } catch (err) {
                console.error("Failed to process shared image:", err);
                return null;
            }
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
