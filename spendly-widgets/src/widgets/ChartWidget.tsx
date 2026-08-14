import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { areaChartSvg, barChartSvg, CHART_EXPENSE, CHART_INCOME, lineChartSvg } from "./charts";
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

            {summary ? (
                <FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 8, padding: cardPadding, ...chartCardStyle(mode) }}>
                    <SvgWidget
                        svg={buildSvg(summary.days, chartDims)}
                        style={{ width: chartDims.w, height: chartDims.h }}
                    />
                </FlexWidget>
            ) : (
                <TextWidget
                    text="Open the app to refresh"
                    style={{ fontSize: 12, color: C.label, marginTop: 12 }}
                />
            )}
        </WidgetShell>
    );
};
