import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import { WIDGET_COLORS as C } from "./theme";

// Paytm/GPay-style quick action row: each button deep-links straight into
// the matching Spendly flow via /?widget-action=...
const ACTIONS: { emoji: string; label: string; action: string | null }[] = [
    { emoji: "➕", label: "Add", action: "new" },
    { emoji: "🎤", label: "Voice", action: "voice" },
    { emoji: "📷", label: "Photo", action: "photo" },
    { emoji: "💰", label: "Open", action: null },
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
                    clickActionData={{
                        uri: a.action ? `${baseUrl}/?widget-action=${a.action}` : baseUrl,
                    }}
                    style={{
                        flex: 1,
                        flexDirection: "column",
                        alignItems: "center",
                        paddingVertical: 6,
                    }}
                >
                    <FlexWidget
                        style={{
                            height: 44,
                            width: 44,
                            borderRadius: 22,
                            backgroundColor: C.card,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <TextWidget text={a.emoji} style={{ fontSize: 19 }} />
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
