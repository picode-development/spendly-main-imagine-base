import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";

import { db } from "@/db/drizzle";
import { sharedStash, TransactionImage } from "@/db/schema";

// Android PWA Web Share Target endpoint.
//
// Cross-app share launches are top-level POST navigations. Browsers deliberately
// withhold SameSite-Lax session cookies on cross-app POSTs, so this endpoint
// is intentionally UNAUTHENTICATED.
//
// It captures all incoming files and text, persists the full-quality receipt
// images directly to ImgBB (each image as an independent query), stages the payload
// in `sharedStash` under a one-time token, and issues an HTTP 303 (See Other)
// redirect to `/share?token=${token}` (a GET navigation, where authentication
// cookies flow naturally).

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 10;


const uploadToImgBB = async (buffer: Buffer, fileName?: string): Promise<string | null> => {
    const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY || process.env.IMGBB_API_KEY;
    if (!apiKey) {
        console.warn("[share-target] Missing ImgBB API key");
        return null;
    }
    try {
        const form = new FormData();
        form.append("key", apiKey);
        form.append("image", buffer.toString("base64"));
        if (fileName) {
            form.append("name", fileName);
        }
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: form,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        const data = await res.json().catch(() => null);
        if (data?.success && (data.data?.display_url || data.data?.url)) {
            return (data.data.display_url || data.data.url) as string;
        }
        console.warn("[share-target] ImgBB upload failed:", data?.error?.message || data?.error || data);
        return null;
    } catch (e) {
        console.warn("[share-target] ImgBB upload network error:", e);
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

const saveImage = async (buffer: Buffer, fileName?: string): Promise<string | null> => {
    // Upload image to ImgBB only (no database fallback)
    return await uploadToImgBB(buffer, fileName);
};

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";
        let form: FormData;

        if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            form = await req.formData();
        } else {
            console.warn("[share-target] Unexpected content-type:", contentType);
            return NextResponse.redirect(new URL("/transactions", req.url), 303);
        }

        const textParts: string[] = [];
        const rawFiles: File[] = [];

        for (const [key, value] of form.entries()) {
            if (typeof value === "string") {
                const trimmed = value.trim();
                if (!trimmed) continue;
                const lowerKey = key.toLowerCase();
                const isLikelyTextKey =
                    lowerKey.includes("text") ||
                    lowerKey.includes("title") ||
                    lowerKey.includes("url") ||
                    lowerKey.includes("body") ||
                    lowerKey.includes("caption") ||
                    lowerKey.includes("message") ||
                    lowerKey.includes("note") ||
                    lowerKey.includes("description") ||
                    lowerKey.includes("subject");

                if (isLikelyTextKey || (!lowerKey.includes("file") && !lowerKey.includes("image") && trimmed.length > 5)) {
                    if (!textParts.includes(trimmed)) {
                        textParts.push(trimmed);
                    }
                }
            } else if (value && typeof value === "object" && typeof (value as File).arrayBuffer === "function") {
                rawFiles.push(value as File);
            }
        }

        const fullText = textParts.join(" ").slice(0, 2000).trim();

        // Process image files
        const candidateFiles = rawFiles.filter((f) => {
            const name = (f.name || "").toLowerCase();
            const type = (f.type || "").toLowerCase();
            const isImageMime = type.startsWith("image/");
            const isImageExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name);
            return (isImageMime || isImageExt || (f.size > 0 && !type)) && f.size <= MAX_IMAGE_BYTES;
        }).slice(0, MAX_IMAGES);

        console.log(`[share-target] Received share: textLen=${fullText.length}, files=${candidateFiles.length}`);

        if (!fullText && candidateFiles.length === 0) {
            console.warn("[share-target] Empty share payload, redirecting to /transactions");
            return NextResponse.redirect(new URL("/transactions", req.url), 303);
        }

        const uploadedImages = await Promise.all(
            candidateFiles.map(async (file, index): Promise<TransactionImage | null> => {
                try {
                    const arrayBuf = await file.arrayBuffer();
                    const buffer = Buffer.from(arrayBuf);
                    if (!buffer || buffer.length === 0) return null;

                    // Each new image is dispatched as a separate, distinct query to ImgBB
                    const uniqueImageId = createId();
                    const fileName = `receipt_${uniqueImageId}_${index}`;

                    const [hostedUrl, preview] = await Promise.all([
                        saveImage(buffer, fileName),
                        makeBlurPreview(buffer),
                    ]);

                    return hostedUrl ? { url: hostedUrl, preview } : null;
                } catch (err) {
                    console.error("[share-target] Failed to process image file:", err);
                    return null;
                }
            }),
        );

        const imageUrls = uploadedImages.filter((img): img is TransactionImage => img !== null);

        const token = createId();
        await db.insert(sharedStash).values({
            id: token,
            rawText: fullText || null,
            imageUrls: imageUrls.length > 0 ? imageUrls : null,
        });

        console.log(`[share-target] Successfully stashed share with token: ${token}, imageUrls: ${imageUrls.length}`);
        return NextResponse.redirect(new URL(`/share?token=${token}`, req.url), 303);
    } catch (e) {
        console.error("[share-target] Top-level handler error:", e);
        return NextResponse.redirect(new URL("/transactions", req.url), 303);
    }
}
