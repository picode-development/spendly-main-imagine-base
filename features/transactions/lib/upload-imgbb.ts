export type UploadProgress = {
    loaded: number;
    total: number;
    percent: number;          // 0–100, held at 99 until the response lands
    speedBps: number | null;  // EMA-smoothed bytes/sec, null until first sample
    etaSeconds: number | null;
};

export function uploadImageWithProgress(
    file: File,
    onProgress: (p: UploadProgress) => void,
): { promise: Promise<string>; abort: () => void } {
    const xhr = new XMLHttpRequest();

    const promise = new Promise<string>((resolve, reject) => {
        const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
        if (!apiKey) {
            reject(new Error("Image upload isn't configured. Contact support."));
            return;
        }

        let lastLoaded = 0;
        let lastTime = performance.now();
        let smoothedBps: number | null = null;

        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const now = performance.now();
            const elapsedMs = now - lastTime;
            // Skip too-frequent samples: noisy speed division + UI churn
            if (elapsedMs >= 80 || e.loaded === e.total) {
                const instantBps = ((e.loaded - lastLoaded) / elapsedMs) * 1000;
                if (elapsedMs > 0 && instantBps >= 0) {
                    smoothedBps = smoothedBps === null
                        ? instantBps
                        : 0.3 * instantBps + 0.7 * smoothedBps;
                }
                lastLoaded = e.loaded;
                lastTime = now;
                onProgress({
                    loaded: e.loaded,
                    total: e.total,
                    percent: Math.min(99, Math.round((e.loaded / e.total) * 100)),
                    speedBps: smoothedBps,
                    etaSeconds: smoothedBps && smoothedBps > 0
                        ? (e.total - e.loaded) / smoothedBps
                        : null,
                });
            }
        };

        xhr.onload = () => {
            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                    resolve(data.data.url as string);
                } else {
                    reject(new Error(data.error?.message || "ImgBB upload failed"));
                }
            } catch {
                reject(new Error("ImgBB upload failed"));
            }
        };
        xhr.onerror = () => reject(new Error("Image upload failed. Please try again."));
        xhr.ontimeout = () => reject(new Error("Image upload timed out. Please try again."));
        xhr.onabort = () => {
            const error = new Error("Upload cancelled");
            error.name = "AbortError";
            reject(error);
        };

        const formData = new FormData();
        formData.append("image", file);
        xhr.open("POST", `https://api.imgbb.com/1/upload?key=${apiKey}`);
        xhr.send(formData);
    });

    return { promise, abort: () => xhr.abort() };
}

// Tiny blurred placeholder (WhatsApp-style blur-up): downscale to ~32px and
// inline as a ~1KB JPEG data URL, stored alongside the full-resolution URL.
export const makeImagePreview = (file: File, maxDim = 32): Promise<string> =>
    new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const ratio = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
                const w = Math.max(1, Math.round(img.naturalWidth * ratio));
                const h = Math.max(1, Math.round(img.naturalHeight * ratio));
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Canvas unavailable");
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", 0.6));
            } catch (e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Couldn't read image for preview"));
        };
        img.src = objectUrl;
    });

export const formatSpeed = (bps: number): string => {
    if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`;
    return `${Math.round(bps)} B/s`;
};

export const formatEta = (seconds: number): string => {
    const s = Math.ceil(seconds);
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s left`;
    return `${s}s left`;
};
