import React from "react";
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { lucideSvg } from "./icons";
import { BackgroundStyle, blurGradientSvg, getTheme, nativeBackgroundStyle, WidgetMode } from "./theme";

// Every widget's frame. Three of the four background styles (gradient,
// translucentGradient, glass) render as native Android GradientDrawable /
// border via plain style props — no image, so the SvgWidget rasterization
// bug (native renderToPicture() ignores container size and device pixel
// density) can't affect them. Only "blurGradient" (soft aurora blobs) has
// no native equivalent and still needs an SVG layer, density-compensated.
type Props = {
    width: number;
    height: number;
    mode?: WidgetMode;
    background?: BackgroundStyle;
    density?: number;
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
    density = 1,
    clickUri,
    padding = 14,
    updateUri,
    children,
}: Props) => {
    const t = getTheme(mode);
    const updateBar = updateUri && (
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
            <SvgWidget svg={lucideSvg("download", "#111111")} style={{ height: 13, width: 13 }} />
            <TextWidget
                text="Update available — download latest APK"
                truncate="END"
                maxLines={1}
                style={{ fontSize: 11, fontWeight: "bold", color: "#111111", marginLeft: 6 }}
            />
        </FlexWidget>
    );

    if (background === "blurGradient") {
        return (
            <OverlapWidget
                {...(clickUri
                    ? { clickAction: "OPEN_URI" as const, clickActionData: { uri: clickUri } }
                    : {})}
                style={{ height: "match_parent", width: "match_parent" }}
            >
                <SvgWidget
                    svg={blurGradientSvg(width, height, mode, density)}
                    style={{ height: "match_parent", width: "match_parent" }}
                />
                <FlexWidget style={{ height: "match_parent", width: "match_parent", padding, flexDirection: "column" }}>
                    <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column" }}>
                        {children}
                    </FlexWidget>
                    {updateBar}
                </FlexWidget>
            </OverlapWidget>
        );
    }

    return (
        <FlexWidget
            {...(clickUri
                ? { clickAction: "OPEN_URI" as const, clickActionData: { uri: clickUri } }
                : {})}
            style={{
                height: "match_parent",
                width: "match_parent",
                padding,
                flexDirection: "column",
                ...nativeBackgroundStyle(mode, background),
            }}
        >
            <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column" }}>
                {children}
            </FlexWidget>
            {updateBar}
        </FlexWidget>
    );
};
