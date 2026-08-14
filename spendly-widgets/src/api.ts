import { WidgetSummary } from "./config";

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
        return { ok: true as const, accounts: data.accounts as { id: string; name: string }[] };
    } catch {
        return { ok: false as const, error: "Couldn't reach Spendly — check your connection" };
    } finally {
        t.done();
    }
};

export const fetchSummary = async (
    baseUrl: string,
    token: string,
    timeoutMs = 10_000,
): Promise<WidgetSummary | null> => {
    const t = withTimeout(timeoutMs);
    try {
        const tzOffset = -new Date().getTimezoneOffset();
        const res = await fetch(
            `${baseUrl}/api/widget/summary?token=${encodeURIComponent(token)}&tzOffset=${tzOffset}`,
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
