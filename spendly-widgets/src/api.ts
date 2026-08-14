import { File, UploadType } from "expo-file-system";
import { WidgetInstanceConfig, WidgetSummary, WidgetTransaction } from "./config";

// Translate an instance config into summary query params. "month" is
// resolved client-side so the server stays stateless about presets.
export const configToParams = (config: WidgetInstanceConfig | null): string => {
    const params = new URLSearchParams();
    if (!config) return "";
    if (config.accountId) params.set("accountId", config.accountId);
    if (config.categoryId) params.set("categoryId", config.categoryId);
    if (config.scope === "all") params.set("allDates", "true");
    if (config.scope === "custom" && config.from && config.to) {
        params.set("from", config.from);
        params.set("to", config.to);
    }
    if (config.scope === "month") {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        params.set("from", `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
        params.set("to", `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    }
    const qs = params.toString();
    return qs ? `&${qs}` : "";
};

const withTimeout = (ms: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, done: () => clearTimeout(timer) };
};

export const pair = async (baseUrl: string, code: string) => {
    const t = withTimeout(15_000);
    try {
        const res = await fetch(`${baseUrl}/api/widget/pair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
            signal: t.signal,
        });
        if (res.status === 401) return { ok: false as const, error: "Invalid pairing code" };
        if (!res.ok) return { ok: false as const, error: `Server error (${res.status})` };
        const { data } = await res.json();
        return {
            ok: true as const,
            accounts: data.accounts as { id: string; name: string }[],
            categories: (data.categories ?? []) as { id: string; name: string }[],
        };
    } catch {
        return { ok: false as const, error: "Couldn't reach Spendly — check your connection" };
    } finally {
        t.done();
    }
};

/**
 * Whether `token` is still recognized by the server — specifically, that
 * the widget was unpaired/its token deleted, not "the network is flaky."
 * `fetchSummary`/`fetchTransactions` collapse every failure (401, network
 * error, timeout, 5xx) into `null` for their many callers that just want
 * "couldn't load, show nothing" — this is the one place that needs to tell
 * a dead token apart from a transient failure, so it does its own request.
 * Only a definitive 401 reports `false`; anything else (including no
 * connection at all) reports `true` so the app never force-logs-out a user
 * who's just offline.
 */
export const isTokenValid = async (baseUrl: string, token: string): Promise<boolean> => {
    const t = withTimeout(8_000);
    try {
        const res = await fetch(
            `${baseUrl}/api/widget/summary?token=${encodeURIComponent(token)}`,
            { signal: t.signal },
        );
        return res.status !== 401;
    } catch {
        return true;
    } finally {
        t.done();
    }
};

export type VoiceResult = {
    transcript: string;
    pendingId: string;
    parsed: {
        amount: number | null;
        payee: string | null;
        accountName: string | null;
        categoryName: string | null;
        note: string | null;
        date: string | null;
    } | null;
};

// Uploads a widget-popup recording; the server transcribes, extracts, and
// stages a pending transaction the user reviews in Spendly.
//
// Uses expo-file-system's native File.upload() rather than fetch()+FormData
// with a raw { uri, name, type } part — RN's Blob-casting of local file://
// URIs (especially from the cache dir expo-audio records into) is known to
// throw "Network request failed" before any request reaches the network,
// which is indistinguishable from a real connectivity failure to the caller.
export const uploadVoice = async (
    baseUrl: string,
    token: string,
    fileUri: string,
): Promise<{ ok: true; data: VoiceResult } | { ok: false; error: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
        const file = new File(fileUri);
        const result = await file.upload(
            `${baseUrl}/api/widget/voice?token=${encodeURIComponent(token)}`,
            {
                uploadType: UploadType.MULTIPART,
                fieldName: "audio",
                mimeType: "audio/m4a",
                signal: controller.signal,
            },
        );
        const body = (() => {
            try { return JSON.parse(result.body); } catch { return null; }
        })();
        if (result.status < 200 || result.status >= 300) {
            return { ok: false, error: body?.error ?? `Server error (${result.status})` };
        }
        return { ok: true, data: body.data as VoiceResult };
    } catch {
        return { ok: false, error: "Couldn't reach Spendly — check your connection" };
    } finally {
        clearTimeout(timer);
    }
};

export const fetchSummary = async (
    baseUrl: string,
    token: string,
    config: WidgetInstanceConfig | null = null,
    timeoutMs = 10_000,
): Promise<WidgetSummary | null> => {
    const t = withTimeout(timeoutMs);
    try {
        const tzOffset = -new Date().getTimezoneOffset();
        const res = await fetch(
            `${baseUrl}/api/widget/summary?token=${encodeURIComponent(token)}&tzOffset=${tzOffset}${configToParams(config)}`,
            { signal: t.signal },
        );
        if (!res.ok) return null;
        const { data } = await res.json();
        return data as WidgetSummary;
    } catch {
        return null;
    } finally {
        t.done();
    }
};

export const fetchTransactions = async (
    baseUrl: string,
    token: string,
    config: WidgetInstanceConfig | null = null,
    limit = 10,
    timeoutMs = 10_000,
    q?: string,
): Promise<WidgetTransaction[] | null> => {
    const t = withTimeout(timeoutMs);
    try {
        const extras = new URLSearchParams();
        if (config?.direction && config.direction !== "all") extras.set("direction", config.direction);
        if (config?.sort === "amount") extras.set("sort", "amount");
        if (q) extras.set("q", q);
        // Default scope for the transactions list is the last 7 days
        if (!config || config.scope === "week") {
            const pad = (n: number) => String(n).padStart(2, "0");
            const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const now = new Date();
            extras.set("from", iso(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)));
            extras.set("to", iso(now));
        }
        const extraQs = extras.toString() ? `&${extras.toString()}` : "";
        const res = await fetch(
            `${baseUrl}/api/widget/transactions?token=${encodeURIComponent(token)}&limit=${limit}${configToParams(config)}${extraQs}`,
            { signal: t.signal },
        );
        if (!res.ok) return null;
        const { data } = await res.json();
        return data as WidgetTransaction[];
    } catch {
        return null;
    } finally {
        t.done();
    }
};
