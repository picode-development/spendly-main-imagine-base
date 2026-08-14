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
): Promise<WidgetTransaction[] | null> => {
    const t = withTimeout(timeoutMs);
    try {
        const extras = new URLSearchParams();
        if (config?.direction && config.direction !== "all") extras.set("direction", config.direction);
        if (config?.sort === "amount") extras.set("sort", "amount");
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
