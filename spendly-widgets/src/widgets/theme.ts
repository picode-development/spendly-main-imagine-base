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

// Rounded-rect gradient painted by an SVG behind each widget's content
// (RemoteViews can't gradient-fill natively; SVG can)
export const gradientBackgroundSvg = (
    w: number,
    h: number,
    mode: WidgetMode = "dark",
    radius = 20,
) => {
    const t = getTheme(mode);
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${t.gradientFrom}"/>` +
        `<stop offset="1" stop-color="${t.gradientTo}"/>` +
        `</linearGradient></defs>` +
        `<rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="url(#g)"/></svg>`
    );
};
