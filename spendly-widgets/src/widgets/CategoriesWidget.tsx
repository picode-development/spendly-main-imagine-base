import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetInstanceConfig, WidgetSummary } from "../config";
import { formatINR } from "../format";
import { CATEGORY_COLORS, donutSvg } from "./charts";
import { WIDGET_COLORS as C } from "./theme";

type Props = {
    summary: WidgetSummary | null;
    baseUrl: string;
    config?: WidgetInstanceConfig | null;
};

// The dashboard's category split as a widget: donut with legend, or
// ranked horizontal bars — chosen per instance.
export const CategoriesWidget = ({ summary, baseUrl, config }: Props) => {
    const style = config?.style ?? "donut";
    const cats = summary?.topCategories ?? [];
    const total = cats.reduce((a, c) => a + c.value, 0) || 1;

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
                <FlexWidget style={{ flexDirection: "column", width: "match_parent", flex: 1 }}>
                    {cats.map((cat, i) => (
                        <FlexWidget key={cat.name} style={{ flexDirection: "column", width: "match_parent", marginTop: i === 0 ? 0 : 7 }}>
                            <FlexWidget style={{ flexDirection: "row", justifyContent: "space-between", width: "match_parent" }}>
                                <TextWidget
                                    text={cat.name.trim()}
                                    truncate="END"
                                    maxLines={1}
                                    style={{ fontSize: 12, color: C.value }}
                                />
                                <TextWidget
                                    text={formatINR(cat.value)}
                                    style={{ fontSize: 12, fontWeight: "bold", color: C.value, marginLeft: 8 }}
                                />
                            </FlexWidget>
                            <FlexWidget
                                style={{
                                    width: "match_parent",
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: C.card,
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
                    <FlexWidget style={{ height: "match_parent", width: 110 }}>
                        <SvgWidget
                            svg={donutSvg(cats)}
                            style={{ height: "match_parent", width: 110 }}
                        />
                    </FlexWidget>
                    <FlexWidget style={{ flexDirection: "column", flex: 1, marginLeft: 10 }}>
                        {cats.map((cat, i) => (
                            <FlexWidget key={cat.name} style={{ flexDirection: "row", alignItems: "center", marginTop: i === 0 ? 0 : 5 }}>
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
                                        style={{ fontSize: 11, color: C.value }}
                                    />
                                </FlexWidget>
                            </FlexWidget>
                        ))}
                    </FlexWidget>
                </FlexWidget>
            )}
        </FlexWidget>
    );
};
