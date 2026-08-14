// The deployed Spendly instance the widget talks to. Overridable from the
// app's Advanced section (useful for pointing at a LAN dev server).
export const DEFAULT_BASE_URL = "https://spendly-main-v2-1.vercel.app";

export const WIDGET_NAME = "SpendlySummary";

export type MetricKey = "today" | "month" | "balance";

export const ALL_METRICS: { key: MetricKey; label: string }[] = [
    { key: "today", label: "Today's spend" },
    { key: "month", label: "This month's spend" },
    { key: "balance", label: "Total balance" },
];

export type WidgetSummary = {
    currency: string;
    todayExpenses: number;
    todayIncome: number;
    monthExpenses: number;
    monthIncome: number;
    totalBalance: number;
    accounts: { name: string; balance: number }[];
    asOf: string;
};
