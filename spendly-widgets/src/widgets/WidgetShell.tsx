import React from "react";
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { lucideSvg } from "./icons";
import { BackgroundStyle, backgroundSvg, getTheme, WidgetMode } from "./theme";

// Every widget's frame: the site header's gradient painted edge-to-edge
// behind the content (RemoteViews can't gradient-fill; an SVG layer can).
// When a newer APK is published, a gold update bar appears at the bottom
// of every widget; tapping it downloads the latest build.
type Props = {
    width: number;
    height: number;
    mode?: WidgetMode;
    background?: BackgroundStyle;
    clickUri?: string;
    padding?: number;
    /** Set when a newer build is available — tapping downloads the APK */
    updateUri?: string;
    children: React.ReactNode;
};

export const WidgetShell = ({
    width,
    height,
    mode = "dark",
    background = "gradient",
    clickUri,
    padding = 14,
    updateUri,
    children,
}: Props) => {
    const t = getTheme(mode);
    return (
        <OverlapWidget
            {...(clickUri
                ? { clickAction: "OPEN_URI" as const, clickActionData: { uri: clickUri } }
                : {})}
            style={{ height: "match_parent", width: "match_parent" }}
        >
            <SvgWidget
                svg={backgroundSvg(width, height, mode, background)}
                style={{ height, width }}
            />
            <FlexWidget
                style={{
                    height: "match_parent",
                    width: "match_parent",
                    padding,
                    flexDirection: "column",
                }}
            >
                <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column" }}>
                    {children}
                </FlexWidget>
                {updateUri && (
                    <FlexWidget
                        clickAction="OPEN_URI"
                        clickActionData={{ uri: updateUri }}
                        style={{
                            width: "match_parent",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: t.gold,
                            borderRadius: 10,
                            paddingVertical: 5,
                            marginTop: 6,
                        }}
                    >
                        <SvgWidget
                            svg={lucideSvg("download", "#111111")}
                            style={{ height: 13, width: 13 }}
                        />
                        <TextWidget
                            text="Update available — download latest APK"
                            truncate="END"
                            maxLines={1}
                            style={{ fontSize: 11, fontWeight: "bold", color: "#111111", marginLeft: 6 }}
                        />
                    </FlexWidget>
                )}
            </FlexWidget>
        </OverlapWidget>
    );
};
