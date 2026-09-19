export type ShareImageCandidate = {
    name?: string;
    type?: string;
    data: Uint8Array;
    size?: number;
};

export type NormalizedSharePayload = {
    text: string;
    images: ShareImageCandidate[];
};

const isTextKey = (name: string) => {
    const n = name.toLowerCase();
    return (
        !n.includes("file") &&
        !n.includes("image") &&
        !n.includes("media") &&
        !n.includes("attachment") &&
        !n.includes("screenshot") &&
        !n.includes("photo") &&
        !n.includes("document") &&
        (n.includes("text") ||
            n.includes("message") ||
            n.includes("caption") ||
            n.includes("title") ||
            n.includes("body") ||
            n.includes("description") ||
            n.includes("content") ||
            n === "url")
    );
};

const isLikelyImageCandidate = (name: string, type: string, size: number) => {
    const lowerName = name.toLowerCase();
    const lowerType = type.toLowerCase();
    return (
        lowerType.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(lowerName) ||
        (size > 0 && !lowerType && !lowerName.includes("text"))
    );
};

const dedupeKey = (candidate: Pick<ShareImageCandidate, "name" | "type" | "size">) =>
    `${candidate.name ?? ""}:${candidate.type ?? ""}:${String(candidate.size ?? "")}`;

const collectText = (entries: Array<[string, FormDataEntryValue]>) => {
    const textParts: string[] = [];

    for (const [key, value] of entries) {
        if (typeof value !== "string") continue;

        const trimmed = value.trim();
        if (!trimmed) continue;

        const keyName = key.toLowerCase();
        const shouldUseAsText =
            isTextKey(keyName) ||
            (trimmed.length > 12 &&
                !keyName.includes("file") &&
                !keyName.includes("image") &&
                !keyName.includes("media") &&
                !keyName.includes("attachment") &&
                !keyName.includes("screenshot"));

        if (shouldUseAsText && !textParts.includes(trimmed)) {
            textParts.push(trimmed);
        }
    }

    return textParts.join(" ").slice(0, 2000);
};

export const normalizeSharePayload = async (
    entries: Iterable<[string, FormDataEntryValue]>,
    limitImages = 25,
): Promise<NormalizedSharePayload> => {
    const normalizedEntries = Array.from(entries);
    const text = collectText(normalizedEntries);
    const imageCandidates: ShareImageCandidate[] = [];

    for (const [key, value] of normalizedEntries) {
        if (!(value instanceof File)) continue;

        const name = value.name || "";
        const type = value.type || "";
        const size = value.size || 0;

        if (!isLikelyImageCandidate(name, type, size)) continue;

        const data = new Uint8Array(await value.arrayBuffer());
        const candidate = { name, type, size, data };
        const duplicate = imageCandidates.some((existing) => dedupeKey(existing) === dedupeKey(candidate));

        if (!duplicate) {
            imageCandidates.push(candidate);
        }
    }

    return {
        text,
        images: imageCandidates.slice(0, limitImages),
    };
};

export const normalizeShareFormData = async (
    formData: FormData,
    limitImages = 25,
): Promise<NormalizedSharePayload> => normalizeSharePayload(Array.from(formData.entries()), limitImages);
