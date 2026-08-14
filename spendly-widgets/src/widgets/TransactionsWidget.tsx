import React from "react";
import { FlexWidget, ListWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { configLabel, WidgetInstanceConfig, WidgetTransaction } from "../config";
import { lucideSvg } from "./icons";
import { formatINR } from "../format";
import { WIDGET_COLORS as C } from "./theme";

const formatDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
};

type Props = {
    transactions: WidgetTransaction[] | null;
    baseUrl: string;
    config?: WidgetInstanceConfig | null;
};

export const TransactionsWidget = ({ transactions, baseUrl, config }: Props) => (
    <FlexWidget
        style={{
            height: "match_parent",
            width: "match_parent",
            backgroundColor: C.bg,
            borderRadius: 20,
            padding: 12,
            flexDirection: "column",
        }}
    >
        <FlexWidget
            style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                width: "match_parent",
                paddingBottom: 6,
            }}
        >
            <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: `${baseUrl}/transactions` }}
                style={{ flexDirection: "column", flex: 1 }}
            >
                <TextWidget
                    text={config ? configLabel(config) : "Recent transactions"}
                    truncate="END"
                    maxLines={1}
                    style={{ fontSize: 12, fontWeight: "bold", color: C.accent }}
                />
            </FlexWidget>
            <FlexWidget
                clickAction="OPEN_URI"
                clickActionData={{ uri: "spendlywidgets://search" }}
                style={{ paddingHorizontal: 8, paddingVertical: 2 }}
            >
                <SvgWidget
                    svg={lucideSvg("search", C.label)}
                    style={{ height: 16, width: 16 }}
                />
            </FlexWidget>
        </FlexWidget>

        {transactions && transactions.length > 0 ? (
            <FlexWidget style={{ flex: 1, width: "match_parent" }}>
                <ListWidget style={{ height: "match_parent", width: "match_parent" }}>
                {transactions.map((t) => (
                    <FlexWidget
                        key={t.id}
                        clickAction="OPEN_URI"
                        clickActionData={{ uri: `${baseUrl}/transactions` }}
                        style={{
                            flexDirection: "row",
                            width: "match_parent",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingVertical: config?.style === "compact" ? 4 : 7,
                        }}
                    >
                        <FlexWidget style={{ flexDirection: "column", flex: 1, marginRight: 8 }}>
                            <TextWidget
                                text={t.payee}
                                truncate="END"
                                maxLines={1}
                                style={{ fontSize: 13, fontWeight: "500", color: C.value }}
                            />
                            {config?.style !== "compact" && (
                                <TextWidget
                                    text={`${formatDay(t.date)}${t.category ? ` · ${t.category}` : ""}`}
                                    truncate="END"
                                    maxLines={1}
                                    style={{ fontSize: 10, color: C.label, marginTop: 1 }}
                                />
                            )}
                        </FlexWidget>
                        <TextWidget
                            text={`${t.amount < 0 ? "-" : "+"}${formatINR(Math.abs(t.amount))}`}
                            style={{
                                fontSize: 13,
                                fontWeight: "bold",
                                color: t.amount < 0 ? C.expense : C.income,
                            }}
                        />
                    </FlexWidget>
                ))}
                </ListWidget>
            </FlexWidget>
        ) : (
            <TextWidget
                text={transactions ? "No transactions yet" : "Open the app to refresh"}
                style={{ fontSize: 12, color: C.label, marginTop: 8 }}
            />
        )}
    </FlexWidget>
);
