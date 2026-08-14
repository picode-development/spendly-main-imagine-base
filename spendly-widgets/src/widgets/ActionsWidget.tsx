import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { lucideSvg, LucideIconName } from "./icons";
import { getTheme, WidgetMode } from "./theme";
import { WidgetShell } from "./WidgetShell";

// Paytm/GPay-style quick action row. Voice and Search open the overlay
// popups (app scheme); the rest deep-link into the Spendly web app.
// Icons are the app's own library (Lucide).
const ACTIONS: { icon: LucideIconName; label: string; uri: (baseUrl: string) => string }[] = [
    { icon: "plus", label: "Add", uri: (b) => `${b}/?widget-action=new` },
    { icon: "mic", label: "Voice", uri: () => "spendlywidgets://voice" },
    { icon: "camera", label: "Photo", uri: (b) => `${b}/?widget-action=photo` },
    { icon: "search", label: "Search", uri: () => "spendlywidgets://search" },
    { icon: "arrowUpRight", label: "Open", uri: (b) => b },
];

type Props = { baseUrl: string; width?: number; height?: number; mode?: WidgetMode; updateUri?: string };

export const ActionsWidget = ({ baseUrl, width = 320, height = 86, mode = "dark", updateUri }: Props) => {
    const C = getTheme(mode);
    const scale = Math.max(1, Math.min(1.5, height / 90));
    const circle = Math.round(42 * scale);
    return (
        <WidgetShell width={width} height={height} mode={mode} padding={8} updateUri={updateUri}>
            <FlexWidget
                style={{
                    flexDirection: "row",
                    width: "match_parent",
                    flex: 1,
                    alignItems: "center",
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
                                height: circle,
                                width: circle,
                                borderRadius: Math.round(circle / 2),
                                backgroundColor: C.tileOnGradient,
                                justifyContent: "center",
                                alignItems: "center",
                            }}
                        >
                            <SvgWidget
                                svg={lucideSvg(a.icon, C.value)}
                                style={{ height: Math.round(20 * scale), width: Math.round(20 * scale) }}
                            />
                        </FlexWidget>
                        <TextWidget
                            text={a.label}
                            style={{ fontSize: Math.round(11 * scale), color: C.label, marginTop: 4 }}
                        />
                    </FlexWidget>
                ))}
            </FlexWidget>
        </WidgetShell>
    );
};
