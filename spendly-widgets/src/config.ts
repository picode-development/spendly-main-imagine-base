// The deployed Spendly instance the widget talks to. Overridable from the
// app's Advanced section (useful for pointing at a LAN dev server).
export const DEFAULT_BASE_URL = "https://spendly-main-v2-1.vercel.app";

export const WIDGET_NAME = "SpendlySummary";

// Every widget the app ships — pairing/refresh pushes fresh data to all
export const ALL_WIDGET_NAMES = [
    "SpendlySummary",
    "SpendlyActions",
    "SpendlyChart",
    "SpendlyCategories",
    "SpendlyTransactions",
] as const;
export type WidgetName = (typeof ALL_WIDGET_NAMES)[number];

// UI styles each widget can be switched between (per instance)
export const WIDGET_STYLES: Record<string, { key: string; label: string }[]> = {
    SpendlySummary: [
        { key: "cards", label: "Dashboard cards" },
        { key: "compact", label: "Compact row" },
    ],
    SpendlyChart: [
        { key: "bar", label: "Bar chart" },
        { key: "area", label: "Area chart" },
        { key: "line", label: "Line chart" },
    ],
    SpendlyCategories: [
        { key: "radial", label: "Radial rings" },
        { key: "donut", label: "Donut" },
        { key: "radar", label: "Radar" },
        { key: "bars", label: "Ranked bars" },
    ],
    SpendlyTransactions: [
        { key: "detailed", label: "Detailed rows" },
        { key: "compact", label: "Compact rows" },
    ],
};

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
    /** Daily series over the scope window (oldest first), zero-filled */
    days: { date: string; expenses: number; income: number }[];
    /** This month's top spending categories + "Other" */
    topCategories: { name: string; value: number }[];
    /** Totals for the instance's scope window */
    scoped?: {
        label: string;
        expenses: number;
        income: number;
        remaining?: number;
        expensesChange?: number;
        incomeChange?: number;
        remainingChange?: number;
    };
    /** Set when the instance is filtered to one account */
    accountName?: string | null;
    asOf: string;
};

// Per-widget-instance settings, chosen in the Android widget config screen.
// scope: week = last 7 days (default), month = this month so far,
// all = all time, custom = from/to (same date = a single day).
// direction/sort apply to the Transactions widget only.
export type WidgetInstanceConfig = {
    scope: "week" | "month" | "all" | "custom";
    from?: string;
    to?: string;
    accountId?: string;
    accountName?: string;
    categoryId?: string;
    categoryName?: string;
    direction?: "all" | "income" | "expense";
    sort?: "date" | "amount";
    /** UI style key from WIDGET_STYLES for this widget type */
    style?: string;
    /** Card background: site gradient, soft-blur gradient, translucent gradient, or glass */
    background?: "gradient" | "blurGradient" | "translucentGradient" | "glass";
};

export const BACKGROUND_OPTIONS = [
    { value: "gradient", label: "Spendly gradient" },
    { value: "blurGradient", label: "Blurred gradient" },
    { value: "translucentGradient", label: "Translucent gradient" },
    { value: "glass", label: "Translucent glass" },
] as const;

export const DEFAULT_INSTANCE_CONFIG: WidgetInstanceConfig = { scope: "week" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// "12 Aug – 14 Aug · My Money · Food" — the header line widgets show so the
// user can tell configured instances apart at a glance
export const configLabel = (config: WidgetInstanceConfig | null): string => {
    if (!config) return "Last 7 days";
    const scope = config.scope === "all"
        ? "All time"
        : config.scope === "month"
            ? "This month"
            : config.scope === "custom" && config.from && config.to
                ? config.from === config.to
                    ? fmtDay(config.from)
                    : `${fmtDay(config.from)} – ${fmtDay(config.to)}`
                : "Last 7 days";
    return [
        scope,
        config.accountName?.trim(),
        config.categoryName?.trim(),
        config.direction === "income" ? "Income" : config.direction === "expense" ? "Expenses" : undefined,
    ].filter(Boolean).join(" · ");
};

export type WidgetTransaction = {
    id: string;
    payee: string;
    amount: number;
    date: string;
    category: string | null;
    account: string;
};
