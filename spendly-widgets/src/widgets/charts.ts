import { WidgetSummary } from "../config";
import { WIDGET_COLORS as C } from "./theme";

// SVG chart builders mirroring the dashboard's recharts variants (bar /
// line / area over time, donut for the category split). RemoteViews can't
// run recharts, but the SVGs use the same colors and shapes.

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const W = 320;
const H = 130;
const TOP = 8;
const BOTTOM = H - 26;

const xLabels = (days: WidgetSummary["days"]) => {
    const slot = W / days.length;
    const every = days.length <= 7 ? 1 : Math.ceil(days.length / 6);
    return days
        .map((d, i) => {
            if (i % every !== 0) return "";
            const date = new Date(`${d.date}T00:00:00Z`);
            const label = days.length <= 7 ? DAY_LETTERS[date.getUTCDay()] : String(date.getUTCDate());
            return `<text x="${(slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${C.label}" font-family="sans-serif">${label}</text>`;
        })
        .join("");
};

const wrap = (inner: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${inner}</svg>`;

export const barChartSvg = (days: WidgetSummary["days"]) => {
    const slot = W / days.length;
    const barWidth = Math.max(3, Math.min(30, slot * 0.55));
    const max = Math.max(...days.map((d) => d.expenses), 1);
    const bars = days
        .map((d, i) => {
            const h = d.expenses > 0 ? Math.max(6, Math.round((d.expenses / max) * (BOTTOM - TOP))) : 3;
            const x = slot * i + (slot - barWidth) / 2;
            const fill = d.expenses > 0 ? (i === days.length - 1 ? C.gold : C.accent) : C.border;
            return `<rect x="${x.toFixed(1)}" y="${BOTTOM - h}" width="${barWidth.toFixed(1)}" height="${h}" rx="${Math.min(4, barWidth / 2).toFixed(1)}" fill="${fill}"/>`;
        })
        .join("");
    return wrap(bars + xLabels(days));
};

const linePoints = (days: WidgetSummary["days"]) => {
    const slot = W / days.length;
    const max = Math.max(...days.map((d) => d.expenses), 1);
    return days.map((d, i) => ({
        x: slot * i + slot / 2,
        y: BOTTOM - (d.expenses / max) * (BOTTOM - TOP),
    }));
};

export const lineChartSvg = (days: WidgetSummary["days"]) => {
    const pts = linePoints(days);
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    return wrap(
        `<path d="${path}" fill="none" stroke="${C.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="${C.gold}"/>` +
        xLabels(days),
    );
};

export const areaChartSvg = (days: WidgetSummary["days"]) => {
    const pts = linePoints(days);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${BOTTOM} L${pts[0].x.toFixed(1)} ${BOTTOM} Z`;
    const last = pts[pts.length - 1];
    return wrap(
        `<path d="${area}" fill="${C.accent}" fill-opacity="0.25"/>` +
        `<path d="${line}" fill="none" stroke="${C.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="${C.gold}"/>` +
        xLabels(days),
    );
};

// Same palette order as the dashboard's category pie
export const CATEGORY_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7"] as const;

export const donutSvg = (categories: { name: string; value: number }[]) => {
    const size = 130;
    const cx = size / 2;
    const cy = size / 2;
    const r = 48;
    const stroke = 18;
    const total = categories.reduce((a, c) => a + c.value, 0) || 1;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const arcs = categories
        .map((cat, i) => {
            const frac = cat.value / total;
            const len = frac * circumference;
            const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`;
            offset += len;
            return arc;
        })
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${arcs}</svg>`;
};
