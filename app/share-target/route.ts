import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";

import { db } from "@/db/drizzle";
import { sharedStash, TransactionImage } from "@/db/schema";

export const runtime = "nodejs";

// Android PWA Web Share Target endpoint.
//
// Cross-app share launches are top-level POST navigations. Browsers deliberately
// withhold SameSite-Lax session cookies on cross-app POSTs, so this endpoint
// is intentionally UNAUTHENTICATED.
//
// To ensure the PWA opens instantly and displays the AI animation without
// freezing or timing out in the Android share sheet, this route processes the
// image locally into an optimized buffer + blur preview in <25ms, stages it
// in `sharedStash`, and immediately issues an HTTP 303 redirect to `/share?token=${token}`.
// The actual ImgBB upload and Groq AI vision extraction run while the user watches
// the animation on the `/share` screen.

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGES = 10;

const getPublicUrl = (req: NextRequest, path: string): URL => {
    const proto = req.headers.get("x-forwarded-proto") || (req.url.startsWith("https") ? "https" : "http");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
    const isProd = process.env.NODE_ENV === "production" || !host.includes("localhost");
    const finalProto = isProd ? "https" : proto;
    return new URL(path, `${finalProto}://${host}`);
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
    try {
        const contentType = req.headers.get("content-type") || "";
        let form: FormData;

        if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            form = await req.formData();
        } else {
            console.warn("[share-target] Unexpected content-type:", contentType);
            return NextResponse.redirect(getPublicUrl(req, "/transactions"), 303);
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
            const isGenericBinary = type === "application/octet-stream" || !type;
            return (isImageMime || isImageExt || isGenericBinary) && f.size > 0 && f.size <= MAX_IMAGE_BYTES;
        }).slice(0, MAX_IMAGES);

        console.log(`[share-target] Received share: textLen=${fullText.length}, files=${candidateFiles.length}`);

        if (!fullText && candidateFiles.length === 0) {
            console.warn("[share-target] Empty share payload, redirecting to /transactions");
            return NextResponse.redirect(getPublicUrl(req, "/transactions"), 303);
        }

        // Locally optimize each image into a fast data URL and blur preview
        // This is done 100% in-memory (<20ms) so Android redirects instantly without freezing
        const stagedImages = await Promise.all(
            candidateFiles.map(async (file): Promise<TransactionImage | null> => {
                try {
                    const arrayBuf = await file.arrayBuffer();
                    const buffer = Buffer.from(arrayBuf);
                    if (!buffer || buffer.length === 0) return null;

                    const optimized = await sharp(buffer)
                        .rotate()
                        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const preview = await makeBlurPreview(optimized);
                    const dataUrl = `data:image/jpeg;base64,${optimized.toString("base64")}`;

                    return { url: dataUrl, preview };
                } catch (err) {
                    console.error("[share-target] Failed to locally process image file:", err);
                    return null;
                }
            }),
        );

        const imageUrls = stagedImages.filter((img): img is TransactionImage => img !== null);

        const token = createId();
        await db.insert(sharedStash).values({
            id: token,
            rawText: fullText || null,
            imageUrls: imageUrls.length > 0 ? imageUrls : null,
        });

        console.log(`[share-target] Stashed share with token: ${token}, images: ${imageUrls.length}. Redirecting to /share`);
        return NextResponse.redirect(getPublicUrl(req, `/share?token=${token}`), 303);
    } catch (e) {
        console.error("[share-target] Top-level handler error:", e);
        return NextResponse.redirect(getPublicUrl(req, "/transactions"), 303);
    }
}
