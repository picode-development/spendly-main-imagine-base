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
        return data?.success ? (data.data.url as string) : null;
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
    // Genuine share launches are OS-initiated ("none") or same-origin; a
    // malicious webpage's POST is browser-labelled "cross-site" and can't
    // fake this header. Blocks CSRF-style stash planting and drive-by spam.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const text = [form.get("title"), form.get("text"), form.get("url")]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ")
        .trim()
        .slice(0, 2000);
    const image = form
        .getAll("media")
        .find((f): f is File =>
            f instanceof File && f.type.startsWith("image/") && f.size <= MAX_IMAGE_BYTES);

    if (!image && !text) {
        return NextResponse.redirect(new URL("/transactions", req.url), 303);
    }

    let imageUrls: TransactionImage[] | null = null;
    if (image) {
        const buffer = Buffer.from(await image.arrayBuffer());
        const [hostedUrl, preview] = await Promise.all([
            uploadToImgBB(buffer),
            makeBlurPreview(buffer),
        ]);
        if (hostedUrl) imageUrls = [{ url: hostedUrl, preview }];
    }

    const token = createId();
    await db.insert(sharedStash).values({
        id: token,
        rawText: text || null,
        imageUrls,
    });

    return NextResponse.redirect(new URL(`/share-claim?token=${token}`, req.url), 303);
}
