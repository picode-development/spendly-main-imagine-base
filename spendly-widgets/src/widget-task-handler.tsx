import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { fetchSummary } from "./api";
import {
    getBaseUrl,
    getCachedSummary,
    getMetrics,
    getToken,
    setCachedSummary,
} from "./storage";
import { SummaryWidget } from "./widgets/SummaryWidget";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
    switch (props.widgetAction) {
        case "WIDGET_ADDED":
        case "WIDGET_UPDATE":
        case "WIDGET_RESIZED": {
            const token = await getToken();
            if (!token) {
                props.renderWidget(<SummaryWidget summary={null} metrics={[]} paired={false} />);
                return;
            }

            const [baseUrl, metrics, cached] = await Promise.all([
                getBaseUrl(),
                getMetrics(),
                getCachedSummary(),
            ]);

            const fresh = await fetchSummary(baseUrl, token);
            if (fresh) await setCachedSummary(fresh);

            props.renderWidget(
                <SummaryWidget summary={fresh ?? cached} metrics={metrics} paired />,
            );
            return;
        }
        case "WIDGET_DELETED":
        case "WIDGET_CLICK":
        default:
            return;
    }
}
