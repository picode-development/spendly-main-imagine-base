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

// The dashboard's category split as a widget: radial rings (Google Fit-
// style concentric progress, one ring per category), true donut, radar
// polygon, or ranked horizontal bars — matching every chart style the
// dashboard itself offers, sized to the widget's real dimensions.
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

    // Radar's polygon is capped independently of chartSize/stacked growth —
    // unlike donut/radial (where a bigger ring genuinely shows more detail),
    // a taller widget stretching radar's labels further from the shape they
    // label only hurt readability (they were laid out with justifyContent
    // "space-between" across the full, potentially huge, chartSize box).
    // Fixed gaps below keep labels close to the chart at any widget size;
    // extra space just becomes centered breathing room around the block,
    // which reads as intentional rather than broken.
    const radarSize = Math.min(220, Math.round(chartSize * 0.64));
    const radarGap = Math.max(6, Math.round(radarSize * 0.06));
    const radarFontSize = Math.max(9, Math.round(radarSize * 0.062));
    // Side labels get a fixed width (not the chart's leftover space) so
    // uneven left/right name lengths can't pull the chart off-center —
    // sized to actually fit within it (~0.55×fontSize per character is a
    // reasonable average for this sans font) rather than a flat char count
    // that's too generous on a small widget and wastes room on a big one.
    const radarSideWidth = Math.round(radarSize * 0.62);
    const radarMaxChars = Math.max(4, Math.floor(radarSideWidth / (radarFontSize * 0.55)));
    const truncate = (name: string, maxChars: number) => {
        const n = name.trim();
        return n.length > maxChars ? `${n.slice(0, Math.max(1, maxChars - 1))}…` : n;
    };
    type CompassSlot = "top" | "right" | "bottom" | "left";
    const compassSlot = (index: number, count: number): CompassSlot => {
        const a = -Math.PI / 2 + (index * 2 * Math.PI) / count;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return Math.abs(cos) > Math.abs(sin) ? (cos > 0 ? "right" : "left") : (sin > 0 ? "bottom" : "top");
    };
    const radarSlots: Partial<Record<CompassSlot, { name: string; color: `#${string}` }>> = {};
    if (style === "radar") {
        // Top/bottom labels have the chart's full width to sit under/over,
        // so they get a more generous cap than the side labels' fixed lane.
        cats.forEach((cat, i) => {
            const slot = compassSlot(i, cats.length);
            const maxChars = slot === "left" || slot === "right" ? radarMaxChars : radarMaxChars + 6;
            radarSlots[slot] = {
                name: truncate(cat.name, maxChars),
                color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] as `#${string}`,
            };
        });
    }
    const radarLabel = (slot: CompassSlot, align: "start" | "center" | "end") => {
        const entry = radarSlots[slot];
        if (!entry) return <FlexWidget style={{ width: slot === "left" || slot === "right" ? radarSideWidth : 0 }} />;
        return (
            <FlexWidget style={{ width: slot === "left" || slot === "right" ? radarSideWidth : undefined, alignItems: align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center" }}>
                <TextWidget
                    text={entry.name}
                    maxLines={1}
                    style={{ fontSize: radarFontSize, fontWeight: "600", color: entry.color }}
                />
            </FlexWidget>
        );
    };

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
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        ...chartCardStyle(mode),
                    }}
                >
                    {style === "radar" && cats.length >= 3 ? (
                        // Natural-flow column, not a match_parent-stretched
                        // grid — a fixed gap keeps labels close to the chart
                        // regardless of how much extra height a tall resize
                        // gives this container (previously "space-between"
                        // across the full box, so labels ended up stranded
                        // far from the shape on any large widget). Side
                        // labels get a fixed lane width so an uneven left/
                        // right name length can't pull the chart off-center.
                        <FlexWidget style={{ flexDirection: "column", alignItems: "center" }}>
                            <FlexWidget style={{ marginBottom: radarGap }}>{radarLabel("top", "center")}</FlexWidget>
                            <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
                                <FlexWidget style={{ marginRight: radarGap }}>{radarLabel("left", "end")}</FlexWidget>
                                <SvgWidget svg={radarSvg(cats, radarSize, mode)} style={{ height: radarSize, width: radarSize }} />
                                <FlexWidget style={{ marginLeft: radarGap }}>{radarLabel("right", "start")}</FlexWidget>
                            </FlexWidget>
                            <FlexWidget style={{ marginTop: radarGap }}>{radarLabel("bottom", "center")}</FlexWidget>
                        </FlexWidget>
                    ) : (
                        <OverlapWidget style={{ height: chartSize, width: chartSize }}>
                            <SvgWidget
                                svg={
                                    style === "donut" ? donutSvg(cats, chartSize, mode)
                                        // Degenerate radar (< 3 categories) falls through to here —
                                        // radarSvg itself already falls back to donutSvg for that case.
                                        : style === "radar" ? radarSvg(cats, chartSize, mode)
                                            : radialSvg(cats, chartSize, mode)
                                }
                                style={{ height: chartSize, width: chartSize }}
                            />
                            {/* Both donut (hole ~2/3 of chartSize — inner/outer
                                radius ratio 60/90, see charts.ts) and radial
                                rings (hole ~40% — innerR = maxR*0.4) have real
                                empty space in the middle; glanceable-widget
                                design leads with the number over the chart
                                decoration, so both get the total there instead
                                of just one. Radial's tighter hole gets a
                                smaller font so it still fits. */}
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
                                        fontSize: Math.max(10, Math.round(chartSize * (style === "donut" ? 0.1 : 0.075))),
                                        fontWeight: "bold",
                                        color: nc.value,
                                    }}
                                />
                                <TextWidget
                                    text="Total"
                                    style={{
                                        fontSize: Math.max(8, Math.round(chartSize * (style === "donut" ? 0.045 : 0.035))),
                                        color: nc.label,
                                        marginTop: 2,
                                    }}
                                />
                            </FlexWidget>
                        </OverlapWidget>
                    )}
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
