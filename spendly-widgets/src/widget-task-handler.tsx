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
import { fetchLatestVersion, updateUriIfNewer } from "./version";
import { ActionsWidget } from "./widgets/ActionsWidget";
import { CategoriesWidget } from "./widgets/CategoriesWidget";
import { ChartWidget } from "./widgets/ChartWidget";
import { SummaryWidget } from "./widgets/SummaryWidget";
import { themedPair } from "./widgets/theme";
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
    // Real widget size in dp — layouts fill it and adapt on resize.
    // density compensates for the native SvgWidget renderer rasterizing
    // content at raw viewBox numbers, ignoring both container size and
    // device pixel density (see widgets/charts.ts).
    const { width, height } = props.widgetInfo;
    const density = props.widgetInfo.screenInfo.density;
    const [token, baseUrl] = await Promise.all([getToken(), getBaseUrl()]);

    // Newer APK published? Every widget shows the gold update bar
    const latest = await fetchLatestVersion(baseUrl);
    const updateUri = updateUriIfNewer(baseUrl, latest);

    // The actions widget needs no data or pairing — just the deep links
    if (widgetName === "SpendlyActions") {
        props.renderWidget(themedPair((mode) => (
            <ActionsWidget baseUrl={baseUrl} width={width} height={height} mode={mode} updateUri={updateUri} />
        )));
        return;
    }

    if (!token) {
        props.renderWidget(themedPair((mode) => (
            <SummaryWidget summary={null} metrics={[]} paired={false} width={width} height={height} mode={mode} density={density} updateUri={updateUri} />
        )));
        return;
    }

    // Each widget instance can carry its own scope/filters
    const config = await getInstanceConfig(props.widgetInfo.widgetId);

    if (widgetName === "SpendlyTransactions") {
        const cached = await getCachedTransactions();
        const fresh = await fetchTransactions(baseUrl, token, config, 30);
        // Only the unfiltered default feeds the shared offline cache
        if (fresh && !config) await setCachedTransactions(fresh);
        props.renderWidget(themedPair((mode) => (
            <TransactionsWidget
                transactions={fresh ?? (config ? null : cached)}
                baseUrl={baseUrl}
                config={config}
                width={width}
                height={height}
                mode={mode}
                density={density}
                updateUri={updateUri}
            />
        )));
        return;
    }

    const [metrics, cachedSummary] = await Promise.all([getMetrics(), getCachedSummary()]);
    const freshSummary = await fetchSummary(baseUrl, token, config);
    if (freshSummary && !config) await setCachedSummary(freshSummary);
    const summary = freshSummary ?? (config ? null : cachedSummary);

    if (widgetName === "SpendlyChart") {
        props.renderWidget(themedPair((mode) => (
            <ChartWidget summary={summary} baseUrl={baseUrl} config={config} width={width} height={height} mode={mode} density={density} updateUri={updateUri} />
        )));
        return;
    }

    if (widgetName === "SpendlyCategories") {
        props.renderWidget(themedPair((mode) => (
            <CategoriesWidget summary={summary} baseUrl={baseUrl} config={config} width={width} height={height} mode={mode} density={density} updateUri={updateUri} />
        )));
        return;
    }

    props.renderWidget(themedPair((mode) => (
        <SummaryWidget summary={summary} metrics={metrics} paired config={config} width={width} height={height} mode={mode} density={density} updateUri={updateUri} />
    )));
}
