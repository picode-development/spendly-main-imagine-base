import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { lucideSvg, LucideIconName } from "./icons";
import { WIDGET_COLORS as C } from "./theme";

// Paytm/GPay-style quick action row: each button deep-links straight into
// the matching Spendly flow. Icons are the app's own library (Lucide).
const ACTIONS: { icon: LucideIconName; label: string; uri: (baseUrl: string) => string }[] = [
    { icon: "plus", label: "Add", uri: (b) => `${b}/?widget-action=new` },
    { icon: "mic", label: "Voice", uri: (b) => `${b}/?widget-action=voice` },
    { icon: "camera", label: "Photo", uri: (b) => `${b}/?widget-action=photo` },
    { icon: "search", label: "Search", uri: (b) => `${b}/transactions?search=1` },
    { icon: "arrowUpRight", label: "Open", uri: (b) => b },
];

type Props = { baseUrl: string };

export const ActionsWidget = ({ baseUrl }: Props) => (
    <FlexWidget
        style={{
            height: "match_parent",
            width: "match_parent",
            backgroundColor: C.bg,
            borderRadius: 20,
            paddingHorizontal: 8,
            paddingVertical: 10,
            flexDirection: "column",
            justifyContent: "center",
        }}
    >
        <FlexWidget
            style={{
                flexDirection: "row",
                width: "match_parent",
                justifyContent: "space-between",
            }}
        >
            {ACTIONS.map((a) => (
                <FlexWidget
                    key={a.label}
                    clickAction="OPEN_URI"
                    clickActionData={{ uri: a.uri(baseUrl) }}
                    style={{
                        flex: 1,
                        flexDirection: "column",
                        alignItems: "center",
                        paddingVertical: 6,
                    }}
                >
                    <FlexWidget
                        style={{
                            height: 42,
                            width: 42,
                            borderRadius: 21,
                            backgroundColor: C.card,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <SvgWidget
                            svg={lucideSvg(a.icon, C.value)}
                            style={{ height: 20, width: 20 }}
                        />
                    </FlexWidget>
                    <TextWidget
                        text={a.label}
                        style={{ fontSize: 11, color: C.label, marginTop: 4 }}
                    />
                </FlexWidget>
            ))}
        </FlexWidget>
    </FlexWidget>
);
