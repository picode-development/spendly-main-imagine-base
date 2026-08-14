import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    BackHandler,
    Linking,
    PixelRatio,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";
import { requestWidgetUpdate, WidgetPreview } from "react-native-android-widget";
import * as Updates from "expo-updates";
import { fetchSummary, fetchTransactions, isTokenValid, pair } from "./src/api";
import {
    ALL_METRICS,
    DEFAULT_BASE_URL,
    MetricKey,
    WidgetSummary,
    WidgetTransaction,
} from "./src/config";
import { formatINR } from "./src/format";
import { SearchScreen } from "./src/SearchScreen";
import {
    fetchLatestVersion,
    installedVersionCode,
    installedVersionName,
    LatestVersion,
    updateUriIfNewer,
} from "./src/version";
import {
    clearAll,
    getBaseUrl,
    getInstanceConfig,
    getMetrics,
    getToken,
    setBaseUrl as storeBaseUrl,
    setCachedSummary,
    setCachedTransactions,
    setMetrics as storeMetrics,
    setToken as storeToken,
} from "./src/storage";
import { AmountPill, Button, Card, CardTitle, Field, Hint, IconBox, UI } from "./src/ui";
import { useOtaUpdateCheck } from "./src/useOtaUpdateCheck";
import { VoiceScreen } from "./src/VoiceScreen";
import { ActionsWidget } from "./src/widgets/ActionsWidget";
import { CategoriesWidget } from "./src/widgets/CategoriesWidget";
import { ChartWidget } from "./src/widgets/ChartWidget";
import { SummaryWidget } from "./src/widgets/SummaryWidget";
import { themedPair } from "./src/widgets/theme";
import { TransactionsWidget } from "./src/widgets/TransactionsWidget";

type Screen = "home" | "search" | "voice";

const screenFromUrl = (url: string | null): Screen => {
    if (!url) return "home";
    if (url.includes("voice")) return "voice";
    if (url.includes("search")) return "search";
    return "home";
};

// Push fresh renders to every widget variant on the home screen. Instances
// with their own settings (long-press → Reconfigure) re-fetch their scoped
// view instead of being overwritten with the default data.
const refreshHomeScreenWidgets = async (
    summary: WidgetSummary | null,
    transactions: WidgetTransaction[] | null,
    metrics: MetricKey[],
    paired: boolean,
    baseUrl: string,
) => {
    const token = await getToken();
    const updateUri = updateUriIfNewer(baseUrl, await fetchLatestVersion(baseUrl));

    const scopedSummary = async (widgetId: number) => {
        const config = await getInstanceConfig(widgetId);
        if (!config || !token || !paired) return { config: config ?? null, summary: paired ? summary : null };
        return { config, summary: await fetchSummary(baseUrl, token, config) };
    };

    type Info = { widgetId: number; width: number; height: number; screenInfo: { density: number } };
    type Rendered = ReturnType<typeof themedPair<React.JSX.Element>>;
    const renderers: Record<string, (info: Info) => Promise<Rendered> | Rendered> = {
        SpendlySummary: async (info) => {
            const scoped = await scopedSummary(info.widgetId);
            return themedPair((mode) => (
                <SummaryWidget
                    summary={scoped.summary}
                    metrics={paired ? metrics : []}
                    paired={paired}
                    config={scoped.config}
                    width={info.width}
                    height={info.height}
                    mode={mode}
                    density={info.screenInfo.density}
                    updateUri={updateUri}
                />
            ));
        },
        SpendlyActions: (info) => themedPair((mode) => (
            <ActionsWidget baseUrl={baseUrl} width={info.width} height={info.height} mode={mode} updateUri={updateUri} />
        )),
        SpendlyChart: async (info) => {
            const scoped = await scopedSummary(info.widgetId);
            return themedPair((mode) => (
                <ChartWidget
                    summary={scoped.summary}
                    baseUrl={baseUrl}
                    config={scoped.config}
                    width={info.width}
                    height={info.height}
                    mode={mode}
                    density={info.screenInfo.density}
                    updateUri={updateUri}
                />
            ));
        },
        SpendlyCategories: async (info) => {
            const scoped = await scopedSummary(info.widgetId);
            return themedPair((mode) => (
                <CategoriesWidget
                    summary={scoped.summary}
                    baseUrl={baseUrl}
                    config={scoped.config}
                    width={info.width}
                    height={info.height}
                    mode={mode}
                    density={info.screenInfo.density}
                    updateUri={updateUri}
                />
            ));
        },
        SpendlyTransactions: async (info) => {
            const config = await getInstanceConfig(info.widgetId);
            const rows = config && token && paired
                ? await fetchTransactions(baseUrl, token, config, 30)
                : (paired ? transactions : null);
            return themedPair((mode) => (
                <TransactionsWidget
                    transactions={rows}
                    baseUrl={baseUrl}
                    config={config}
                    width={info.width}
                    height={info.height}
                    mode={mode}
                    density={info.screenInfo.density}
                    updateUri={updateUri}
                />
            ));
        },
    };
    return Promise.all(
        Object.entries(renderers).map(([widgetName, renderWidget]) =>
            requestWidgetUpdate({
                widgetName,
                renderWidget,
                widgetNotFound: () => {
                    // This variant isn't on the home screen — nothing to draw
                },
            }),
        ),
    );
};

