import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { CATEGORY_COLORS, donutSvg, radarSvg, radialSvg } from "./charts";
import { chartCardStyle, getTheme, neutralCardText, WidgetMode } from "./theme";
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

// The dashboard's category split as a widget: radial rings, true donut,
// radar polygon (all with a legend), or ranked horizontal bars — sized to
// the widget's real dimensions.
export const CategoriesWidget = ({ summary, baseUrl, config, width = 320, height = 150, mode = "dark", density = 1, updateUri }: Props) => {
    const C = getTheme(mode);
    const nc = neutralCardText(mode);
    // Default preserves the pre-existing look for widgets placed before
    // this option existed (their unset style used to fall through to what
    // is now explicitly the "radial" chart).
    const style = config?.style ?? "radial";
    const cats = summary?.topCategories ?? [];
    const total = cats.reduce((a, c) => a + c.value, 0) || 1;
    const scale = Math.max(1, Math.min(1.5, height / 150));
    const legendFont = Math.round(11 * scale);
    // Side-by-side (chart | legend) is the right call for a short-and-wide
    // widget, but wastes most of the extra room once a resize gives far
    // more height than width — reflow to chart-on-top, legend-below so a
    // tall widget actually grows the chart and spaces out the list instead
    // of just centering a small unchanged block in empty space.
    const stacked = height >= width * 0.85;
    const chartSize = stacked
        ? Math.max(90, Math.min(Math.floor(width * 0.6), Math.floor(height * 0.42), 280))
        : Math.max(80, Math.min(height - 52, Math.floor(width * 0.42), 320));

    return (
        <WidgetShell width={width} height={height} mode={mode} density={density} background={config?.background} clickUri={baseUrl} updateUri={updateUri}>
            <FlexWidget
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    width: "match_parent",
                    paddingBottom: 6,
                }}
            >
                <TextWidget
                    text={[
                        "Categories",
                        summary?.scoped?.label,
                        summary?.accountName?.trim(),
                    ].filter(Boolean).join(" · ")}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: 11, fontWeight: "bold", color: C.label, letterSpacing: 0.5 }}
                />
            </FlexWidget>

            {!summary || cats.length === 0 ? (
                <TextWidget
                    text={summary ? "No spending in this period" : "Open the app to refresh"}
                    style={{ fontSize: 12, color: C.label, marginTop: 8 }}
                />
            ) : style === "bars" ? (
                <FlexWidget
                    style={{
                        flexDirection: "column",
                        width: "match_parent",
                        flex: 1,
                        justifyContent: "center",
                    }}
                >
                    {cats.map((cat, i) => (
                        <FlexWidget key={cat.name} style={{ flexDirection: "column", width: "match_parent", marginTop: i === 0 ? 0 : Math.round(7 * scale) }}>
                            <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", width: "match_parent" }}>
                                <TextWidget
                                    text={cat.name.trim()}
                                    truncate="END"
                                    maxLines={1}
                                    style={{ fontSize: legendFont + 1, color: C.value }}
                                />
                                <TextWidget
                                    text={formatINR(cat.value)}
                                    style={{ fontSize: legendFont + 1, fontWeight: "bold", color: C.value, marginLeft: 8 }}
                                />
                            </FlexWidget>
                            <FlexWidget
                                style={{
                                    width: "match_parent",
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: C.tileOnGradient,
                                    marginTop: 3,
                                    flexDirection: "row",
                                }}
                            >
                                <FlexWidget
                                    style={{
                                        flex: Math.max(4, Math.round((cat.value / total) * 100)),
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as `#${string}`,
                                    }}
                                />
                                <FlexWidget
                                    style={{
                                        flex: 100 - Math.max(4, Math.round((cat.value / total) * 100)),
                                        height: 6,
                                    }}
                                />
                            </FlexWidget>
                        </FlexWidget>
                    ))}
                </FlexWidget>
            ) : (
                <FlexWidget
                    style={{
                        flexDirection: stacked ? "column" : "row",
                        width: "match_parent",
                        height: "match_parent",
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 10,
                        ...chartCardStyle(mode),
                    }}
                >
                    <FlexWidget style={{ height: chartSize, width: chartSize }}>
                        <SvgWidget
                            svg={
                                style === "donut" ? donutSvg(cats, chartSize, mode)
                                    : style === "radar" ? radarSvg(cats, chartSize, mode)
                                        : radialSvg(cats, chartSize, mode)
                            }
                            style={{ height: chartSize, width: chartSize }}
                        />
                    </FlexWidget>
                    <FlexWidget
                        style={
                            stacked
                                ? { flexDirection: "column", width: "match_parent", marginTop: 14, justifyContent: "center" }
                                : { flexDirection: "column", flex: 1, marginLeft: 12, justifyContent: "center" }
                        }
                    >
                        {cats.map((cat, i) => (
                            <FlexWidget
                                key={cat.name}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    width: "match_parent",
                                    marginTop: i === 0 ? 0 : Math.round((stacked ? 8 : 5) * scale),
                                }}
                            >
                                <FlexWidget
                                    style={{
                                        height: 8,
                                        width: 8,
                                        borderRadius: 4,
                                        backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as `#${string}`,
                                        marginRight: 6,
                                    }}
                                />
                                <FlexWidget style={{ flexDirection: "column", flex: 1 }}>
                                    <TextWidget
                                        text={`${cat.name.trim()} · ${formatINR(cat.value)}`}
                                        truncate="END"
                                        maxLines={1}
                                        style={{ fontSize: stacked ? legendFont + 1 : legendFont, color: nc.value }}
                                    />
                                </FlexWidget>
                            </FlexWidget>
                        ))}
                    </FlexWidget>
                </FlexWidget>
            )}
        </WidgetShell>
    );
};
