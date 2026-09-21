import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createId } from "@paralleldrive/cuid2";

import { db } from "@/db/drizzle";
import { sharedStash, TransactionImage } from "@/db/schema";

export const runtime = "nodejs";

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

export async function GET(req: NextRequest) {
    // If opened via GET directly, forward to /share or /transactions
    return NextResponse.redirect(getPublicUrl(req, "/share"), 303);
}

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";
        let form: FormData;

        if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            form = await req.formData();
        } else {
            console.warn("[share-target] Unexpected content-type:", contentType);
            return NextResponse.redirect(getPublicUrl(req, "/share?error=invalid_content_type"), 303);
        }

        const textParts: string[] = [];
        const rawFiles: (File | Blob)[] = [];

        // 1. Collect from all form entries
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

                if (isLikelyTextKey || (!lowerKey.includes("file") && !lowerKey.includes("image") && !lowerKey.includes("media") && trimmed.length > 5)) {
                    if (!textParts.includes(trimmed)) {
                        textParts.push(trimmed);
                    }
                }
            } else if (value && typeof value === "object") {
                rawFiles.push(value as any);
            }
        }

        // 2. Explicitly query all known manifest field names (across all Android PWA revisions)
        for (const fieldName of ["file", "media", "image", "images", "files", "attachment", "receipt"]) {
            const items = form.getAll(fieldName);
            for (const item of items) {
                if (item && typeof item === "object" && !rawFiles.includes(item as any)) {
                    rawFiles.push(item as any);
                }
            }
        }

        const fullText = textParts.join(" ").slice(0, 2000).trim();

        // Filter candidate image files
        const candidateFiles = rawFiles.filter((f: any) => {
            if (!f) return false;
            const name = (f.name || "").toLowerCase();
            const type = (f.type || "").toLowerCase();
            const isImageMime = type.startsWith("image/");
            const isImageExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name);
            const isGeneric = type === "application/octet-stream" || !type;
            const hasValidSize = f.size === undefined || (f.size > 0 && f.size <= MAX_IMAGE_BYTES);
            return (isImageMime || isImageExt || isGeneric || typeof f.arrayBuffer === "function") && hasValidSize;
        }).slice(0, MAX_IMAGES);

        console.log(`[share-target] Received share payload: textLen=${fullText.length}, files=${candidateFiles.length}`);

        if (!fullText && candidateFiles.length === 0) {
            console.warn("[share-target] Empty share payload received (likely Android WebAPK dropped files). Redirecting to /share with prompt_picker.");
            return NextResponse.redirect(getPublicUrl(req, "/share?prompt_picker=true&from=share_target"), 303);
        }

        // Process images into data URLs.
        // We ALWAYS generate a raw base64 data URL so that if Sharp encounters any runtime
        // issues in Vercel Serverless environment, image processing NEVER fails.
        const stagedImages = await Promise.all(
            candidateFiles.map(async (file: any): Promise<TransactionImage | null> => {
                try {
                    const arrayBuf = typeof file.arrayBuffer === "function"
                        ? await file.arrayBuffer()
                        : (typeof file.stream === "function"
                            ? await new Response(file.stream()).arrayBuffer()
                            : null);

                    if (!arrayBuf) return null;
                    const buffer = Buffer.from(arrayBuf);
                    if (!buffer || buffer.length === 0) return null;

                    const mime = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
                    let dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
                    let preview: string | undefined;

                    try {
                        const optimized = await sharp(buffer)
                            .rotate()
                            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                            .jpeg({ quality: 80 })
                            .toBuffer();
                        dataUrl = `data:image/jpeg;base64,${optimized.toString("base64")}`;
                        preview = await makeBlurPreview(optimized);
                    } catch (sharpErr) {
                        console.warn("[share-target] Sharp optimization bypassed, using raw buffer:", sharpErr);
                    }

                    return { url: dataUrl, preview };
                } catch (err) {
                    console.error("[share-target] Failed to process image file:", err);
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

        console.log(`[share-target] Successfully stashed share with token: ${token}, images: ${imageUrls.length}. Redirecting to /share?token=${token}`);
        return NextResponse.redirect(getPublicUrl(req, `/share?token=${token}`), 303);
    } catch (e: any) {
        console.error("[share-target] Top-level handler error:", e);
        const errorMsg = encodeURIComponent(e?.message || "server_share_error");
        return NextResponse.redirect(getPublicUrl(req, `/share?error=${errorMsg}`), 303);
    }
}
