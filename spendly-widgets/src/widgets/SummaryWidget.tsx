import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { configLabel, DEFAULT_BASE_URL, MetricKey, WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR, formatTime } from "../format";
import { areaChartSvg } from "./charts";
import { lucideSvg, LucideIconName } from "./icons";
import { chartCardStyle, getTheme, HexColor, neutralCardText, WidgetMode, WidgetTheme } from "./theme";
import { WidgetShell } from "./WidgetShell";

// Dashboard's actual DataCard variant palette (data-card.tsx: boxVariant/
// iconVariant) — default=blue, success=emerald, danger=rose. The widget's
// WidgetTheme.income/expense are pastel tones tuned for legibility ON the
// raw gradient background; DataCard tiles sit on a neutral card surface
// instead, so they use the dashboard's real semantic colors directly.
const TINT = { default: "#3b82f6", success: "#10b981", danger: "#f43f5e" } as const;

type Props = {
    summary: WidgetSummary | null;
    metrics: MetricKey[];
    paired: boolean;
    config?: WidgetInstanceConfig | null;
    width?: number;
    height?: number;
    mode?: WidgetMode;
    density?: number;
    updateUri?: string;
};

// A configured instance shows its scoped view instead of the metric toggles
const isScopedConfig = (config?: WidgetInstanceConfig | null) =>
    !!config && (config.scope !== "week" || !!config.accountId || !!config.categoryId);

