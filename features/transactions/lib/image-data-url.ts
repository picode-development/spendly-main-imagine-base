/**
 * Builds the AI's working copy of a screenshot as a data URL (client-side).
 * The stored receipt stays FULL quality — this copy exists so extraction can
 * start immediately from the local bytes instead of waiting for the hosted
 * upload.
 *
 * Accuracy first: 2048px / q0.92 keeps a phone screenshot essentially
 * native, so small text (UPI refs, dates) stays crisp for the vision model.
 * Only if the encoded copy would blow the request-size cap does it step down.
 */
const MAX_DATA_URL_CHARS = 3_400_000;

export async function toAiDataUrl(blob: Blob): Promise<string> {
    const bitmap = await createImageBitmap(blob);

    const attempts: { maxDim: number; quality: number }[] = [
        { maxDim: 2048, quality: 0.92 },
        { maxDim: 2048, quality: 0.8 },
        { maxDim: 1600, quality: 0.8 },
    ];

    let result: string | null = null;
    for (const { maxDim, quality } of attempts) {
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(bitmap, 0, 0, width, height);

        result = canvas.toDataURL("image/jpeg", quality);
        if (result.length <= MAX_DATA_URL_CHARS) break;
    }

    bitmap.close();
    if (!result) throw new Error("Encoding failed");
    return result;
}
