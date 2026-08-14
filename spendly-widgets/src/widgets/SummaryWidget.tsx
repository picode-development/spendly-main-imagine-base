import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { DEFAULT_BASE_URL, MetricKey, WidgetSummary } from "../config";
import { formatINR, formatTime } from "../format";

const COLORS = {
    bg: "#0f172a",
    card: "#1e293b",
    label: "#94a3b8",
    value: "#f8fafc",
    accent: "#3b82f6",
    expense: "#f87171",
} as const;

type Props = {
    summary: WidgetSummary | null;
    metrics: MetricKey[];
    paired: boolean;
};

type HexColor = `#${string}`;

const Stat = ({ label, value, color }: { label: string; value: string; color?: HexColor }) => (
    <FlexWidget style={{ flexDirection: "column", flex: 1 }}>
        <TextWidget
            text={label}
            style={{ fontSize: 11, color: COLORS.label }}
        />
        <TextWidget
            text={value}
            style={{ fontSize: 20, fontWeight: "bold", color: color ?? COLORS.value }}
        />
    </FlexWidget>
);

export const SummaryWidget = ({ summary, metrics, paired }: Props) => {
    if (!paired) {
        return (
            <FlexWidget
                clickAction="OPEN_APP"
                style={{
                    height: "match_parent",
                    width: "match_parent",
                    backgroundColor: COLORS.bg,
                    borderRadius: 20,
                    padding: 16,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <TextWidget text="Spendly" style={{ fontSize: 14, fontWeight: "bold", color: COLORS.accent }} />
                <TextWidget
                    text="Tap to pair with your account"
                    style={{ fontSize: 12, color: COLORS.label, marginTop: 4 }}
                />
            </FlexWidget>
        );
    }

    const rows: { label: string; value: string; color?: HexColor }[] = [];
    if (summary) {
        if (metrics.includes("today")) {
            rows.push({ label: "Spent today", value: formatINR(summary.todayExpenses), color: COLORS.expense });
        }
        if (metrics.includes("month")) {
            rows.push({ label: "This month", value: formatINR(summary.monthExpenses), color: COLORS.expense });
        }
        if (metrics.includes("balance")) {
            rows.push({ label: "Balance", value: formatINR(summary.totalBalance) });
        }
    }

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: DEFAULT_BASE_URL }}
            style={{
                height: "match_parent",
                width: "match_parent",
                backgroundColor: COLORS.bg,
                borderRadius: 20,
                padding: 16,
                flexDirection: "column",
                justifyContent: "space-between",
            }}
        >
            <FlexWidget
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    width: "match_parent",
                }}
            >
                <TextWidget text="Spendly" style={{ fontSize: 13, fontWeight: "bold", color: COLORS.accent }} />
                <TextWidget
                    text={summary ? `as of ${formatTime(summary.asOf)}` : "offline"}
                    style={{ fontSize: 10, color: COLORS.label }}
                />
            </FlexWidget>

            {rows.length > 0 ? (
                <FlexWidget style={{ flexDirection: "row", width: "match_parent", marginTop: 8 }}>
                    {rows.map((row) => (
                        <Stat key={row.label} label={row.label} value={row.value} color={row.color} />
                    ))}
                </FlexWidget>
            ) : (
                <TextWidget
                    text="Open the app to refresh"
                    style={{ fontSize: 12, color: COLORS.label, marginTop: 8 }}
                />
            )}
        </FlexWidget>
    );
};
