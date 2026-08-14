import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { CATEGORY_COLORS, donutSvg } from "./charts";
import { getTheme, WidgetMode } from "./theme";
import { WidgetShell } from "./WidgetShell";

type Props = {
    summary: WidgetSummary | null;
    baseUrl: string;
    config?: WidgetInstanceConfig | null;
    width?: number;
    height?: number;
    mode?: WidgetMode;
    updateUri?: string;
};

// The dashboard's category split as a widget: donut with legend, or
// ranked horizontal bars — sized to the widget's real dimensions.
export const CategoriesWidget = ({ summary, baseUrl, config, width = 320, height = 150, mode = "dark", updateUri }: Props) => {
    const C = getTheme(mode);
    const style = config?.style ?? "donut";
    const cats = summary?.topCategories ?? [];
    const total = cats.reduce((a, c) => a + c.value, 0) || 1;
    const donutSize = Math.max(80, Math.min(height - 52, Math.floor(width * 0.42), 220));
    const scale = Math.max(1, Math.min(1.5, height / 150));
    const legendFont = Math.round(11 * scale);

    return (
        <WidgetShell width={width} height={height} mode={mode} clickUri={baseUrl} updateUri={updateUri}>
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
                    style={{ fontSize: 12, fontWeight: "bold", color: C.accent }}
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
                <FlexWidget style={{ flexDirection: "row", width: "match_parent", flex: 1, alignItems: "center" }}>
                    <FlexWidget style={{ height: donutSize, width: donutSize }}>
                        <SvgWidget
                            svg={donutSvg(cats, donutSize)}
                            style={{ height: donutSize, width: donutSize }}
                        />
                    </FlexWidget>
                    <FlexWidget style={{ flexDirection: "column", flex: 1, marginLeft: 12 }}>
                        {cats.map((cat, i) => (
                            <FlexWidget key={cat.name} style={{ flexDirection: "row", alignItems: "center", marginTop: i === 0 ? 0 : Math.round(5 * scale) }}>
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
                                        style={{ fontSize: legendFont, color: C.value }}
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
