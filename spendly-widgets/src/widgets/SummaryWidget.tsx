import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { configLabel, DEFAULT_BASE_URL, MetricKey, WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR, formatTime } from "../format";
import { lucideSvg, LucideIconName } from "./icons";
import { HexColor, WIDGET_COLORS as COLORS } from "./theme";

type Props = {
    summary: WidgetSummary | null;
    metrics: MetricKey[];
    paired: boolean;
    config?: WidgetInstanceConfig | null;
};

// A configured instance shows its scoped view instead of the metric toggles
const isScopedConfig = (config?: WidgetInstanceConfig | null) =>
    !!config && (config.scope !== "week" || !!config.accountId || !!config.categoryId);

const changeText = (change?: number) => {
    if (change == null || change === 0) return "±0% from last period";
    return `${change > 0 ? "+" : ""}${Math.round(change)}% from last period`;
};

// The dashboard's DataCard, in widget form: tinted icon tile, title,
// amount, % change vs the previous period.
const DataCard = ({
    icon,
    tint,
    title,
    value,
    change,
    goodWhenUp,
}: {
    icon: LucideIconName;
    tint: HexColor;
    title: string;
    value: string;
    change?: number;
    goodWhenUp: boolean;
}) => {
    const changeGood = (change ?? 0) === 0 ? null : ((change ?? 0) > 0) === goodWhenUp;
    return (
        <FlexWidget
            style={{
                flex: 1,
                flexDirection: "column",
                backgroundColor: COLORS.card,
                borderRadius: 14,
                padding: 10,
                marginHorizontal: 3,
            }}
        >
            <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
                <FlexWidget
                    style={{
                        height: 24,
                        width: 24,
                        borderRadius: 7,
                        backgroundColor: COLORS.bg,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 6,
                    }}
                >
                    <SvgWidget svg={lucideSvg(icon, tint)} style={{ height: 14, width: 14 }} />
                </FlexWidget>
                <TextWidget
                    text={title}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: 11, color: COLORS.label }}
                />
            </FlexWidget>
            <TextWidget
                text={value}
                truncate="END"
                maxLines={1}
                style={{ fontSize: 17, fontWeight: "bold", color: COLORS.value, marginTop: 6 }}
            />
            <TextWidget
                text={changeText(change)}
                truncate="END"
                maxLines={1}
                style={{
                    fontSize: 9,
                    color: changeGood == null ? COLORS.label : changeGood ? COLORS.income : COLORS.expense,
                    marginTop: 2,
                }}
            />
        </FlexWidget>
    );
};

export const SummaryWidget = ({ summary, metrics, paired, config }: Props) => {
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

    const scoped = isScopedConfig(config);
    const style = config?.style ?? "cards";

    const header = (
        <FlexWidget
            style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "match_parent",
                paddingHorizontal: 4,
                paddingBottom: 6,
            }}
        >
            <TextWidget
                text={scoped ? `Spendly · ${configLabel(config ?? null)}` : "Spendly"}
                truncate="END"
                maxLines={1}
                style={{ fontSize: 12, fontWeight: "bold", color: COLORS.accent }}
            />
            <TextWidget
                text={summary ? `as of ${formatTime(summary.asOf)}` : "offline"}
                style={{ fontSize: 10, color: COLORS.label, marginLeft: 6 }}
            />
        </FlexWidget>
    );

    if (summary && style === "cards") {
        const s = summary.scoped;
        const useScopedNumbers = scoped && s;
        return (
            <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: DEFAULT_BASE_URL }}
                style={{
                    height: "match_parent",
                    width: "match_parent",
                    backgroundColor: COLORS.bg,
                    borderRadius: 20,
                    padding: 10,
                    flexDirection: "column",
                    justifyContent: "center",
                }}
            >
                {header}
                <FlexWidget style={{ flexDirection: "row", width: "match_parent" }}>
                    <DataCard
                        icon="piggyBank"
                        tint={COLORS.accent}
                        title="Remaining"
                        value={formatINR(useScopedNumbers
                            ? (s?.remaining ?? (s?.income ?? 0) - (s?.expenses ?? 0))
                            : summary.totalBalance)}
                        change={useScopedNumbers ? s?.remainingChange : undefined}
                        goodWhenUp
                    />
                    <DataCard
                        icon="trendingUp"
                        tint={COLORS.income}
                        title="Income"
                        value={formatINR(useScopedNumbers ? (s?.income ?? 0) : summary.monthIncome)}
                        change={useScopedNumbers ? s?.incomeChange : undefined}
                        goodWhenUp
                    />
                    <DataCard
                        icon="trendingDown"
                        tint={COLORS.expense}
                        title="Expenses"
                        value={formatINR(useScopedNumbers ? (s?.expenses ?? 0) : summary.monthExpenses)}
                        change={useScopedNumbers ? s?.expensesChange : undefined}
                        goodWhenUp={false}
                    />
                </FlexWidget>
            </FlexWidget>
        );
    }

    // Compact style: label/value rows like the v1 widget
    const rows: { label: string; value: string; color?: HexColor }[] = [];
    if (summary && scoped) {
        rows.push({ label: "Spent", value: formatINR(summary.scoped?.expenses ?? 0), color: COLORS.expense });
        rows.push({ label: "Received", value: formatINR(summary.scoped?.income ?? 0), color: COLORS.income });
        if (!config?.categoryId) rows.push({ label: "Balance", value: formatINR(summary.totalBalance) });
    } else if (summary) {
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
            {header}
            {rows.length > 0 ? (
                <FlexWidget style={{ flexDirection: "row", width: "match_parent", marginTop: 4 }}>
                    {rows.map((row) => (
                        <FlexWidget key={row.label} style={{ flexDirection: "column", flex: 1 }}>
                            <TextWidget text={row.label} style={{ fontSize: 11, color: COLORS.label }} />
                            <TextWidget
                                text={row.value}
                                style={{ fontSize: 20, fontWeight: "bold", color: row.color ?? COLORS.value }}
                            />
                        </FlexWidget>
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
