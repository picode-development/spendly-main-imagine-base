import React from "react";
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from "react-native-android-widget";
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
    /** Tapped legend row (chart/radial/radar styles only) — highlights that category. */
    selectedIndex?: number | null;
};

// The dashboard's category split as a widget: radial rings, true donut,
// radar polygon (all with a legend), or ranked horizontal bars — sized to
// the widget's real dimensions.
export const CategoriesWidget = ({ summary, baseUrl, config, width = 320, height = 150, mode = "dark", density = 1, updateUri, selectedIndex = null }: Props) => {
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
    // No hard ceiling on the stacked chart — a very tall resize should keep
    // growing it (bounded only by the two proportional caps below), not
    // stop at some fixed size and leave the rest of the height empty.
    const chartSize = stacked
        ? Math.max(90, Math.min(Math.floor(width * 0.6), Math.floor(height * 0.42)))
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
                    <OverlapWidget style={{ height: chartSize, width: chartSize }}>
                        <SvgWidget
                            svg={
                                style === "donut" ? donutSvg(cats, chartSize, mode)
                                    : style === "radar" ? radarSvg(cats, chartSize, mode)
                                        : radialSvg(cats, chartSize, mode)
                            }
                            style={{ height: chartSize, width: chartSize }}
                        />
                        {/* Donut's hole (inner/outer radius ratio 60/90, see
                            charts.ts) is ~2/3 of chartSize wide — plenty of
                            room for the total, giving a bigger chart on a
                            tall resize an actual payoff instead of just
                            more empty ring. */}
                        {style === "donut" && (
                            <FlexWidget
                                style={{
                                    height: "match_parent",
                                    width: "match_parent",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexDirection: "column",
                                }}
                            >
                                <TextWidget
                                    text={formatINR(total)}
                                    maxLines={1}
                                    style={{
                                        fontSize: Math.max(11, Math.round(chartSize * 0.1)),
                                        fontWeight: "bold",
                                        color: nc.value,
                                    }}
                                />
                                <TextWidget
                                    text="Total"
                                    style={{
                                        fontSize: Math.max(9, Math.round(chartSize * 0.045)),
                                        color: nc.label,
                                        marginTop: 2,
                                    }}
                                />
                            </FlexWidget>
                        )}
                    </OverlapWidget>
                    <FlexWidget
                        style={
                            stacked
                                ? { flexDirection: "column", width: "match_parent", marginTop: 14, justifyContent: "center" }
                                : { flexDirection: "column", flex: 1, marginLeft: 12, justifyContent: "center" }
                        }
                    >
                        {cats.map((cat, i) => {
                            const selected = selectedIndex === i;
                            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length] as `#${string}`;
                            return (
                                <FlexWidget
                                    key={cat.name}
                                    clickAction="SELECT_CATEGORY_SLICE"
                                    clickActionData={{ index: i }}
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        width: "match_parent",
                                        marginTop: i === 0 ? 0 : Math.round((stacked ? 8 : 5) * scale),
                                        borderRadius: 8,
                                        paddingVertical: selected ? 4 : 0,
                                        paddingHorizontal: selected ? 6 : 0,
                                        backgroundColor: selected ? `${color}26` : "#00000000",
                                    }}
                                >
                                    <FlexWidget
                                        style={{
                                            height: selected ? 10 : 8,
                                            width: selected ? 10 : 8,
                                            borderRadius: 5,
                                            backgroundColor: color,
                                            marginRight: 6,
                                        }}
                                    />
                                    <FlexWidget style={{ flexDirection: "column", flex: 1 }}>
                                        <TextWidget
                                            text={`${cat.name.trim()} · ${formatINR(cat.value)}`}
                                            truncate="END"
                                            maxLines={1}
                                            style={{
                                                fontSize: stacked ? legendFont + 1 : legendFont,
                                                fontWeight: selected ? "bold" : "normal",
                                                color: nc.value,
                                            }}
                                        />
                                        {selected && (
                                            <TextWidget
                                                text={`${Math.round((cat.value / total) * 100)}% of total`}
                                                style={{ fontSize: Math.max(9, legendFont - 2), color: nc.label, marginTop: 1 }}
                                            />
                                        )}
                                    </FlexWidget>
                                </FlexWidget>
                            );
                        })}
                    </FlexWidget>
                </FlexWidget>
            )}
        </WidgetShell>
    );
};
