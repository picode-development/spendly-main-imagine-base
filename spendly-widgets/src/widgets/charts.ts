import { WidgetSummary } from "../config";
import { getTheme, WidgetMode } from "./theme";

// SVG chart builders mirroring the dashboard's recharts variants (bar /
// line / area over time, donut for the category split).
//
// The native SvgWidget renderer (react-native-android-widget) calls
// AndroidSVG's renderToPicture() with NO target size, so the rasterized
// Picture always comes out at the SVG's own viewBox numbers treated as
// literal device pixels — the widget's real dp size and the phone's
// pixel density are both ignored. To compensate, every builder here bakes
// the actual device-PIXEL size (dp * density) into the viewBox instead of
// dp, so the mis-rasterization coincidentally lands at the correct size.
// Every other absolute constant (font size, stroke width, dot radius...)
// is scaled by the same density so proportions stay correct.

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

type Dims = { w: number; h: number; mode?: WidgetMode; density?: number };

const layout = ({ w, h, density = 1 }: Dims) => ({
    W: Math.round(w * density),
    H: Math.round(h * density),
    TOP: Math.round(6 * density),
    BOTTOM: Math.round(h * density) - Math.round(20 * density),
    d: density,
});

const xLabels = (days: WidgetSummary["days"], dims: Dims) => {
    const C = getTheme(dims.mode);
    const { W, H, d } = layout(dims);
    const slot = W / days.length;
    const every = days.length <= 7 ? 1 : Math.ceil(days.length / 6);
    return days
        .map((d2, i) => {
            if (i % every !== 0) return "";
            const date = new Date(`${d2.date}T00:00:00Z`);
            const label = days.length <= 7 ? DAY_LETTERS[date.getUTCDay()] : String(date.getUTCDate());
            return `<text x="${(slot * i + slot / 2).toFixed(1)}" y="${H - Math.round(6 * d)}" text-anchor="middle" font-size="${(11 * d).toFixed(1)}" fill="${C.label}" font-family="sans-serif">${label}</text>`;
        })
        .join("");
};

const wrap = (inner: string, { w, h, density = 1 }: Dims) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w * density)} ${Math.round(h * density)}" preserveAspectRatio="none">${inner}</svg>`;

export const barChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const C = getTheme(dims.mode);
    const { W, TOP, BOTTOM, d } = layout(dims);
    const slot = W / days.length;
    const barWidth = Math.max(3 * d, Math.min(34 * d, slot * 0.6));
    const max = Math.max(...days.map((day) => day.expenses), 1);
    const bars = days
        .map((day, i) => {
            const h = day.expenses > 0 ? Math.max(6 * d, Math.round((day.expenses / max) * (BOTTOM - TOP))) : 3 * d;
            const x = slot * i + (slot - barWidth) / 2;
            const fill = day.expenses > 0 ? (i === days.length - 1 ? C.gold : C.accent) : C.border;
            return `<rect x="${x.toFixed(1)}" y="${(BOTTOM - h).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(4 * d, barWidth / 2).toFixed(1)}" fill="${fill}"/>`;
        })
        .join("");
    return wrap(bars + xLabels(days, dims), dims);
};

const linePoints = (days: WidgetSummary["days"], dims: Dims) => {
    const { W, TOP, BOTTOM } = layout(dims);
    const slot = W / days.length;
    const max = Math.max(...days.map((day) => day.expenses), 1);
    return days.map((day, i) => ({
        x: slot * i + slot / 2,
        y: BOTTOM - (day.expenses / max) * (BOTTOM - TOP),
    }));
};

export const lineChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const C = getTheme(dims.mode);
    const { d } = layout(dims);
    const pts = linePoints(days, dims);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    return wrap(
        `<path d="${path}" fill="none" stroke="${C.accent}" stroke-width="${(2.5 * d).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="${(4 * d).toFixed(1)}" fill="${C.gold}"/>` +
        xLabels(days, dims),
        dims,
    );
};

export const areaChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const C = getTheme(dims.mode);
    const { BOTTOM, d } = layout(dims);
    const pts = linePoints(days, dims);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${BOTTOM} L${pts[0].x.toFixed(1)} ${BOTTOM} Z`;
    const last = pts[pts.length - 1];
    return wrap(
        `<path d="${area}" fill="${C.accent}" fill-opacity="0.25"/>` +
        `<path d="${line}" fill="none" stroke="${C.accent}" stroke-width="${(2.5 * d).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="${(4 * d).toFixed(1)}" fill="${C.gold}"/>` +
        xLabels(days, dims),
        dims,
    );
};

// Same palette order as the dashboard's category pie
export const CATEGORY_COLORS = ["#60a5fa", "#22c55e", "#f59e0b", "#a855f7"] as const;

// Donut is always called with matching viewBox/container sizes already
// (both use the same `size` value), so it isn't affected by the
// renderToPicture() bug — no density compensation needed here.
export const donutSvg = (categories: { name: string; value: number }[], size = 130) => {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.37;
    const stroke = size * 0.14;
    const total = categories.reduce((a, c) => a + c.value, 0) || 1;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const arcs = categories
        .map((cat, i) => {
            const frac = cat.value / total;
            const len = frac * circumference;
            const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}" stroke-width="${stroke.toFixed(1)}" stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
            offset += len;
            return arc;
        })
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${arcs}</svg>`;
};
