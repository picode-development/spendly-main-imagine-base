import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { WidgetPreview } from "react-native-android-widget";
import { fetchSummary, fetchTransactions, pair } from "./api";
import {
    BACKGROUND_OPTIONS,
    WIDGET_STYLES,
    WidgetInstanceConfig,
    WidgetSummary,
    WidgetTransaction,
} from "./config";
import {
    getBaseUrl,
    getInstanceConfig,
    getMetrics,
    getToken,
    setInstanceConfig,
} from "./storage";
import { Button, Card, CardTitle, Field, Hint, Select, UI } from "./ui";
import { CategoriesWidget } from "./widgets/CategoriesWidget";
import { ChartWidget } from "./widgets/ChartWidget";
import { SummaryWidget } from "./widgets/SummaryWidget";
import { themedPair } from "./widgets/theme";
import { TransactionsWidget } from "./widgets/TransactionsWidget";

const SCOPE_OPTIONS = [
    { value: "week", label: "Last 7 days" },
    { value: "month", label: "This month" },
    { value: "all", label: "All time" },
    { value: "custom", label: "Custom date range" },
];

const DIRECTION_OPTIONS = [
    { value: "all", label: "Everything" },
    { value: "income", label: "Income only" },
    { value: "expense", label: "Expenses only" },
];

