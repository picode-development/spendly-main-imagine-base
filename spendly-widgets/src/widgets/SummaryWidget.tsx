import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { configLabel, DEFAULT_BASE_URL, MetricKey, WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR, formatTime } from "../format";
import { barChartSvg } from "./charts";
import { lucideSvg, LucideIconName } from "./icons";
import { getTheme, HexColor, WidgetMode, WidgetTheme } from "./theme";
import { WidgetShell } from "./WidgetShell";

type Props = {
    summary: WidgetSummary | null;
    metrics: MetricKey[];
    paired: boolean;
    config?: WidgetInstanceConfig | null;
    width?: number;
    height?: number;
    mode?: WidgetMode;
    updateUri?: string;
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
    scale,
    fill,
    COLORS,
}: {
    icon: LucideIconName;
    tint: HexColor;
    title: string;
    value: string;
    change?: number;
    goodWhenUp: boolean;
    scale: number;
    fill: boolean;
    COLORS: WidgetTheme;
}) => {
    const changeGood = (change ?? 0) === 0 ? null : ((change ?? 0) > 0) === goodWhenUp;
    const f = (n: number) => Math.round(n * scale);
    return (
        <FlexWidget
            style={{
                flex: 1,
                flexDirection: "column",
                justifyContent: "center",
                backgroundColor: COLORS.cardOnGradient,
                borderRadius: 14,
                padding: f(10),
                marginHorizontal: 3,
                ...(fill ? { height: "match_parent" as const } : {}),
            }}
        >
            <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
                <FlexWidget
                    style={{
                        height: f(24),
                        width: f(24),
                        borderRadius: f(7),
                        backgroundColor: COLORS.tileOnGradient,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 6,
                    }}
                >
                    <SvgWidget svg={lucideSvg(icon, tint)} style={{ height: f(14), width: f(14) }} />
                </FlexWidget>
                <TextWidget
                    text={title}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: f(11), color: COLORS.label }}
                />
            </FlexWidget>
            <TextWidget
                text={value}
                truncate="END"
                maxLines={1}
                style={{ fontSize: f(17), fontWeight: "bold", color: COLORS.value, marginTop: f(6) }}
            />
            <TextWidget
                text={changeText(change)}
                truncate="END"
                maxLines={1}
                style={{
                    fontSize: f(9),
                    color: changeGood == null ? COLORS.label : changeGood ? COLORS.income : COLORS.expense,
                    marginTop: 2,
                }}
            />
        </FlexWidget>
    );
};

export const SummaryWidget = ({
    summary,
    metrics,
    paired,
    config,
    width = 320,
    height = 150,
    mode = "dark",
    updateUri,
}: Props) => {
    const COLORS = getTheme(mode);
    if (!paired) {
        return (
            <WidgetShell width={width} height={height} mode={mode} clickUri={DEFAULT_BASE_URL} updateUri={updateUri}>
                <FlexWidget
                    style={{
                        flex: 1,
                        width: "match_parent",
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
            </WidgetShell>
        );
    }

    const scoped = isScopedConfig(config);
    const style = config?.style ?? "cards";
    const scale = Math.max(1, Math.min(1.35, width / 330));
    // Tall widgets get a mini spending chart under the cards so the extra
    // space carries information instead of sitting empty
    const showMiniChart = style === "cards" && !!summary && height >= 190;
    const cardsAreaFill = style === "cards" && height >= 130;

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
        const chartDims = {
            w: Math.max(60, width - 28),
            h: Math.max(40, Math.round((height - 60) * 0.45)),
            mode,
        };
        return (
            <WidgetShell width={width} height={height} mode={mode} clickUri={DEFAULT_BASE_URL} padding={10} updateUri={updateUri}>
                {header}
                <FlexWidget
                    style={{
                        flexDirection: "row",
                        width: "match_parent",
                        ...(cardsAreaFill ? { flex: showMiniChart ? 55 : 1 } : {}),
                    }}
                >
                    <DataCard
                        icon="piggyBank"
                        tint={COLORS.accent}
                        title="Remaining"
                        value={formatINR(useScopedNumbers
                            ? (s?.remaining ?? (s?.income ?? 0) - (s?.expenses ?? 0))
                            : summary.totalBalance)}
                        change={useScopedNumbers ? s?.remainingChange : undefined}
                        goodWhenUp
                        scale={scale}
                        fill={cardsAreaFill}
                        COLORS={COLORS}
                    />
                    <DataCard
                        icon="trendingUp"
                        tint={COLORS.income}
                        title="Income"
                        value={formatINR(useScopedNumbers ? (s?.income ?? 0) : summary.monthIncome)}
                        change={useScopedNumbers ? s?.incomeChange : undefined}
                        goodWhenUp
                        scale={scale}
                        fill={cardsAreaFill}
                        COLORS={COLORS}
                    />
                    <DataCard
                        icon="trendingDown"
                        tint={COLORS.expense}
                        title="Expenses"
                        value={formatINR(useScopedNumbers ? (s?.expenses ?? 0) : summary.monthExpenses)}
                        change={useScopedNumbers ? s?.expensesChange : undefined}
                        goodWhenUp={false}
                        scale={scale}
                        fill={cardsAreaFill}
                        COLORS={COLORS}
                    />
                </FlexWidget>
                {showMiniChart && (
                    <FlexWidget style={{ flex: 45, width: "match_parent", marginTop: 8, paddingHorizontal: 3 }}>
                        <SvgWidget
                            svg={barChartSvg(summary.days, chartDims)}
                            style={{ width: "match_parent", height: "match_parent" }}
                        />
                    </FlexWidget>
                )}
            </WidgetShell>
        );
    }

    // Compact style: label/value rows
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
        <WidgetShell width={width} height={height} mode={mode} clickUri={DEFAULT_BASE_URL} padding={16} updateUri={updateUri}>
            {header}
            {rows.length > 0 ? (
                <FlexWidget
                    style={{
                        flexDirection: "row",
                        width: "match_parent",
                        flex: 1,
                        alignItems: "center",
                    }}
                >
                    {rows.map((row) => (
                        <FlexWidget key={row.label} style={{ flexDirection: "column", flex: 1 }}>
                            <TextWidget text={row.label} style={{ fontSize: Math.round(11 * scale), color: COLORS.label }} />
                            <TextWidget
                                text={row.value}
                                style={{ fontSize: Math.round(20 * scale), fontWeight: "bold", color: row.color ?? COLORS.value }}
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
        </WidgetShell>
    );
};
