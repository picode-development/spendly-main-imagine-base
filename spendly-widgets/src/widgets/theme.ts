export const WIDGET_COLORS = {
    bg: "#0f172a",
    card: "#1e293b",
    border: "#334155",
    label: "#94a3b8",
    value: "#f8fafc",
    accent: "#3b82f6",
    accentSoft: "#1d4ed8",
    expense: "#f87171",
    income: "#4ade80",
    gold: "#e3b27a",
} as const;

export type HexColor = `#${string}`;
