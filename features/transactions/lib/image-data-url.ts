/**
 * Builds the AI's working copy of a screenshot as a data URL (client-side).
 * The stored receipt stays FULL quality — this copy exists so extraction can
 * start immediately from the local bytes instead of waiting for the hosted
 * upload.
 *
 * Sizing is a token budget call: vision tokens scale with resolution, and
 * the free tier allows only 8000/minute — a 2048px copy costs ~5000 tokens
 * (1.5 images/min) while 1280px costs ~1500 (several per minute). Payment
 * screenshots render amounts/names in large type, so 1280px keeps reading
 * accuracy while making batches actually flow.
 */
const MAX_DATA_URL_CHARS = 3_400_000;

async function getImageSource(blob: Blob): Promise<{
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
    close: () => void;
}> {
    try {
        const bitmap = await createImageBitmap(blob);
        return {
            width: bitmap.width,
            height: bitmap.height,
            draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
            close: () => bitmap.close(),
        };
    } catch {
        // Fallback for Android WebView / browsers where createImageBitmap fails on content streams
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
                    close: () => URL.revokeObjectURL(objectUrl),
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Image decoding failed"));
            };
            img.src = objectUrl;
        });
    }
}

export async function toAiDataUrl(blob: Blob): Promise<string> {
    const normalizedBlob = blob.type && blob.type.startsWith("image/")
        ? blob
        : new Blob([blob], { type: "image/jpeg" });

    const source = await getImageSource(normalizedBlob);

    const attempts: { maxDim: number; quality: number }[] = [
        { maxDim: 1280, quality: 0.85 },
        { maxDim: 1024, quality: 0.8 },
    ];

    let result: string | null = null;
    for (const { maxDim, quality } of attempts) {
        const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        source.draw(ctx, width, height);

        result = canvas.toDataURL("image/jpeg", quality);
        if (result.length <= MAX_DATA_URL_CHARS) break;
    }

    source.close();
    if (!result) throw new Error("Encoding failed");
    return result;
}
