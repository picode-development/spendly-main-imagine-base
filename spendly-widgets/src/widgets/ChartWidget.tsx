import React from "react";
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import { WidgetSummary } from "../config";
import { formatINR } from "../format";
import { WIDGET_COLORS as C } from "./theme";

// 7-day spending bar chart drawn as an SVG string (RemoteViews can't run
// a charting library, but the widget host renders SVG natively).
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const buildChartSvg = (days: WidgetSummary["days"]) => {
    const W = 320;
    const H = 130;
    const chartTop = 8;
    const chartBottom = H - 26; // room for day labels
    const maxBarHeight = chartBottom - chartTop;
    const slot = W / days.length;
    const barWidth = Math.max(3, Math.min(30, slot * 0.55));
    const max = Math.max(...days.map((d) => d.expenses), 1);
    // ≤7 bars → weekday letters under every bar; longer ranges → the day of
    // the month under every few bars
    const labelEvery = days.length <= 7 ? 1 : Math.ceil(days.length / 6);

    const bars = days
        .map((d, i) => {
            const h = d.expenses > 0
                ? Math.max(6, Math.round((d.expenses / max) * maxBarHeight))
                : 3;
            const x = slot * i + (slot - barWidth) / 2;
            const y = chartBottom - h;
            const isLast = i === days.length - 1;
            const fill = d.expenses > 0 ? (isLast ? C.gold : C.accent) : C.border;
            const date = new Date(`${d.date}T00:00:00Z`);
            const label = days.length <= 7
                ? DAY_LETTERS[date.getUTCDay()]
                : String(date.getUTCDate());
            const labelSvg = i % labelEvery === 0
                ? `<text x="${(slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${C.label}" font-family="sans-serif">${label}</text>`
                : "";
            return `
    <rect x="${x.toFixed(1)}" y="${y}" width="${barWidth.toFixed(1)}" height="${h}" rx="${Math.min(4, barWidth / 2).toFixed(1)}" fill="${fill}" />
    ${labelSvg}`;
        })
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${bars}
</svg>`;
};

type Props = { summary: WidgetSummary | null; baseUrl: string };

export const ChartWidget = ({ summary, baseUrl }: Props) => (
    <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: baseUrl }}
        style={{
            height: "match_parent",
            width: "match_parent",
            backgroundColor: C.bg,
            borderRadius: 20,
            padding: 14,
            flexDirection: "column",
        }}
    >
        <FlexWidget
            style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: "match_parent",
            }}
        >
            <TextWidget
                text={[
                    summary?.scoped?.label ?? "Last 7 days",
                    summary?.accountName?.trim(),
                ].filter(Boolean).join(" · ")}
                style={{ fontSize: 12, fontWeight: "bold", color: C.accent }}
            />
            <TextWidget
                text={summary
                    ? `${formatINR(summary.scoped?.expenses ?? summary.monthExpenses)} spent`
                    : "offline"}
                style={{ fontSize: 12, color: C.label }}
            />
        </FlexWidget>

        {summary ? (
            <FlexWidget style={{ flex: 1, width: "match_parent", marginTop: 6 }}>
                <SvgWidget
                    svg={buildChartSvg(summary.days)}
                    style={{ width: "match_parent", height: "match_parent" }}
                />
            </FlexWidget>
        ) : (
            <TextWidget
                text="Open the app to refresh"
                style={{ fontSize: 12, color: C.label, marginTop: 12 }}
            />
        )}
    </FlexWidget>
);
