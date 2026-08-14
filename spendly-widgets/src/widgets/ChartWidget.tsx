import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { areaChartSvg, barChartSvg, lineChartSvg } from "./charts";
import { WIDGET_COLORS as C } from "./theme";

type Props = {
    summary: WidgetSummary | null;
    baseUrl: string;
    config?: WidgetInstanceConfig | null;
};

// Spending-over-time chart with the dashboard's variants: bar (default),
// area, or line — chosen per instance in the widget settings.
export const ChartWidget = ({ summary, baseUrl, config }: Props) => {
    const style = config?.style ?? "bar";
    const buildSvg = style === "line" ? lineChartSvg : style === "area" ? areaChartSvg : barChartSvg;

    return (
        <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: baseUrl }}
            style={{
                height: "match_parent",
                width: "match_parent",
                backgroundColor: C.bg,
                borderRadius: 20,
                padding: 14,
                flexDirection: "column",
            }}
        >
            <FlexWidget
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
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
                    style={{ fontSize: 12, fontWeight: "bold", color: C.accent }}
                />
                <TextWidget
                    text={summary
                        ? `${formatINR(summary.scoped?.expenses ?? summary.monthExpenses)} spent`
                        : "offline"}
                    style={{ fontSize: 12, color: C.label, marginLeft: 6 }}
                />
            </FlexWidget>

            {summary ? (
                <FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 6 }}>
                    <SvgWidget
                        svg={buildSvg(summary.days)}
                        style={{ width: "match_parent", height: "match_parent" }}
                    />
                </FlexWidget>
            ) : (
                <TextWidget
                    text="Open the app to refresh"
                    style={{ fontSize: 12, color: C.label, marginTop: 12 }}
                />
            )}
        </FlexWidget>
    );
};
