import { WidgetSummary } from "../config";
import { neutralCardText, WidgetMode } from "./theme";

// SVG chart builders that pixel-match the dashboard's real recharts
// variants: bar-variant.tsx, line-variant.tsx, area-variant.tsx,
// radial-variant.tsx. Same colors, same gradient stops, same curve
// treatment (linear for bar/line, Catmull-Rom smoothed for area to mirror
// recharts' type="monotone").
//
// The native SvgWidget renderer (react-native-android-widget) calls
// AndroidSVG's renderToPicture() with NO target size, so the rasterized
// Picture always comes out at the SVG's own viewBox numbers treated as
// literal device pixels — the widget's real dp size and the phone's
// pixel density are both ignored. To compensate, every builder here bakes
// the actual device-PIXEL size (dp * density) into the viewBox instead of
// dp, so the mis-rasterization coincidentally lands at the correct size.
// Every other absolute constant (font size, stroke width...) is scaled by
// the same density so proportions stay correct.

// Hardcoded theme-invariant in bar-variant.tsx / area-variant.tsx — the
// dashboard doesn't branch these by light/dark, so neither do we.
export const CHART_INCOME = "#3d82f6" as const;
export const CHART_EXPENSE = "#f43f5e" as const;

// Same order as radial-variant.tsx's COLORS
export const CATEGORY_COLORS = ["#0062FF", "#12c6ff", "#ff647f", "#ff9354"] as const;

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

type Dims = { w: number; h: number; mode?: WidgetMode; density?: number };
type Point = { x: number; y: number };

const layout = ({ w, h, density = 1 }: Dims) => ({
    W: Math.round(w * density),
    H: Math.round(h * density),
    TOP: Math.round(6 * density),
    BOTTOM: Math.round(h * density) - Math.round(20 * density),
    d: density,
});

const xLabels = (days: WidgetSummary["days"], dims: Dims) => {
    const { label } = neutralCardText(dims.mode);
    const { W, H, d } = layout(dims);
    const slot = W / days.length;
    const every = days.length <= 7 ? 1 : Math.ceil(days.length / 6);
    return days
        .map((day, i) => {
            if (i % every !== 0) return "";
            const date = new Date(`${day.date}T00:00:00Z`);
            const text = days.length <= 7 ? DAY_LETTERS[date.getUTCDay()] : String(date.getUTCDate());
            return `<text x="${(slot * i + slot / 2).toFixed(1)}" y="${H - Math.round(6 * d)}" text-anchor="middle" font-size="${(11 * d).toFixed(1)}" fill="${label}" font-family="sans-serif">${text}</text>`;
        })
        .join("");
};

const wrap = (inner: string, { w, h, density = 1 }: Dims) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w * density)} ${Math.round(h * density)}" preserveAspectRatio="none">${inner}</svg>`;

// Points for one series (income or expenses), scaled against the max of
// BOTH series — matches the dashboard's single shared Y axis.
const seriesPoints = (days: WidgetSummary["days"], dims: Dims, key: "income" | "expenses"): Point[] => {
    const { W, TOP, BOTTOM } = layout(dims);
    const slot = W / days.length;
    const max = Math.max(...days.flatMap((day) => [day.income, day.expenses]), 1);
    return days.map((day, i) => ({
        x: slot * i + slot / 2,
        y: BOTTOM - (day[key] / max) * (BOTTOM - TOP),
    }));
};

const linearPath = (pts: Point[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

// Catmull-Rom → cubic Bezier: smooth curve through every point, the same
// visual character as recharts' type="monotone" (area-variant.tsx only —
// bar/line variants use straight/discrete strokes, so those stay linear).
const smoothPath = (pts: Point[]) => {
    if (pts.length < 2) return pts[0] ? `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}` : "";
    if (pts.length === 2) return linearPath(pts);
    let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i === 0 ? i : i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
};

// bar-variant.tsx: two grouped bars per day, square corners, no highlight.
export const barChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const { W, TOP, BOTTOM, d } = layout(dims);
    const slot = W / days.length;
    const groupW = Math.min(slot * 0.7, 40 * d);
    const barW = Math.max(2 * d, groupW / 2 - d);
    const gap = Math.max(d, groupW - barW * 2);
    const max = Math.max(...days.flatMap((day) => [day.income, day.expenses]), 1);
    const bars = days
        .map((day, i) => {
            const groupX = slot * i + (slot - groupW) / 2;
            const incomeH = day.income > 0 ? Math.max(2 * d, Math.round((day.income / max) * (BOTTOM - TOP))) : 0;
            const expenseH = day.expenses > 0 ? Math.max(2 * d, Math.round((day.expenses / max) * (BOTTOM - TOP))) : 0;
            const incomeRect = incomeH > 0
                ? `<rect x="${groupX.toFixed(1)}" y="${(BOTTOM - incomeH).toFixed(1)}" width="${barW.toFixed(1)}" height="${incomeH.toFixed(1)}" fill="${CHART_INCOME}"/>`
                : "";
            const expenseX = groupX + barW + gap;
            const expenseRect = expenseH > 0
                ? `<rect x="${expenseX.toFixed(1)}" y="${(BOTTOM - expenseH).toFixed(1)}" width="${barW.toFixed(1)}" height="${expenseH.toFixed(1)}" fill="${CHART_EXPENSE}"/>`
                : "";
            return incomeRect + expenseRect;
        })
        .join("");
    return wrap(bars + xLabels(days, dims), dims);
};

// line-variant.tsx: straight linear segments, no dots, stroke-width 2.
export const lineChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const { d } = layout(dims);
    const incomePts = seriesPoints(days, dims, "income");
    const expensePts = seriesPoints(days, dims, "expenses");
    return wrap(
        `<path d="${linearPath(incomePts)}" fill="none" stroke="${CHART_INCOME}" stroke-width="${(2 * d).toFixed(1)}"/>` +
        `<path d="${linearPath(expensePts)}" fill="none" stroke="${CHART_EXPENSE}" stroke-width="${(2 * d).toFixed(1)}"/>` +
        xLabels(days, dims),
        dims,
    );
};

