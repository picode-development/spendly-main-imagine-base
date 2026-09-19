import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { configLabel, WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { areaChartSvg, barChartSvg, CHART_EXPENSE, CHART_INCOME, lineChartSvg, weekSparkSvg } from "./charts";
import { lucideSvg } from "./icons";
import { chartCardStyle, getTheme, WidgetMode } from "./theme";
import { WidgetShell } from "./WidgetShell";

type Props = {
    summary: WidgetSummary | null;
    baseUrl: string;
    config?: WidgetInstanceConfig | null;
    width?: number;
    height?: number;
    mode?: WidgetMode;
    density?: number;
    updateUri?: string;
};

// Spending-over-time chart with the dashboard's variants: bar (default),
// area, or line. The SVG is sized to the widget's real dimensions so it
// fills the whole card and re-adapts when the widget is resized.
const LegendDot = ({ color, label, labelColor }: { color: string; label: string; labelColor: string }) => (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginLeft: 10 }}>
        <FlexWidget style={{ height: 7, width: 7, borderRadius: 4, backgroundColor: color as `#${string}` }} />
        <TextWidget text={label} style={{ fontSize: 10, color: labelColor as `#${string}`, marginLeft: 4 }} />
    </FlexWidget>
);

export const ChartWidget = ({ summary, baseUrl, config, width = 320, height = 150, mode = "dark", density = 1, updateUri }: Props) => {
    const C = getTheme(mode);
    const style = config?.style ?? "bar";

    // Compact "This week card" style: label + %change + amount on the left,
    // a single-series sparkline on the right — one unified card instead of
    // the other styles' header-row-then-full-width-chart stack. Colored by
    // whether spending is UP or DOWN vs. last period (same good=green/
    // bad=red semantics as the dashboard's DataCard "Spent" tile, TINT.danger
    // in SummaryWidget — an increase in spend is bad regardless of its sign).
    if (style === "spark") {
        const padding = 14;
        const s = summary?.scoped;
        const amount = s?.expenses ?? summary?.monthExpenses ?? 0;
        const change = s?.expensesChange ?? 0;
        const roundedChange = Math.round(Math.abs(change));
        // Same neutral zero-state as the dashboard's DataCard "±0% vs last" —
        // an unchanged week is neither an improvement nor a regression, so it
        // gets neither the green "good" nor the red "bad" color or arrow.
        const isFlat = roundedChange === 0;
        const isSpendUp = change > 0;
        const trendColor = isFlat ? C.label : isSpendUp ? C.expense : C.income;
        const label = configLabel(config ?? null).replace(/^Last 7 days/, "This week");

        if (!summary) {
            return (
                <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={baseUrl} padding={padding} updateUri={updateUri}>
                    <FlexWidget style={{ flex: 1, width: "match_parent", justifyContent: "center" }}>
                        <TextWidget text="Open the app to refresh" style={{ fontSize: 12, color: C.label }} />
                    </FlexWidget>
                </WidgetShell>
            );
        }

        const innerW = width - padding * 2;
        const innerH = height - padding * 2;
        const leftW = Math.round(innerW * 0.44);
        const gap = 10;
        const sparkW = innerW - leftW - gap;
        const sparkH = innerH;
        const chartFits = sparkW >= 50 && sparkH >= 30;

        return (
            <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={baseUrl} padding={padding} updateUri={updateUri}>
                <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row", alignItems: "center" }}>
                    <FlexWidget style={{ width: leftW, flexDirection: "column", justifyContent: "center" }}>
                        <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
                            <TextWidget text={label} truncate="END" maxLines={1} style={{ fontSize: 12, color: C.label }} />
                            <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginLeft: 6 }}>
                                <TextWidget text={isFlat ? "±0%" : `${roundedChange}%`} style={{ fontSize: 14, fontWeight: "bold", color: trendColor, marginRight: isFlat ? 0 : 2 }} />
                                {!isFlat && (
                                    <SvgWidget svg={lucideSvg(isSpendUp ? "arrowUp" : "arrowDown", trendColor)} style={{ height: 14, width: 14 }} />
                                )}
                            </FlexWidget>
                        </FlexWidget>
                        <TextWidget text={formatINR(amount)} truncate="END" maxLines={1} style={{ fontSize: 30, fontWeight: "bold", color: C.value, marginTop: 8 }} />
                    </FlexWidget>
                    {chartFits && (
                        <FlexWidget style={{ width: sparkW, height: sparkH, marginLeft: gap }}>
                            <SvgWidget
                                svg={weekSparkSvg(summary.days, { w: sparkW, h: sparkH, density }, trendColor)}
                                style={{ width: sparkW, height: sparkH }}
                            />
                        </FlexWidget>
                    )}
                </FlexWidget>
            </WidgetShell>
        );
    }

    const buildSvg = style === "line" ? lineChartSvg : style === "area" ? areaChartSvg : barChartSvg;
    const padding = 14;
    const headerHeight = 22;
    const cardPadding = 10;
    const chartDims = {
        w: Math.max(60, width - padding * 2 - cardPadding * 2),
        h: Math.max(50, height - padding * 2 - headerHeight - cardPadding * 2),
        mode,
        density,
    };
    // A bar/area/line chart squeezed under ~100x60 stops conveying
    // anything — bars collapse to slivers, curves flatten into noise. The
    // big total-amount text above is already the headline number and
    // stands on its own, so a too-small widget just shows that instead of
    // cramming an unreadable chart in below it.
    const chartFits = chartDims.w >= 100 && chartDims.h >= 60;

    return (
        <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={baseUrl} padding={padding} updateUri={updateUri}>
            <FlexWidget
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "match_parent",
                }}
            >
                <TextWidget
                    text={[
                        summary?.scoped?.label ?? "Last 7 days",
                        summary?.accountName?.trim(),
                        config?.categoryName?.trim(),
                    ].filter(Boolean).join(" · ")}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: 11, fontWeight: "bold", color: C.label, letterSpacing: 0.5 }}
                />
                <FlexWidget style={{ flexDirection: "row" }}>
                    <LegendDot color={CHART_INCOME} label="In" labelColor={C.label} />
                    <LegendDot color={CHART_EXPENSE} label="Out" labelColor={C.label} />
                </FlexWidget>
            </FlexWidget>
            <TextWidget
                text={summary
                    ? formatINR(summary.scoped?.expenses ?? summary.monthExpenses)
                    : "offline"}
                style={{ fontSize: 22, fontWeight: "bold", color: C.value, marginTop: 2 }}
            />

            {summary && chartFits ? (
                <FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 8, padding: cardPadding, ...chartCardStyle(mode) }}>
                    <SvgWidget
                        svg={buildSvg(summary.days, chartDims)}
                        style={{ width: chartDims.w, height: chartDims.h }}
                    />
                </FlexWidget>
            ) : !summary ? (
                <TextWidget
                    text="Open the app to refresh"
                    style={{ fontSize: 12, color: C.label, marginTop: 12 }}
                />
            ) : null}
        </WidgetShell>
    );
};
