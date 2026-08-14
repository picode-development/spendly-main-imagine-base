import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { fetchSummary, pair } from "./src/api";
import {
    ALL_METRICS,
    DEFAULT_BASE_URL,
    MetricKey,
    WIDGET_NAME,
    WidgetSummary,
} from "./src/config";
import { formatINR } from "./src/format";
import {
    clearAll,
    getBaseUrl,
    getMetrics,
    getToken,
    setBaseUrl as storeBaseUrl,
    setCachedSummary,
    setMetrics as storeMetrics,
    setToken as storeToken,
} from "./src/storage";
import { SummaryWidget } from "./src/widgets/SummaryWidget";

const COLORS = {
    bg: "#0f172a",
    card: "#1e293b",
    border: "#334155",
    label: "#94a3b8",
    text: "#f8fafc",
    accent: "#3b82f6",
    danger: "#f87171",
};

const refreshHomeScreenWidget = (summary: WidgetSummary | null, metrics: MetricKey[], paired: boolean) =>
    requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: () => <SummaryWidget summary={summary} metrics={metrics} paired={paired} />,
        widgetNotFound: () => {
            // No widget on the home screen yet — nothing to draw
        },
    });

export default function App() {
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<WidgetSummary | null>(null);
    const [metrics, setMetrics] = useState<MetricKey[]>(["today", "month", "balance"]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);

    const loadSummary = useCallback(async (url: string, tok: string) => {
        const data = await fetchSummary(url, tok);
        if (data) {
            setSummary(data);
            await setCachedSummary(data);
        }
        return data;
    }, []);

    useEffect(() => {
        (async () => {
            const [storedToken, storedMetrics, storedUrl] = await Promise.all([
                getToken(),
                getMetrics(),
                getBaseUrl(),
            ]);
            setMetrics(storedMetrics);
            setBaseUrl(storedUrl);
            setToken(storedToken);
            setLoading(false);
            if (storedToken) void loadSummary(storedUrl, storedToken);
        })();
    }, [loadSummary]);

    const handlePair = async () => {
        setBusy(true);
        setError(null);
        const url = baseUrl.trim() || DEFAULT_BASE_URL;
        const result = await pair(url, code.trim());
        if (!result.ok) {
            setError(result.error);
            setBusy(false);
            return;
        }
        const normalized = code.trim();
        await Promise.all([storeToken(normalized), storeBaseUrl(url)]);
        setToken(normalized);
        const fresh = await loadSummary(url, normalized);
        await refreshHomeScreenWidget(fresh, metrics, true);
        setBusy(false);
    };

    const handleUnpair = async () => {
        await clearAll();
        setToken(null);
        setSummary(null);
        setCode("");
        await refreshHomeScreenWidget(null, [], false);
    };

    const toggleMetric = async (key: MetricKey, enabled: boolean) => {
        const next = enabled
            ? [...metrics, key]
            : metrics.filter((m) => m !== key);
        if (next.length === 0) return; // keep at least one number on the widget
        const ordered = ALL_METRICS.map((m) => m.key).filter((k) => next.includes(k));
        setMetrics(ordered);
        await storeMetrics(ordered);
        await refreshHomeScreenWidget(summary, ordered, true);
    };

    const handleRefresh = async () => {
        if (!token) return;
        setBusy(true);
        const fresh = await loadSummary(baseUrl, token);
        await refreshHomeScreenWidget(fresh ?? summary, metrics, true);
        setBusy(false);
    };

    if (loading) {
        return (
            <View style={[styles.screen, styles.center]}>
                <ActivityIndicator color={COLORS.accent} />
            </View>
        );
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
            <Text style={styles.title}>Spendly Widgets</Text>

            {!token ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Pair with Spendly</Text>
                    <Text style={styles.hint}>
                        In Spendly, open Settings → Widgets, generate a pairing code, and
                        enter it here.
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={code}
                        onChangeText={(v) => setCode(v.toUpperCase())}
                        placeholder="XXXX-XXXX-XXXX"
                        placeholderTextColor={COLORS.border}
                        autoCapitalize="characters"
                        autoCorrect={false}
                    />
                    {error && <Text style={styles.error}>{error}</Text>}
                    <Pressable
                        style={[styles.button, (busy || code.trim().length < 8) && styles.buttonDisabled]}
                        disabled={busy || code.trim().length < 8}
                        onPress={handlePair}
                    >
                        {busy
                            ? <ActivityIndicator color={COLORS.text} />
                            : <Text style={styles.buttonText}>Pair</Text>}
                    </Pressable>

                    <Pressable onPress={() => setShowAdvanced((s) => !s)}>
                        <Text style={styles.advancedToggle}>
                            {showAdvanced ? "Hide advanced" : "Advanced"}
                        </Text>
                    </Pressable>
                    {showAdvanced && (
                        <TextInput
                            style={styles.input}
                            value={baseUrl}
                            onChangeText={setBaseUrl}
                            placeholder={DEFAULT_BASE_URL}
                            placeholderTextColor={COLORS.border}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                        />
                    )}
                </View>
            ) : (
                <>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Paired</Text>
                        {summary ? (
                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Spent today</Text>
                                    <Text style={[styles.statValue, { color: COLORS.danger }]}>
                                        {formatINR(summary.todayExpenses)}
                                    </Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>This month</Text>
                                    <Text style={[styles.statValue, { color: COLORS.danger }]}>
                                        {formatINR(summary.monthExpenses)}
                                    </Text>
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Balance</Text>
                                    <Text style={styles.statValue}>{formatINR(summary.totalBalance)}</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.hint}>Couldn't load your numbers — pull to refresh below.</Text>
                        )}
                        <Pressable style={styles.button} disabled={busy} onPress={handleRefresh}>
                            {busy
                                ? <ActivityIndicator color={COLORS.text} />
                                : <Text style={styles.buttonText}>Refresh now</Text>}
                        </Pressable>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Widget shows</Text>
                        {ALL_METRICS.map((m) => (
                            <View key={m.key} style={styles.switchRow}>
                                <Text style={styles.switchLabel}>{m.label}</Text>
                                <Switch
                                    value={metrics.includes(m.key)}
                                    onValueChange={(v) => toggleMetric(m.key, v)}
                                    trackColor={{ true: COLORS.accent, false: COLORS.border }}
                                    thumbColor={COLORS.text}
                                />
                            </View>
                        ))}
                        <Text style={styles.hint}>
                            Add the Spendly widget from your launcher's widget picker. It
                            refreshes about every 30 minutes, and instantly when you open
                            this app.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Pressable onPress={() => Linking.openURL(baseUrl)}>
                            <Text style={styles.link}>Open Spendly</Text>
                        </Pressable>
                        <Pressable onPress={handleUnpair}>
                            <Text style={[styles.link, { color: COLORS.danger }]}>Unpair this device</Text>
                        </Pressable>
                    </View>
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: COLORS.bg },
    center: { alignItems: "center", justifyContent: "center" },
    content: { padding: 20, paddingTop: 64, gap: 16 },
    title: { color: COLORS.text, fontSize: 26, fontWeight: "700", marginBottom: 4 },
    card: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 16,
        gap: 12,
    },
    cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
    hint: { color: COLORS.label, fontSize: 13, lineHeight: 18 },
    input: {
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 10,
        color: COLORS.text,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 16,
        letterSpacing: 2,
    },
    error: { color: COLORS.danger, fontSize: 13 },
    button: {
        backgroundColor: COLORS.accent,
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: "center",
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
    advancedToggle: { color: COLORS.label, fontSize: 13, textAlign: "center" },
    statsRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1 },
    statLabel: { color: COLORS.label, fontSize: 12 },
    statValue: { color: COLORS.text, fontSize: 17, fontWeight: "700", marginTop: 2 },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    switchLabel: { color: COLORS.text, fontSize: 15 },
    link: { color: COLORS.accent, fontSize: 15, fontWeight: "500", paddingVertical: 4 },
});