// area-variant.tsx: monotone-smoothed gradient fills, 2%/98% stops at
// 0.8→0 opacity, stroke-width 2. Income renders first (behind), expenses
// on top — same z-order as the JSX.
export const areaChartSvg = (days: WidgetSummary["days"], dims: Dims) => {
    const { BOTTOM, d } = layout(dims);
    const incomePts = seriesPoints(days, dims, "income");
    const expensePts = seriesPoints(days, dims, "expenses");
    const incomeLine = smoothPath(incomePts);
    const expenseLine = smoothPath(expensePts);
    const closeArea = (line: string, pts: Point[]) =>
        `${line} L${pts[pts.length - 1].x.toFixed(1)} ${BOTTOM} L${pts[0].x.toFixed(1)} ${BOTTOM} Z`;
    const gradient = (id: string, color: string) =>
        `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="2%" stop-color="${color}" stop-opacity="0.8"/>` +
        `<stop offset="98%" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`;
    return wrap(
        `<defs>${gradient("incomeFill", CHART_INCOME)}${gradient("expenseFill", CHART_EXPENSE)}</defs>` +
        `<path d="${closeArea(incomeLine, incomePts)}" fill="url(#incomeFill)"/>` +
        `<path d="${incomeLine}" fill="none" stroke="${CHART_INCOME}" stroke-width="${(2 * d).toFixed(1)}"/>` +
        `<path d="${closeArea(expenseLine, expensePts)}" fill="url(#expenseFill)"/>` +
        `<path d="${expenseLine}" fill="none" stroke="${CHART_EXPENSE}" stroke-width="${(2 * d).toFixed(1)}"/>` +
        xLabels(days, dims),
        dims,
    );
};

