import React from "react";
import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import { WidgetTransaction } from "../config";
import { formatINR } from "../format";
import { WIDGET_COLORS as C } from "./theme";

const formatDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
};

type Props = { transactions: WidgetTransaction[] | null; baseUrl: string };

export const TransactionsWidget = ({ transactions, baseUrl }: Props) => (
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
            clickAction="OPEN_URI"
            clickActionData={{ uri: `${baseUrl}/transactions` }}
            style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "match_parent",
                paddingBottom: 6,
            }}
        >
            <TextWidget
                text="Recent transactions"
                style={{ fontSize: 12, fontWeight: "bold", color: C.accent }}
            />
            <TextWidget text="See all →" style={{ fontSize: 11, color: C.label }} />
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
                            paddingVertical: 7,
                        }}
                    >
                        <FlexWidget style={{ flexDirection: "column", flex: 1, marginRight: 8 }}>
                            <TextWidget
                                text={t.payee}
                                truncate="END"
                                maxLines={1}
                                style={{ fontSize: 13, fontWeight: "500", color: C.value }}
                            />
                            <TextWidget
                                text={`${formatDay(t.date)}${t.category ? ` · ${t.category}` : ""}`}
                                truncate="END"
                                maxLines={1}
                                style={{ fontSize: 10, color: C.label, marginTop: 1 }}
                            />
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
