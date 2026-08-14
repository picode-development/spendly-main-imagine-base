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

// Alpha-blend a hex color toward transparent — 0 = fully transparent,
// 1 = fully opaque. Produces an 8-digit #RRGGBBAA the library's
// convertColor() understands directly.
const withAlpha = (hex: HexColor, alpha: number): HexColor => {
    const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
        .toString(16)
        .padStart(2, "0");
    return `${hex}${a}` as HexColor;
};

// Native background props (backgroundColor / backgroundGradient / border)
// for a widget's outermost container. This renders via Android's own
// GradientDrawable — no image, no rasterization, so it's immune to the
// SvgWidget density bug entirely. Covers 3 of the 4 background styles;
// only "blurGradient" (soft aurora blobs) has no native equivalent and
// still needs an SVG layer — see blurGradientSvg below.
export const nativeBackgroundStyle = (
    mode: WidgetMode = "dark",
    style: BackgroundStyle = "gradient",
    radius = 20,
) => {
    const t = getTheme(mode);
    const borderRadius = radius;

    if (style === "glass") {
        const tint = mode === "dark" ? ("#0f172a" as HexColor) : ("#f8fafc" as HexColor);
        const line = mode === "dark" ? ("#ffffff" as HexColor) : ("#1e3a8a" as HexColor);
        return {
            backgroundColor: withAlpha(tint, 0.45),
            borderColor: withAlpha(line, 0.25),
            borderWidth: 1.5,
            borderRadius,
        } as const;
    }
    if (style === "translucentGradient") {
        return {
            backgroundGradient: {
                from: withAlpha(t.gradientFrom, 0.55),
                to: withAlpha(t.gradientTo, 0.55),
                orientation: "TL_BR",
            },
            borderRadius,
        } as const;
    }
    return {
        backgroundGradient: { from: t.gradientFrom, to: t.gradientTo, orientation: "TL_BR" },
        borderRadius,
    } as const;
};

// blurGradient is the one background style with no native equivalent
// (aurora blobs need vector drawing). Same density-compensation as the
// chart SVGs: viewBox is baked to real device pixels since the native
// SvgWidget renderer ignores container size and density.
export const blurGradientSvg = (w: number, h: number, mode: WidgetMode, density = 1, radius = 20) => {
    const t = getTheme(mode);
    const W = Math.round(w * density);
    const H = Math.round(h * density);
    const R = Math.round(radius * density);
    const blob = (color: string, id: string) =>
        `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
        `<defs>` +
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${t.gradientFrom}"/>` +
        `<stop offset="1" stop-color="${t.gradientTo}"/>` +
        `</linearGradient>` +
        blob(mode === "dark" ? "#3b82f6" : "#93c5fd", "b1") +
        blob(t.gold, "b2") +
        `<clipPath id="clip"><rect x="0" y="0" width="${W}" height="${H}" rx="${R}"/></clipPath>` +
        `</defs>` +
        `<rect x="0" y="0" width="${W}" height="${H}" rx="${R}" fill="url(#g)"/>` +
        `<g clip-path="url(#clip)">` +
        `<circle cx="${(W * 0.22).toFixed(0)}" cy="${(H * 0.15).toFixed(0)}" r="${(Math.max(W, H) * 0.5).toFixed(0)}" fill="url(#b1)"/>` +
        `<circle cx="${(W * 0.85).toFixed(0)}" cy="${(H * 0.9).toFixed(0)}" r="${(Math.max(W, H) * 0.42).toFixed(0)}" fill="url(#b2)"/>` +
        `</g></svg>`;
};
