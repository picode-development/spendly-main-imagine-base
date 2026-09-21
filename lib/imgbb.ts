export const uploadToImgBB = async (
    imageInput: Buffer | string,
    fileName?: string,
): Promise<string | null> => {
    const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY || process.env.IMGBB_API_KEY;
    if (!apiKey) {
        console.warn("[imgbb] Missing ImgBB API key");
        return null;
    }

    try {
        let base64String: string;
        if (typeof imageInput === "string") {
            base64String = imageInput.includes("base64,")
                ? imageInput.split("base64,")[1]
                : imageInput;
        } else {
            base64String = imageInput.toString("base64");
        }

        const form = new FormData();
        form.append("key", apiKey);
        form.append("image", base64String);
        if (fileName) {
            form.append("name", fileName);
        }

        // Each upload is sent as a distinct, independent query to ImgBB
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
        console.warn("[imgbb] Upload returned unsuccessful:", data?.error?.message || data?.error || data);
        return null;
    } catch (e) {
        console.warn("[imgbb] Upload network exception:", e);
        return null;
    }
};