const changeText = (change?: number) => {
    if (change == null || change === 0) return "±0% vs last";
    return `${change > 0 ? "+" : ""}${Math.round(change)}% vs last`;
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
    narrow,
    COLORS,
    mode,
}: {
    icon: LucideIconName;
    tint: HexColor;
    title: string;
    value: string;
    change?: number;
    goodWhenUp: boolean;
    scale: number;
    fill: boolean;
    narrow: boolean;
    COLORS: WidgetTheme;
    mode: WidgetMode;
}) => {
    const changeGood = (change ?? 0) === 0 ? null : ((change ?? 0) > 0) === goodWhenUp;
    const f = (n: number) => Math.round(n * scale);
    const tile = narrow ? 18 : f(24);
    // DataCard sits on its own neutral card surface (cardOnGradient), not
    // the raw gradient — so its text needs the neutral-card palette, not
    // the on-gradient one (see theme.ts neutralCardText for why).
    const nc = neutralCardText(mode);
    return (
        <FlexWidget
            style={{
                flex: 1,
                flexDirection: "column",
                justifyContent: "center",
                backgroundColor: COLORS.cardOnGradient,
                borderRadius: 14,
                padding: narrow ? 8 : f(10),
                marginHorizontal: 3,
                ...(fill ? { height: "match_parent" as const } : {}),
            }}
        >
            <FlexWidget style={{ flexDirection: "row", alignItems: "center", width: "match_parent" }}>
                <FlexWidget
                    style={{
                        height: tile,
                        width: tile,
                        borderRadius: narrow ? 5 : f(7),
                        backgroundColor: COLORS.tileOnGradient,
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: narrow ? 4 : 6,
                    }}
                >
                    <SvgWidget svg={lucideSvg(icon, tint)} style={{ height: narrow ? 11 : f(14), width: narrow ? 11 : f(14) }} />
                </FlexWidget>
                <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
                    <TextWidget
                        text={title}
                        truncate="END"
                        maxLines={1}
                        style={{ fontSize: narrow ? 9 : f(11), color: nc.label }}
                    />
                </FlexWidget>
            </FlexWidget>
            <TextWidget
                text={value}
                truncate="END"
                maxLines={1}
                style={{ fontSize: narrow ? 15 : f(19), fontWeight: "bold", color: nc.value, marginTop: narrow ? 4 : f(6) }}
            />
            {change !== undefined && (
                <TextWidget
                    text={changeText(change)}
                    truncate="END"
                    maxLines={1}
                    style={{
                        fontSize: narrow ? 8 : f(9),
                        color: changeGood == null ? nc.label : changeGood ? TINT.success : TINT.danger,
                        marginTop: 2,
                    }}
                />
            )}
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
    density = 1,
    updateUri,
}: Props) => {
    const COLORS = getTheme(mode);
    if (!paired) {
        return (
            <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={DEFAULT_BASE_URL} updateUri={updateUri}>
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
    // Each card's real width decides whether it renders the compact variant
    const cardWidth = (width - 20 - 18) / 3;
    const narrow = cardWidth < 112;
    // Tall widgets get a mini spending chart under the cards so the extra
    // space carries information instead of sitting empty
    const showMiniChart = style === "cards" && !!summary && height >= 190;
    const cardsAreaFill = style === "cards" && height >= 130;
    // Deterministic vertical split so the chart SVG is generated at the
    // exact height it renders at (no stretching)
    const headerH = 24;
    const cardsH = Math.round(Math.min(120, Math.max(84, height * 0.34)));
    const miniChartH = showMiniChart ? Math.max(50, height - 20 - headerH - cardsH - 8) : 0;

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
                style={{ fontSize: 11, fontWeight: "bold", color: COLORS.label, letterSpacing: 0.5 }}
            />
            <TextWidget
                text={summary ? `as of ${formatTime(summary.asOf)}` : "offline"}
                style={{ fontSize: 10, color: COLORS.label, marginLeft: 6 }}
            />
        </FlexWidget>
    );

    if (summary && style === "cards") {
        // Cards always show the scoped window (default: last 7 days). The
        // % badge compares to the previous equal window — for all-time
        // there is nothing to compare against, so it's hidden entirely.
        const s = summary.scoped;
        const useScopedNumbers = !!s;
        const showChange = !!s && (config?.scope ?? "week") !== "all";
        const chartDims = {
            w: Math.max(60, width - 26),
            h: miniChartH,
            mode,
            density,
        };
        return (
            <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={DEFAULT_BASE_URL} padding={10} updateUri={updateUri}>
                {header}
                <FlexWidget
                    style={{
                        flexDirection: "row",
                        width: "match_parent",
                        ...(showMiniChart
                            ? { height: cardsH }
                            : cardsAreaFill ? { flex: 1 } : {}),
                    }}
                >
                    <DataCard
                        icon="piggyBank"
                        tint={TINT.default}
                        title="Remaining"
                        value={formatINR(useScopedNumbers
                            ? (s?.remaining ?? (s?.income ?? 0) - (s?.expenses ?? 0))
                            : summary.totalBalance)}
                        change={showChange ? s?.remainingChange ?? 0 : undefined}
                        goodWhenUp
                        scale={scale}
                        fill={cardsAreaFill || showMiniChart}
                        narrow={narrow}
                        COLORS={COLORS}
                        mode={mode}
                    />
                    <DataCard
                        icon="trendingUp"
                        tint={TINT.success}
                        title="Income"
                        value={formatINR(useScopedNumbers ? (s?.income ?? 0) : summary.monthIncome)}
                        change={showChange ? s?.incomeChange ?? 0 : undefined}
                        goodWhenUp
                        scale={scale}
                        fill={cardsAreaFill || showMiniChart}
                        narrow={narrow}
                        COLORS={COLORS}
                        mode={mode}
                    />
                    <DataCard
                        icon="trendingDown"
                        tint={TINT.danger}
                        title="Expenses"
                        value={formatINR(useScopedNumbers ? (s?.expenses ?? 0) : summary.monthExpenses)}
                        change={showChange ? s?.expensesChange ?? 0 : undefined}
                        goodWhenUp={false}
                        scale={scale}
                        fill={cardsAreaFill || showMiniChart}
                        narrow={narrow}
                        COLORS={COLORS}
                        mode={mode}
                    />
                </FlexWidget>
                {showMiniChart && (
                    <FlexWidget style={{ height: miniChartH, width: "match_parent", marginTop: 8, padding: 8, ...chartCardStyle(mode, 14) }}>
                        <SvgWidget
                            svg={areaChartSvg(summary.days, { ...chartDims, w: chartDims.w - 16, h: miniChartH - 16 })}
                            style={{ width: chartDims.w - 16, height: miniChartH - 16 }}
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
        <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={DEFAULT_BASE_URL} padding={16} updateUri={updateUri}>
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
