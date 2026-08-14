import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_BASE_URL, MetricKey, WidgetSummary, WidgetTransaction } from "./config";

const KEYS = {
    token: "spendly.token",
    baseUrl: "spendly.baseUrl",
    metrics: "spendly.metrics",
    summary: "spendly.summary",
    transactions: "spendly.transactions",
} as const;

export const getToken = () => AsyncStorage.getItem(KEYS.token);
export const setToken = (token: string) => AsyncStorage.setItem(KEYS.token, token);
export const clearToken = () => AsyncStorage.removeItem(KEYS.token);

export const getBaseUrl = async () =>
    (await AsyncStorage.getItem(KEYS.baseUrl)) ?? DEFAULT_BASE_URL;
export const setBaseUrl = (url: string) =>
    AsyncStorage.setItem(KEYS.baseUrl, url.replace(/\/+$/, ""));

export const getMetrics = async (): Promise<MetricKey[]> => {
    const raw = await AsyncStorage.getItem(KEYS.metrics);
    if (!raw) return ["today", "month", "balance"];
    try {
        const parsed = JSON.parse(raw) as MetricKey[];
        return parsed.length > 0 ? parsed : ["today"];
    } catch {
        return ["today", "month", "balance"];
    }
};
export const setMetrics = (metrics: MetricKey[]) =>
    AsyncStorage.setItem(KEYS.metrics, JSON.stringify(metrics));

// Last good summary — the widget renders this when the network is down
export const getCachedSummary = async (): Promise<WidgetSummary | null> => {
    const raw = await AsyncStorage.getItem(KEYS.summary);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as WidgetSummary;
    } catch {
        return null;
    }
};
export const setCachedSummary = (summary: WidgetSummary) =>
    AsyncStorage.setItem(KEYS.summary, JSON.stringify(summary));

export const getCachedTransactions = async (): Promise<WidgetTransaction[] | null> => {
    const raw = await AsyncStorage.getItem(KEYS.transactions);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as WidgetTransaction[];
    } catch {
        return null;
    }
};
export const setCachedTransactions = (rows: WidgetTransaction[]) =>
    AsyncStorage.setItem(KEYS.transactions, JSON.stringify(rows));

export const clearAll = () =>
    AsyncStorage.multiRemove([KEYS.token, KEYS.metrics, KEYS.summary, KEYS.transactions]);
