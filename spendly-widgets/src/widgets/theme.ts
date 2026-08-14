export type HexColor = `#${string}`;
export type WidgetMode = "light" | "dark";

export type WidgetTheme = {
    card: HexColor;
    /** Glass surfaces sitting on the gradient, like the site's header cards */
    cardOnGradient: HexColor;
    tileOnGradient: HexColor;
    border: HexColor;
    label: HexColor;
    value: HexColor;
    accent: HexColor;
    expense: HexColor;
    income: HexColor;
    gold: HexColor;
    gradientFrom: HexColor;
    gradientTo: HexColor;
};

// Site header gradients from globals.css: light #1d4ed8→#3b82f6 with white
// content, dark #172554→#1e3a8a with slate content.
const DARK: WidgetTheme = {
    card: "#1e293b",
    cardOnGradient: "#1e293bcc",
    tileOnGradient: "#0f172a99",
    border: "#334155",
    label: "#94a3b8",
    value: "#f8fafc",
    accent: "#60a5fa",
    expense: "#f87171",
    income: "#4ade80",
    gold: "#e3b27a",
    gradientFrom: "#172554",
    gradientTo: "#1e3a8a",
};

const LIGHT: WidgetTheme = {
    card: "#ffffff",
    cardOnGradient: "#ffffff2e",
    tileOnGradient: "#ffffff3d",
    border: "#ffffff59",
    label: "#dbeafe",
    value: "#ffffff",
    accent: "#ffffff",
    expense: "#fecaca",
    income: "#bbf7d0",
    gold: "#fcd34d",
    gradientFrom: "#1d4ed8",
    gradientTo: "#3b82f6",
};

export const getTheme = (mode: WidgetMode = "dark"): WidgetTheme =>
    mode === "light" ? LIGHT : DARK;

// Android picks the right variant with the system theme
export const themedPair = <T,>(render: (mode: WidgetMode) => T): { light: T; dark: T } => ({
    light: render("light"),
    dark: render("dark"),
});

// Kept for code that doesn't vary by mode (defaults to dark)
export const WIDGET_COLORS = DARK;

export type BackgroundStyle = "gradient" | "blurGradient" | "translucentGradient" | "glass";

// Rounded-rect backgrounds painted by an SVG behind each widget's content
// (RemoteViews can't gradient-fill natively; SVG can). Styles:
//  gradient            – the site header gradient, solid
//  blurGradient        – gradient with soft aurora blobs (faked blur via
//                        radial gradients; AndroidSVG has no real filters)
//  translucentGradient – the gradient at ~55% opacity, wallpaper shows through
//  glass               – frosted tint + hairline border, mostly transparent
export const backgroundSvg = (
    w: number,
    h: number,
    mode: WidgetMode = "dark",
    style: BackgroundStyle = "gradient",
    radius = 20,
) => {
    const t = getTheme(mode);
    const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
    const gradientDef = (opacity: number) =>
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${t.gradientFrom}" stop-opacity="${opacity}"/>` +
        `<stop offset="1" stop-color="${t.gradientTo}" stop-opacity="${opacity}"/>` +
        `</linearGradient></defs>`;
    const rect = (fill: string, extra = "") =>
        `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="${fill}"${extra}/>`;

    if (style === "glass") {
        const tint = mode === "dark" ? "#0f172a" : "#f8fafc";
        const line = mode === "dark" ? "#ffffff" : "#1e3a8a";
        return open +
            rect(tint, ' fill-opacity="0.45"') +
            `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${radius - 1}" fill="none" stroke="${line}" stroke-opacity="0.25" stroke-width="1.5"/>` +
            `</svg>`;
    }
    if (style === "translucentGradient") {
        return open + gradientDef(0.55) + rect("url(#g)") + `</svg>`;
    }
    if (style === "blurGradient") {
        const blob = (cx: number, cy: number, r: number, color: string, id: string) =>
            `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
        return open +
            `<defs>` +
            `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${t.gradientFrom}"/>` +
            `<stop offset="1" stop-color="${t.gradientTo}"/>` +
            `</linearGradient>` +
            blob(0, 0, 0, mode === "dark" ? "#3b82f6" : "#93c5fd", "b1") +
            blob(0, 0, 0, t.gold, "b2") +
            `<clipPath id="clip"><rect x="0" y="0" width="${w}" height="${h}" rx="${radius}"/></clipPath>` +
            `</defs>` +
            rect("url(#g)") +
            `<g clip-path="url(#clip)">` +
            `<circle cx="${(w * 0.22).toFixed(0)}" cy="${(h * 0.15).toFixed(0)}" r="${(Math.max(w, h) * 0.5).toFixed(0)}" fill="url(#b1)"/>` +
            `<circle cx="${(w * 0.85).toFixed(0)}" cy="${(h * 0.9).toFixed(0)}" r="${(Math.max(w, h) * 0.42).toFixed(0)}" fill="url(#b2)"/>` +
            `</g></svg>`;
    }
    return open + gradientDef(1) + rect("url(#g)") + `</svg>`;
};

// Back-compat alias
export const gradientBackgroundSvg = (w: number, h: number, mode: WidgetMode = "dark", radius = 20) =>
    backgroundSvg(w, h, mode, "gradient", radius);
