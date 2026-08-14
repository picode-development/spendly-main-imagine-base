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
const RADIUS = 20;

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
    const clickAction = clickUri
        ? { clickAction: "OPEN_URI" as const, clickActionData: { uri: clickUri } }
        : {};
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

    // On any translucent/glass/blurred background, text needs its own
    // opaque-enough surface behind it — the shell alone can't guarantee
    // legibility over an arbitrary wallpaper. Solid "gradient" doesn't
    // need this since it's fully opaque already.
    const needsScrim = background !== "gradient";
    const content = needsScrim ? (
        <FlexWidget
            style={{
                flex: 1,
                width: "match_parent",
                flexDirection: "column",
                backgroundColor: t.cardOnGradient,
                borderRadius: RADIUS - 6,
                padding: 8,
            }}
        >
            {children}
        </FlexWidget>
    ) : (
        <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column" }}>
            {children}
        </FlexWidget>
    );

    if (background === "blurGradient") {
        return (
            <OverlapWidget
                {...clickAction}
                style={{ height: "match_parent", width: "match_parent", borderRadius: RADIUS, overflow: "hidden" }}
            >
                <SvgWidget
                    svg={blurGradientSvg(width, height, mode, density)}
                    style={{ height: "match_parent", width: "match_parent" }}
                />
                <FlexWidget style={{ height: "match_parent", width: "match_parent", padding, flexDirection: "column" }}>
                    {content}
                    {updateBar}
                </FlexWidget>
            </OverlapWidget>
        );
    }

    return (
        <FlexWidget
            {...clickAction}
            style={{
                height: "match_parent",
                width: "match_parent",
                padding,
                flexDirection: "column",
                ...nativeBackgroundStyle(mode, background, RADIUS),
            }}
        >
            {content}
            {updateBar}
        </FlexWidget>
    );
};
