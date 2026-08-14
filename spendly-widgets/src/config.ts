// The deployed Spendly instance the widget talks to. Overridable from the
// app's Advanced section (useful for pointing at a LAN dev server).
export const DEFAULT_BASE_URL = "https://spendly-main-v2-1.vercel.app";

export const WIDGET_NAME = "SpendlySummary";

// Every widget the app ships — pairing/refresh pushes fresh data to all
export const ALL_WIDGET_NAMES = [
    "SpendlySummary",
    "SpendlyActions",
    "SpendlyChart",
    "SpendlyTransactions",
] as const;
export type WidgetName = (typeof ALL_WIDGET_NAMES)[number];

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
    /** Last 7 days (oldest first), zero-filled */
    days: { date: string; expenses: number }[];
    /** This month's top spending categories + "Other" */
    topCategories: { name: string; value: number }[];
    asOf: string;
};

export type WidgetTransaction = {
    id: string;
    payee: string;
    amount: number;
    date: string;
    category: string | null;
    account: string;
};
