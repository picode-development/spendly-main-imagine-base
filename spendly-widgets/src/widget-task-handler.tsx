import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { fetchSummary, fetchTransactions } from "./api";
import {
    getBaseUrl,
    getCachedSummary,
    getCachedTransactions,
    getInstanceConfig,
    getMetrics,
    getToken,
    removeInstanceConfig,
    setCachedSummary,
    setCachedTransactions,
} from "./storage";
import { ActionsWidget } from "./widgets/ActionsWidget";
import { ChartWidget } from "./widgets/ChartWidget";
import { SummaryWidget } from "./widgets/SummaryWidget";
import { TransactionsWidget } from "./widgets/TransactionsWidget";

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
    if (props.widgetAction === "WIDGET_DELETED") {
        await removeInstanceConfig(props.widgetInfo.widgetId);
        return;
    }
    switch (props.widgetAction) {
        case "WIDGET_ADDED":
        case "WIDGET_UPDATE":
        case "WIDGET_RESIZED":
            break;
        default:
            return;
    }

    const widgetName = props.widgetInfo.widgetName;
    const [token, baseUrl] = await Promise.all([getToken(), getBaseUrl()]);

    // The actions widget needs no data or pairing — just the deep links
    if (widgetName === "SpendlyActions") {
        props.renderWidget(<ActionsWidget baseUrl={baseUrl} />);
        return;
    }

    if (!token) {
        props.renderWidget(<SummaryWidget summary={null} metrics={[]} paired={false} />);
        return;
    }

    // Each widget instance can carry its own scope/filters
    const config = await getInstanceConfig(props.widgetInfo.widgetId);

    if (widgetName === "SpendlyTransactions") {
        const cached = await getCachedTransactions();
        const fresh = await fetchTransactions(baseUrl, token, config);
        // Only the unfiltered default feeds the shared offline cache
        if (fresh && !config) await setCachedTransactions(fresh);
        props.renderWidget(
            <TransactionsWidget
                transactions={fresh ?? (config ? null : cached)}
                baseUrl={baseUrl}
                config={config}
            />,
        );
        return;
    }

    const [metrics, cachedSummary] = await Promise.all([getMetrics(), getCachedSummary()]);
    const freshSummary = await fetchSummary(baseUrl, token, config);
    if (freshSummary && !config) await setCachedSummary(freshSummary);
    const summary = freshSummary ?? (config ? null : cachedSummary);

    if (widgetName === "SpendlyChart") {
        props.renderWidget(<ChartWidget summary={summary} baseUrl={baseUrl} />);
        return;
    }

    props.renderWidget(<SummaryWidget summary={summary} metrics={metrics} paired config={config} />);
}