// pie-variant.tsx: a true donut — ONE ring split into arc segments sized
// by each category's SHARE OF THE TOTAL (not per-category rings like
// radialSvg below). innerRadius/outerRadius ratio matches pie-variant.tsx
// (60/90), 2° gaps between segments, no stroke, starts at 12 o'clock.
export const donutSvg = (categories: { name: string; value: number }[], size = 130, mode: WidgetMode = "dark") => {
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size / 2;
    const innerR = outerR * (60 / 90);
    const total = categories.reduce((a, c) => a + c.value, 0) || 1;

    // A single category can't be drawn as a degenerate 360° path arc —
    // render it as a plain stroked ring instead.
    if (categories.length === 1) {
        const r = (outerR + innerR) / 2;
        const color = CATEGORY_COLORS[0];
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(outerR - innerR).toFixed(1)}"/></svg>`;
    }

    const padAngle = 2;
    let angle = -90; // 12 o'clock, sweeping clockwise
    const point = (r: number, a: number) => ({ x: cx + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
    const arcs = categories
        .map((cat, i) => {
            const sweep = (cat.value / total) * 360 - padAngle;
            if (sweep <= 0) { angle += padAngle; return ""; }
            const large = sweep > 180 ? 1 : 0;
            const o0 = point(outerR, angle);
            const o1 = point(outerR, angle + sweep);
            const i0 = point(innerR, angle);
            const i1 = point(innerR, angle + sweep);
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            const d = `M${o0.x.toFixed(1)} ${o0.y.toFixed(1)} A${outerR.toFixed(1)} ${outerR.toFixed(1)} 0 ${large} 1 ${o1.x.toFixed(1)} ${o1.y.toFixed(1)} L${i1.x.toFixed(1)} ${i1.y.toFixed(1)} A${innerR.toFixed(1)} ${innerR.toFixed(1)} 0 ${large} 0 ${i0.x.toFixed(1)} ${i0.y.toFixed(1)} Z`;
            angle += sweep + padAngle;
            return `<path d="${d}" fill="${color}"/>`;
        })
        .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${arcs}</svg>`;
};

// radar-variant.tsx: a polygon plot — one vertex per category, spoked
// evenly around the circle, distance from center proportional to the
// category's value relative to the MAX (recharts' default radar domain —
// same "no explicit domain, auto [0, dataMax]" behavior the desktop chart
// uses, so this matches it exactly rather than inventing a different
// scale). Radial gradient fill mirrors the dashboard's two color stops.
// A radar chart's own math biases toward whichever category is largest —
// that's inherent to the chart type (comparing multiple entities across
// shared axes), not something this function gets to fix; the desktop
// chart has the exact same shape on the exact same data, just with more
// room. Colored dots at each vertex — matching the legend's dot colors —
// let a category be identified by its exact point without needing SVG
// text rendering, which nothing else in this file relies on and hasn't
// been verified to render correctly through this library's Android
// rasterizer. CategoriesWidget lays real TextWidget name labels around
// this (compass-position grid, not per-pixel coordinates — see its
// comment), using components already proven to render correctly here
// (see its center-total overlay).
export const radarSvg = (categories: { name: string; value: number }[], size = 130, mode: WidgetMode = "dark") => {
    const { track } = neutralCardText(mode);
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - 4;
    const n = categories.length;
    if (n < 3) {
        // A 1-2 point "polygon" is degenerate — fall back to the donut so
        // there's still something meaningful to look at.
        return donutSvg(categories, size, mode);
    }
    const maxValue = Math.max(...categories.map((c) => c.value), 1);
    const vertex = (i: number, frac: number) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { x: cx + R * frac * Math.cos(a), y: cy + R * frac * Math.sin(a) };
    };
    const polygon = (frac: number) =>
        Array.from({ length: n }, (_, i) => { const p = vertex(i, frac); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
    const grid = [0.33, 0.66, 1]
        .map((f) => `<polygon points="${polygon(f)}" fill="none" stroke="${track}" stroke-width="1"/>`)
        .join("");
    const gradientStops = mode === "dark"
        ? [["0%", "#60a5fa", 0.13], ["80%", "#38bdf8", 0.28], ["100%", "#3b82f6", 0.42]] as const
        : [["0%", "#3b82f6", 0.18], ["80%", "#3b82f6", 0.32], ["100%", "#2563eb", 0.45]] as const;
    const gradientId = `radarFill_${mode}`;
    const gradientDef = `<radialGradient id="${gradientId}" cx="50%" cy="50%" r="80%"><stop offset="${gradientStops[0][0]}" stop-color="${gradientStops[0][1]}" stop-opacity="${gradientStops[0][2]}"/><stop offset="${gradientStops[1][0]}" stop-color="${gradientStops[1][1]}" stop-opacity="${gradientStops[1][2]}"/><stop offset="${gradientStops[2][0]}" stop-color="${gradientStops[2][1]}" stop-opacity="${gradientStops[2][2]}"/></radialGradient>`;
    const strokeColor = mode === "dark" ? "#38bdf8" : "#3b82f6";
    const dataPoints = categories
        .map((cat, i) => { const p = vertex(i, Math.max(0.04, cat.value / maxValue)); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; })
        .join(" ");
    const dots = categories
        .map((cat, i) => {
            const p = vertex(i, Math.max(0.04, cat.value / maxValue));
            return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"/>`;
        })
        .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><defs>${gradientDef}</defs>${grid}<polygon points="${dataPoints}" fill="url(#${gradientId})" fill-opacity="1" stroke="${strokeColor}" stroke-width="1.5" stroke-opacity="0.7"/>${dots}</svg>`;
};

// radial-variant.tsx: one concentric ring PER category (not a donut split
// into arc segments) — each ring's sweep is proportional to its value
// relative to the MAX category value (recharts' default RadialBarChart
// domain), not to the total. innerRadius="90%"/outerRadius="40%" band,
// barSize~10, cornerRadius rounding via stroke-linecap.
//
// Always called with matching viewBox/container sizes (like the old
// donut), so it isn't affected by the renderToPicture() bug.
export const radialSvg = (categories: { name: string; value: number }[], size = 130, mode: WidgetMode = "dark") => {
    const { track } = neutralCardText(mode);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2;
    const outerR = maxR * 0.9;
    const innerR = maxR * 0.4;
    const n = Math.max(1, categories.length);
    const band = outerR - innerR;
    const gap = Math.min(3, band / (n * 4));
    const thickness = Math.max(3, band / n - gap);
    const maxValue = Math.max(...categories.map((c) => c.value), 1);

    const rings = categories
        .map((cat, i) => {
            const r = outerR - thickness / 2 - i * (thickness + gap);
            const circumference = 2 * Math.PI * r;
            const frac = Math.min(1, cat.value / maxValue);
            const len = frac * circumference;
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
            const bg = `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${track}" stroke-width="${thickness.toFixed(1)}"/>`;
            const arc = frac > 0
                ? `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${thickness.toFixed(1)}" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
                : "";
            return bg + arc;
        })
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${rings}</svg>`;
};