const SORT_OPTIONS = [
    { value: "date", label: "Newest first" },
    { value: "amount", label: "Biggest first" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Android widget configuration screen: opens when a configurable widget is
// added or long-press → reconfigured. Shows a live preview, saves
// per-widgetId settings, redraws that one widget, and finishes.
export const ConfigScreen = ({
    widgetInfo,
    renderWidget,
    setResult,
}: WidgetConfigurationScreenProps) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [paired, setPaired] = useState(true);
    const [baseUrl, setBaseUrl] = useState("");
    const [token, setToken] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof getMetrics>>>([]);
    const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

    const [scope, setScope] = useState<WidgetInstanceConfig["scope"]>("week");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [accountId, setAccountId] = useState<string | undefined>(undefined);
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
    const [direction, setDirection] = useState<NonNullable<WidgetInstanceConfig["direction"]>>("all");
    const [sort, setSort] = useState<NonNullable<WidgetInstanceConfig["sort"]>>("date");
    const [style, setStyle] = useState<string | undefined>(undefined);
    const [background, setBackground] = useState<NonNullable<WidgetInstanceConfig["background"]>>("gradient");

    const [previewSummary, setPreviewSummary] = useState<WidgetSummary | null>(null);
    const [previewRows, setPreviewRows] = useState<WidgetTransaction[] | null>(null);

    const widgetName = widgetInfo.widgetName;
    const isTransactionsWidget = widgetName === "SpendlyTransactions";
    const styleOptions = WIDGET_STYLES[widgetName] ?? [];

    const customValid =
        scope !== "custom" || (DATE_RE.test(from) && DATE_RE.test(to) && from <= to);

    const draftConfig = useMemo((): WidgetInstanceConfig => ({
        scope,
        from: scope === "custom" && DATE_RE.test(from) ? from : undefined,
        to: scope === "custom" && DATE_RE.test(to) ? to : undefined,
        accountId,
        accountName: accounts.find((a) => a.id === accountId)?.name,
        categoryId,
        categoryName: categories.find((c) => c.id === categoryId)?.name,
        direction: isTransactionsWidget && direction !== "all" ? direction : undefined,
        sort: isTransactionsWidget && sort !== "date" ? sort : undefined,
        style,
        background,
    }), [scope, from, to, accountId, categoryId, direction, sort, style, background, accounts, categories, isTransactionsWidget]);

    useEffect(() => {
        (async () => {
            const [storedToken, storedUrl, existing, storedMetrics] = await Promise.all([
                getToken(),
                getBaseUrl(),
                getInstanceConfig(widgetInfo.widgetId),
                getMetrics(),
            ]);
            setBaseUrl(storedUrl);
            setMetrics(storedMetrics);
            if (!storedToken) {
                setPaired(false);
                setLoading(false);
                return;
            }
            setToken(storedToken);
            if (existing) {
                setScope(existing.scope);
                setFrom(existing.from ?? "");
                setTo(existing.to ?? "");
                setAccountId(existing.accountId);
                setCategoryId(existing.categoryId);
                setDirection(existing.direction ?? "all");
                setSort(existing.sort ?? "date");
                setStyle(existing.style);
                setBackground(existing.background ?? "gradient");
            }
            const result = await pair(storedUrl, storedToken);
            if (result.ok) {
                setAccounts(result.accounts);
                setCategories(result.categories);
            }
            setLoading(false);
        })();
    }, [widgetInfo.widgetId]);

    // Live preview data: refetch when scope-affecting fields settle
    useEffect(() => {
        if (!token || !baseUrl || !customValid) return;
        const timer = setTimeout(async () => {
            if (isTransactionsWidget) {
                setPreviewRows(await fetchTransactions(baseUrl, token, draftConfig));
            } else {
                setPreviewSummary(await fetchSummary(baseUrl, token, draftConfig));
            }
        }, 350);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, baseUrl, scope, from, to, accountId, categoryId, direction, sort, customValid]);

    const renderPreviewWidget = useCallback((d: { width: number; height: number }) => {
        switch (widgetName) {
            case "SpendlyChart":
                return <ChartWidget summary={previewSummary} baseUrl={baseUrl} config={draftConfig} width={d.width} height={d.height} />;
            case "SpendlyCategories":
                return <CategoriesWidget summary={previewSummary} baseUrl={baseUrl} config={draftConfig} width={d.width} height={d.height} />;
            case "SpendlyTransactions":
                return <TransactionsWidget transactions={previewRows} baseUrl={baseUrl} config={draftConfig} width={d.width} height={d.height} />;
            default:
                return <SummaryWidget summary={previewSummary} metrics={metrics} paired config={draftConfig} width={d.width} height={d.height} />;
        }
    }, [widgetName, previewSummary, previewRows, baseUrl, draftConfig, metrics]);

    const handleSave = async () => {
        setSaving(true);
        await setInstanceConfig(widgetInfo.widgetId, draftConfig);
        const dims = { width: widgetInfo.width, height: widgetInfo.height };
        if (token) {
            if (isTransactionsWidget) {
                const rows = await fetchTransactions(baseUrl, token, draftConfig, 30);
                renderWidget(themedPair((mode) => (
                    <TransactionsWidget transactions={rows} baseUrl={baseUrl} config={draftConfig} mode={mode} {...dims} />
                )));
            } else {
                const summary = await fetchSummary(baseUrl, token, draftConfig);
                renderWidget(themedPair((mode) =>
                    widgetName === "SpendlyChart"
                        ? <ChartWidget summary={summary} baseUrl={baseUrl} config={draftConfig} mode={mode} {...dims} />
                        : widgetName === "SpendlyCategories"
                            ? <CategoriesWidget summary={summary} baseUrl={baseUrl} config={draftConfig} mode={mode} {...dims} />
                            : <SummaryWidget summary={summary} metrics={metrics} paired config={draftConfig} mode={mode} {...dims} />,
                ));
            }
        }
        setResult("ok");
    };

    if (loading) {
        return (
            <View style={[styles.screen, styles.center]}>
                <ActivityIndicator color={UI.accent} />
            </View>
        );
    }

    if (!paired) {
        return (
            <View style={[styles.screen, styles.center, { padding: 24, gap: 12 }]}>
                <Text style={styles.title}>Not paired yet</Text>
                <Hint>
                    Open the Spendly Widgets app first and enter your pairing code, then
                    add the widget again.
                </Hint>
                <Button onPress={() => setResult("cancel")}>Close</Button>
            </View>
        );
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Widget settings</Text>
            <Hint>
                Applies only to this widget — every copy you add can have its own view.
            </Hint>

            <View style={styles.previewWrap}>
                <WidgetPreview
                    renderWidget={renderPreviewWidget}
                    width={320}
                    height={widgetName === "SpendlyTransactions" ? 220 : 150}
                />
            </View>

            <Card>
                <CardTitle>Style</CardTitle>
                {styleOptions.length > 0 && (
                    <Select
                        value={style ?? styleOptions[0]?.key}
                        options={styleOptions.map((s) => ({ value: s.key, label: s.label }))}
                        onChange={setStyle}
                    />
                )}
                <Select
                    value={background}
                    options={BACKGROUND_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
                    onChange={(v) => setBackground(v as typeof background)}
                />
            </Card>

            <Card>
                <CardTitle>Time period</CardTitle>
                <Select
                    value={scope}
                    options={SCOPE_OPTIONS}
                    onChange={(v) => setScope(v as WidgetInstanceConfig["scope"])}
                />
                {scope === "custom" && (
                    <View style={{ gap: 8 }}>
                        <Field
                            value={from}
                            onChangeText={setFrom}
                            placeholder="From (YYYY-MM-DD)"
                            autoCapitalize="none"
                        />
                        <Field
                            value={to}
                            onChangeText={setTo}
                            placeholder="To (YYYY-MM-DD)"
                            autoCapitalize="none"
                        />
                        <Hint>Use the same date in both fields for a single day.</Hint>
                    </View>
                )}
            </Card>

            <Card>
                <CardTitle>Filters</CardTitle>
                <Select
                    value={accountId ?? "__all__"}
                    options={[
                        { value: "__all__", label: "All accounts" },
                        ...accounts.map((a) => ({ value: a.id, label: a.name.trim() })),
                    ]}
                    onChange={(v) => setAccountId(v === "__all__" ? undefined : v)}
                />
                <Select
                    value={categoryId ?? "__all__"}
                    options={[
                        { value: "__all__", label: "All categories" },
                        ...categories.map((c) => ({ value: c.id, label: c.name.trim() })),
                    ]}
                    onChange={(v) => setCategoryId(v === "__all__" ? undefined : v)}
                />
                {isTransactionsWidget && (
                    <>
                        <Select
                            value={direction}
                            options={DIRECTION_OPTIONS}
                            onChange={(v) => setDirection(v as typeof direction)}
                        />
                        <Select
                            value={sort}
                            options={SORT_OPTIONS}
                            onChange={(v) => setSort(v as typeof sort)}
                        />
                    </>
                )}
            </Card>

            <Button onPress={handleSave} disabled={!customValid || saving}>
                {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onPress={() => setResult("cancel")} disabled={saving}>
                Cancel
            </Button>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: UI.bg },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: 20, paddingTop: 48, gap: 14 },
    title: { color: UI.text, fontSize: 22, fontWeight: "700" },
    previewWrap: { alignItems: "center", marginVertical: 4 },
});
