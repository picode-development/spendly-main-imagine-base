import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import sharp from "sharp";

import { db } from "@/db/drizzle";
import { pendingTransactions, TransactionImage } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";
import { llmExtractFromImage } from "@/lib/groq";
import { parseMessage, getLlmContext } from "@/lib/parse-message";

// Android PWA share target (see app/manifest.ts). Receives shared text or a
// payment screenshot; screenshots are auto-attached as the receipt image and
// read by the vision model.

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
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.redirect(new URL("/sign-in", req.url), 303);
    }

    const form = await req.formData();
    const text = [form.get("title"), form.get("text"), form.get("url")]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .join(" ")
        .trim();
    const image = form
        .getAll("media")
        .find((f): f is File => f instanceof File && f.type.startsWith("image/"));

    if (!image && !text) {
        return NextResponse.redirect(new URL("/transactions", req.url), 303);
    }

    if (image) {
        const buffer = Buffer.from(await image.arrayBuffer());
        const dataUrl = `data:${image.type};base64,${buffer.toString("base64")}`;

        // Host the screenshot, build its blur-up preview, and read it — in parallel
        const [hostedUrl, preview, extracted] = await Promise.all([
            uploadToImgBB(buffer),
            makeBlurPreview(buffer),
            getLlmContext(userId).then((ctx) => llmExtractFromImage(dataUrl, ctx)),
        ]);

        const imageUrls: TransactionImage[] | null = hostedUrl
            ? [{ url: hostedUrl, preview }]
            : null;

        await db.insert(pendingTransactions).values({
            id: createId(),
            userId,
            rawMessage: text || "Shared screenshot",
            amount: extracted?.isTransaction ? extracted.amount : null,
            payee: extracted?.payee ?? null,
            accountHint: extracted?.accountName ?? extracted?.accountHint ?? null,
            categoryHint: extracted?.categoryName ?? null,
            imageUrls,
            date: extracted?.date ?? new Date(),
        });
    } else {
        // Text only — stored even when parsing is incomplete: sharing was explicit
        const parsed = await parseMessage(userId, text);
        await db.insert(pendingTransactions).values({
            id: createId(),
            userId,
            rawMessage: text,
            ...(parsed ?? { date: new Date() }),
        });
    }

    return NextResponse.redirect(new URL("/transactions", req.url), 303);
}