export default function App() {
    useOtaUpdateCheck();
    const { currentlyRunning } = Updates.useUpdates();
    const [screen, setScreen] = useState<Screen>("home");
    // Launched straight into a popup (widget button → overlay activity):
    // closing should dismiss the overlay, not navigate to the app home
    const [popupLaunch, setPopupLaunch] = useState(false);
    const [loading, setLoading] = useState(true);
    const [token, setToken] = useState<string | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<WidgetSummary | null>(null);
    const [transactions, setTransactions] = useState<WidgetTransaction[] | null>(null);
    const [metrics, setMetrics] = useState<MetricKey[]>(["today", "month", "balance"]);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
    const [latest, setLatest] = useState<LatestVersion | null>(null);

    const loadSummary = useCallback(async (url: string, tok: string) => {
        const [data, rows] = await Promise.all([
            fetchSummary(url, tok),
            fetchTransactions(url, tok, null, 30),
        ]);
        if (data) {
            setSummary(data);
            await setCachedSummary(data);
        }
        if (rows) {
            setTransactions(rows);
            await setCachedTransactions(rows);
        }
        return { summary: data, transactions: rows };
    }, []);

    const handleUnpair = async (message: string | null = null) => {
        await clearAll();
        setToken(null);
        setSummary(null);
        setTransactions(null);
        setCode("");
        setError(message);
        await refreshHomeScreenWidgets(null, null, [], false, baseUrl);
    };

    // Both fetchSummary/fetchTransactions collapse every failure (network,
    // timeout, 401) into null so their many other callers can just treat
    // "couldn't load" uniformly — this is the one place that needs to know
    // WHY it failed, so a revoked pairing token actually drops back to the
    // pairing screen instead of looping on "Refresh now" forever.
    const checkForRevokedToken = async (
        url: string,
        tok: string,
        fresh: { summary: unknown; transactions: unknown },
    ): Promise<boolean> => {
        if (fresh.summary || fresh.transactions) return false; // got real data — token's fine
        if (await isTokenValid(url, tok)) return false;
        await handleUnpair("Your pairing was removed in Spendly — pair again.");
        return true;
    };

    useEffect(() => {
        (async () => {
            const [storedToken, storedMetrics, storedUrl, initialUrl] = await Promise.all([
                getToken(),
                getMetrics(),
                getBaseUrl(),
                Linking.getInitialURL(),
            ]);
            setMetrics(storedMetrics);
            setBaseUrl(storedUrl);
            setToken(storedToken);
            const initialScreen = screenFromUrl(initialUrl);
            setScreen(initialScreen);
            setPopupLaunch(initialScreen !== "home");
            setLoading(false);
            if (storedToken) {
                loadSummary(storedUrl, storedToken).then((fresh) => checkForRevokedToken(storedUrl, storedToken, fresh));
            }
            void fetchLatestVersion(storedUrl).then(setLatest);
        })();
        const sub = Linking.addEventListener("url", ({ url }) => setScreen(screenFromUrl(url)));
        return () => sub.remove();
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
        await refreshHomeScreenWidgets(fresh.summary, fresh.transactions, metrics, true, url);
        setBusy(false);
    };

    const toggleMetric = async (key: MetricKey, enabled: boolean) => {
        const next = enabled ? [...metrics, key] : metrics.filter((m) => m !== key);
        if (next.length === 0) return; // keep at least one number on the widget
        const ordered = ALL_METRICS.map((m) => m.key).filter((k) => next.includes(k));
        setMetrics(ordered);
        await storeMetrics(ordered);
        await refreshHomeScreenWidgets(summary, transactions, ordered, true, baseUrl);
    };

    const handleRefresh = async () => {
        if (!token) return;
        setBusy(true);
        const fresh = await loadSummary(baseUrl, token);
        const revoked = await checkForRevokedToken(baseUrl, token, fresh);
        if (!revoked) {
            await refreshHomeScreenWidgets(
                fresh.summary ?? summary,
                fresh.transactions ?? transactions,
                metrics,
                true,
                baseUrl,
            );
        }
        setBusy(false);
    };

    if (loading) {
        return (
            <View style={[styles.screen, styles.center]}>
                <ActivityIndicator color={UI.accent} />
            </View>
        );
    }

    const closePopup = () => {
        if (popupLaunch) BackHandler.exitApp();
        else setScreen("home");
    };
    if (screen === "search") {
        return <SearchScreen baseUrl={baseUrl} token={token} onClose={closePopup} />;
    }
    if (screen === "voice") {
        return <VoiceScreen baseUrl={baseUrl} token={token} onClose={closePopup} />;
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <StatusBar barStyle="light-content" backgroundColor={UI.heroFrom} />
            <View style={styles.hero}>
                <Text style={styles.title}>Spendly Widgets</Text>
                <Text style={styles.heroSubtitle}>Home-screen widgets & quick actions</Text>
            </View>

            {!token ? (
                <Card>
                    <CardTitle>Pair with Spendly</CardTitle>
                    <Hint>
                        In Spendly, open Settings → Widgets, generate a pairing code, and
                        enter it here.
                    </Hint>
                    <Field
                        value={code}
                        onChangeText={(v) => setCode(v.toUpperCase())}
                        placeholder="XXXX-XXXX-XXXX"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={{ letterSpacing: 2 }}
                    />
                    {error && <Text style={styles.error}>{error}</Text>}
                    <Button onPress={handlePair} disabled={busy || code.trim().length < 8}>
                        {busy ? "Pairing…" : "Pair"}
                    </Button>
                    <Pressable onPress={() => setShowAdvanced((s) => !s)}>
                        <Text style={styles.advancedToggle}>
                            {showAdvanced ? "Hide advanced" : "Advanced"}
                        </Text>
                    </Pressable>
                    {showAdvanced && (
                        <Field
                            value={baseUrl}
                            onChangeText={setBaseUrl}
                            placeholder={DEFAULT_BASE_URL}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                        />
                    )}
                </Card>
            ) : (
                <>
                    <Card>
                        <View style={styles.titleRow}>
                            <IconBox color={UI.green}>✓</IconBox>
                            <CardTitle>Paired</CardTitle>
                        </View>
                        {summary ? (
                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Spent today</Text>
                                    <AmountPill amount={-summary.todayExpenses} />
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>This month</Text>
                                    <AmountPill amount={-summary.monthExpenses} />
                                </View>
                                <View style={styles.stat}>
                                    <Text style={styles.statLabel}>Balance</Text>
                                    <Text style={styles.statValue}>{formatINR(summary.totalBalance)}</Text>
                                </View>
                            </View>
                        ) : (
                            <Hint>Couldn't load your numbers — try refreshing.</Hint>
                        )}
                        <Button onPress={handleRefresh} disabled={busy}>
                            {busy ? "Refreshing…" : "Refresh now"}
                        </Button>
                    </Card>

                    <Card>
                        <View style={styles.titleRow}>
                            <IconBox color={UI.accent}>⊞</IconBox>
                            <CardTitle>Your widgets</CardTitle>
                        </View>
                        <Hint>
                            Add them from your launcher's widget picker. Long-press a widget →
                            Reconfigure to give it its own dates, account, category, and style.
                        </Hint>
                        <View style={styles.previewList}>
                            <Text style={styles.previewLabel}>Summary</Text>
                            <WidgetPreview
                                renderWidget={(d) => (
                                    <SummaryWidget summary={summary} metrics={metrics} paired config={null} width={d.width} height={d.height} density={PixelRatio.get()} />
                                )}
                                width={320}
                                height={140}
                            />
                            <Text style={styles.previewLabel}>Quick actions</Text>
                            <WidgetPreview
                                renderWidget={(d) => <ActionsWidget baseUrl={baseUrl} width={d.width} height={d.height} />}
                                width={320}
                                height={86}
                            />
                            <Text style={styles.previewLabel}>Chart</Text>
                            <WidgetPreview
                                renderWidget={(d) => (
                                    <ChartWidget summary={summary} baseUrl={baseUrl} config={null} width={d.width} height={d.height} density={PixelRatio.get()} />
                                )}
                                width={320}
                                height={150}
                            />
                            <Text style={styles.previewLabel}>Categories</Text>
                            <WidgetPreview
                                renderWidget={(d) => (
                                    <CategoriesWidget summary={summary} baseUrl={baseUrl} config={null} width={d.width} height={d.height} density={PixelRatio.get()} />
                                )}
                                width={320}
                                height={150}
                            />
                            <Text style={styles.previewLabel}>Transactions</Text>
                            <WidgetPreview
                                renderWidget={(d) => (
                                    <TransactionsWidget transactions={transactions} baseUrl={baseUrl} config={null} width={d.width} height={d.height} density={PixelRatio.get()} />
                                )}
                                width={320}
                                height={200}
                            />
                        </View>
                    </Card>

                    <Card>
                        <CardTitle>Default summary shows</CardTitle>
                        {ALL_METRICS.map((m) => (
                            <View key={m.key} style={styles.switchRow}>
                                <Text style={styles.switchLabel}>{m.label}</Text>
                                <Switch
                                    value={metrics.includes(m.key)}
                                    onValueChange={(v) => toggleMetric(m.key, v)}
                                    trackColor={{ true: UI.accent, false: UI.border }}
                                    thumbColor={UI.text}
                                />
                            </View>
                        ))}
                        <Hint>Applies to Summary widgets in the compact style without their own settings.</Hint>
                    </Card>

                    <Card>
                        <CardTitle>App version</CardTitle>
                        <Hint>
                            {`Installed: v${installedVersionName()} (build ${installedVersionCode()})`}
                            {latest ? ` · Latest: v${latest.version} (build ${latest.versionCode})` : ""}
                        </Hint>
                        <Hint>
                            {currentlyRunning.isEmbeddedLaunch
                                ? "Running the build's embedded code (no OTA update applied yet)"
                                : `Running OTA update ${currentlyRunning.updateId?.slice(0, 8)} · published ${currentlyRunning.createdAt?.toLocaleString() ?? "unknown"}`}
                        </Hint>
                        {latest && latest.versionCode > installedVersionCode() ? (
                            <Button
                                variant="accent"
                                onPress={() => Linking.openURL(`${baseUrl}${latest.apkUrl}`)}
                            >
                                Download latest APK
                            </Button>
                        ) : (
                            <Hint>You're up to date.</Hint>
                        )}
                    </Card>

                    <Card>
                        <Pressable onPress={() => Linking.openURL(baseUrl)}>
                            <Text style={styles.link}>Open Spendly</Text>
                        </Pressable>
                        <Pressable onPress={() => handleUnpair()}>
                            <Text style={[styles.link, { color: UI.danger }]}>Unpair this device</Text>
                        </Pressable>
                    </Card>
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: UI.bg },
    center: { alignItems: "center", justifyContent: "center" },
    content: { paddingHorizontal: 20, paddingBottom: 48, gap: 16 },
    hero: {
        marginHorizontal: -20,
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 28,
        backgroundColor: UI.heroFrom,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
    },
    title: { color: UI.text, fontSize: 26, fontWeight: "700" },
    heroSubtitle: { color: "#89b6fd", fontSize: 14, marginTop: 4 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    error: { color: UI.danger, fontSize: 13 },
    advancedToggle: { color: UI.label, fontSize: 13, textAlign: "center", paddingVertical: 4 },
    statsRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1, gap: 5 },
    statLabel: { color: UI.label, fontSize: 12 },
    statValue: { color: UI.text, fontSize: 17, fontWeight: "700", marginTop: 2 },
    switchRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    switchLabel: { color: UI.text, fontSize: 15 },
    link: { color: UI.accent, fontSize: 15, fontWeight: "500", paddingVertical: 4 },
    previewList: { alignItems: "center", gap: 6 },
    previewLabel: {
        alignSelf: "flex-start",
        color: UI.label,
        fontSize: 12,
        fontWeight: "600",
        marginTop: 8,
    },
});
