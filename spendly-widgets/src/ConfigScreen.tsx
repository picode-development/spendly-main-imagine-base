import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import type { WidgetConfigurationScreenProps } from "react-native-android-widget";
import { fetchSummary, fetchTransactions, pair } from "./api";
import {
    DEFAULT_INSTANCE_CONFIG,
    WidgetInstanceConfig,
} from "./config";
import {
    getBaseUrl,
    getInstanceConfig,
    getMetrics,
    getToken,
    setInstanceConfig,
} from "./storage";
import { ChartWidget } from "./widgets/ChartWidget";
import { SummaryWidget } from "./widgets/SummaryWidget";
import { TransactionsWidget } from "./widgets/TransactionsWidget";

const COLORS = {
    bg: "#0f172a",
    card: "#1e293b",
    border: "#334155",
    label: "#94a3b8",
    text: "#f8fafc",
    accent: "#3b82f6",
    danger: "#f87171",
};

const SCOPES: { key: WidgetInstanceConfig["scope"]; label: string }[] = [
    { key: "week", label: "Last 7 days" },
    { key: "month", label: "This month" },
    { key: "all", label: "All time" },
    { key: "custom", label: "Date range" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Android widget configuration screen: opens when a configurable widget is
// added or long-press → reconfigured. Saves per-widgetId settings, redraws
// that one widget, and finishes.
export const ConfigScreen = ({
    widgetInfo,
    renderWidget,
    setResult,
}: WidgetConfigurationScreenProps) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [paired, setPaired] = useState(true);
    const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [scope, setScope] = useState<WidgetInstanceConfig["scope"]>("week");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [accountId, setAccountId] = useState<string | undefined>(undefined);
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
    const [direction, setDirection] = useState<NonNullable<WidgetInstanceConfig["direction"]>>("all");
    const [sort, setSort] = useState<NonNullable<WidgetInstanceConfig["sort"]>>("date");

    const isTransactionsWidget = widgetInfo.widgetName === "SpendlyTransactions";

    useEffect(() => {
        (async () => {
            const [token, baseUrl, existing] = await Promise.all([
                getToken(),
                getBaseUrl(),
                getInstanceConfig(widgetInfo.widgetId),
            ]);
            if (!token) {
                setPaired(false);
                setLoading(false);
                return;
            }
            if (existing) {
                setScope(existing.scope);
                setFrom(existing.from ?? "");
                setTo(existing.to ?? "");
                setAccountId(existing.accountId);
                setCategoryId(existing.categoryId);
                setDirection(existing.direction ?? "all");
                setSort(existing.sort ?? "date");
            }
            const result = await pair(baseUrl, token);
            if (result.ok) {
                setAccounts(result.accounts);
                setCategories(result.categories);
            }
            setLoading(false);
        })();
    }, [widgetInfo.widgetId]);

    const customValid =
        scope !== "custom" ||
        (DATE_RE.test(from) && DATE_RE.test(to) && from <= to);

    const handleSave = async () => {
        setSaving(true);
        const config: WidgetInstanceConfig = {
            scope,
            from: scope === "custom" ? from : undefined,
            to: scope === "custom" ? to : undefined,
            accountId,
            accountName: accounts.find((a) => a.id === accountId)?.name,
            categoryId,
            categoryName: categories.find((cat) => cat.id === categoryId)?.name,
            direction: isTransactionsWidget && direction !== "all" ? direction : undefined,
            sort: isTransactionsWidget && sort !== "date" ? sort : undefined,
        };
        await setInstanceConfig(widgetInfo.widgetId, config);

        const [token, baseUrl, metrics] = await Promise.all([
            getToken(),
            getBaseUrl(),
            getMetrics(),
        ]);
        if (token) {
            if (isTransactionsWidget) {
                const rows = await fetchTransactions(baseUrl, token, config);
                renderWidget(
                    <TransactionsWidget transactions={rows} baseUrl={baseUrl} config={config} />,
                );
            } else {
                const summary = await fetchSummary(baseUrl, token, config);
                renderWidget(
                    widgetInfo.widgetName === "SpendlyChart"
                        ? <ChartWidget summary={summary} baseUrl={baseUrl} />
                        : <SummaryWidget summary={summary} metrics={metrics} paired config={config} />,
                );
            }
        }
        setResult("ok");
    };

    if (loading) {
        return (
            <View style={[styles.screen, styles.center]}>
                <ActivityIndicator color={COLORS.accent} />
            </View>
        );
    }

    if (!paired) {
        return (
            <View style={[styles.screen, styles.center, { padding: 24 }]}>
                <Text style={styles.title}>Not paired yet</Text>
                <Text style={styles.hint}>
                    Open the Spendly Widgets app first and enter your pairing code,
                    then add the widget again.
                </Text>
                <Pressable style={styles.button} onPress={() => setResult("cancel")}>
                    <Text style={styles.buttonText}>Close</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Widget settings</Text>
            <Text style={styles.hint}>
                Applies only to this widget — every widget you add can have its own
                view.
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Time period</Text>
                <View style={styles.chipRow}>
                    {SCOPES.map((s) => (
                        <Pressable
                            key={s.key}
                            onPress={() => setScope(s.key)}
                            style={[styles.chip, scope === s.key && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, scope === s.key && styles.chipTextActive]}>
                                {s.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
                {scope === "custom" && (
                    <View style={{ gap: 8 }}>
                        <TextInput
                            style={styles.input}
                            value={from}
                            onChangeText={setFrom}
                            placeholder="From (YYYY-MM-DD)"
                            placeholderTextColor={COLORS.border}
                            autoCapitalize="none"
                        />
                        <TextInput
                            style={styles.input}
                            value={to}
                            onChangeText={setTo}
                            placeholder="To (YYYY-MM-DD)"
                            placeholderTextColor={COLORS.border}
                            autoCapitalize="none"
                        />
                        <Text style={styles.hint}>
                            Use the same date in both fields for a single day.
                        </Text>
                    </View>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Account</Text>
                <View style={styles.chipRow}>
                    <Pressable
                        onPress={() => setAccountId(undefined)}
                        style={[styles.chip, !accountId && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, !accountId && styles.chipTextActive]}>
                            All accounts
                        </Text>
                    </Pressable>
                    {accounts.map((a) => (
                        <Pressable
                            key={a.id}
                            onPress={() => setAccountId(a.id)}
                            style={[styles.chip, accountId === a.id && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, accountId === a.id && styles.chipTextActive]}>
                                {a.name.trim()}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Category</Text>
                <View style={styles.chipRow}>
                    <Pressable
                        onPress={() => setCategoryId(undefined)}
                        style={[styles.chip, !categoryId && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, !categoryId && styles.chipTextActive]}>
                            All categories
                        </Text>
                    </Pressable>
                    {categories.map((cat) => (
                        <Pressable
                            key={cat.id}
                            onPress={() => setCategoryId(cat.id)}
                            style={[styles.chip, categoryId === cat.id && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextActive]}>
                                {cat.name.trim()}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            {isTransactionsWidget && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Show</Text>
                    <View style={styles.chipRow}>
                        {([
                            ["all", "Everything"],
                            ["income", "Income only"],
                            ["expense", "Expenses only"],
                        ] as const).map(([key, label]) => (
                            <Pressable
                                key={key}
                                onPress={() => setDirection(key)}
                                style={[styles.chip, direction === key && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, direction === key && styles.chipTextActive]}>
                                    {label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                    <Text style={styles.cardTitle}>Order</Text>
                    <View style={styles.chipRow}>
                        {([
                            ["date", "Newest first"],
                            ["amount", "Biggest first"],
                        ] as const).map(([key, label]) => (
                            <Pressable
                                key={key}
                                onPress={() => setSort(key)}
                                style={[styles.chip, sort === key && styles.chipActive]}
                            >
                                <Text style={[styles.chipText, sort === key && styles.chipTextActive]}>
                                    {label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>
            )}

            <Pressable
                style={[styles.button, (!customValid || saving) && styles.buttonDisabled]}
                disabled={!customValid || saving}
                onPress={handleSave}
            >
                {saving
                    ? <ActivityIndicator color={COLORS.text} />
                    : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
            <Pressable onPress={() => setResult("cancel")} disabled={saving}>
                <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: COLORS.bg },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: 20, paddingTop: 48, gap: 14 },
    title: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
    card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
    hint: { color: COLORS.label, fontSize: 13, lineHeight: 18 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
    chipText: { color: COLORS.label, fontSize: 13 },
    chipTextActive: { color: COLORS.text, fontWeight: "600" },
    input: {
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 10,
        color: COLORS.text,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
    },
    button: {
        backgroundColor: COLORS.accent,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: "center",
        marginTop: 4,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
    cancel: { color: COLORS.label, fontSize: 14, textAlign: "center", paddingVertical: 8 },
});
