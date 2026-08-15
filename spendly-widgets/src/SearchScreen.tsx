import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { fetchTransactions, pair } from "./api";
import { WidgetInstanceConfig, WidgetTransaction } from "./config";
import { AmountPill, Button, Card, Field, Hint, Select, SelectOption, UI } from "./ui";

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
    // Lets the "Voice" quick action switch in-place to VoiceScreen within
    // the same popup Activity, instead of a deep-link relaunch — App.tsx
    // wires this to its existing setScreen("voice").
    onOpenVoice?: () => void;
};

type QuickActionProps = {
    icon: React.ComponentProps<typeof Feather>["name"];
    label: string;
    onPress: () => void;
    active?: boolean;
};

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — see VoiceScreen.tsx for why. Queries the paired
// account's transactions live; a tap opens Spendly.
const QuickAction = ({ icon, label, onPress, active }: QuickActionProps) => (
    <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
    >
        <View style={styles.quickActionIcon}>
            <Feather name={icon} size={19} color={UI.text} />
            {active && <View style={styles.quickActionDot} />}
        </View>
        <Text style={styles.quickActionLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
);

export const SearchScreen = ({ baseUrl, token, onClose, onOpenVoice }: Props) => {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<WidgetTransaction[] | null>(null);
    const [busy, setBusy] = useState(false);

    // Filter-by-account/category panel, opened from the Filter quick
    // action. Options are fetched lazily (re-uses `pair()` — the token IS
    // the pairing code, same trick ConfigScreen.tsx already relies on) and
    // cached so reopening the panel doesn't refetch.
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterOptions, setFilterOptions] = useState<{ accounts: SelectOption[]; categories: SelectOption[] } | null>(null);
    const [filterLoading, setFilterLoading] = useState(false);
    const [filterAccountId, setFilterAccountId] = useState<string | undefined>(undefined);
    const [filterCategoryId, setFilterCategoryId] = useState<string | undefined>(undefined);
    const hasFilters = !!filterAccountId || !!filterCategoryId;

    // Quick actions (+ the filter panel) fade out once the user starts
    // typing, matching the Spotlight-style reference hiding its shortcut
    // row during an active search, and fade back in when the query clears.
    const quickActionsAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        Animated.timing(quickActionsAnim, {
            toValue: query.trim() ? 0 : 1,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [query, quickActionsAnim]);

    useEffect(() => {
        if (!token) return;
        const timer = setTimeout(async () => {
            setBusy(true);
            const searchConfig: WidgetInstanceConfig | null =
                query.trim() || hasFilters
                    ? { scope: "all", accountId: filterAccountId, categoryId: filterCategoryId }
                    : null;
            const result = await fetchTransactions(
                baseUrl,
                token,
                searchConfig,
                15,
                10_000,
                query.trim() || undefined,
            );
            setRows(result);
            setBusy(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, token, baseUrl, filterAccountId, filterCategoryId, hasFilters]);

    const toggleFilter = async () => {
        const next = !filterOpen;
        setFilterOpen(next);
        if (next && !filterOptions && token) {
            setFilterLoading(true);
            const result = await pair(baseUrl, token);
            if (result.ok) {
                setFilterOptions({
                    accounts: result.accounts.map((a) => ({ value: a.id, label: a.name })),
                    categories: result.categories.map((c) => ({ value: c.id, label: c.name })),
                });
            }
            setFilterLoading(false);
        }
    };

    return (
        <View style={styles.screen}>
            <StatusBar barStyle="light-content" backgroundColor={UI.bg} />
            <View style={styles.header}>
                <Text style={styles.title}>Search transactions</Text>
                <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
                    <Feather name="x" size={18} color={UI.label} />
                </Pressable>
            </View>

            {!token ? (
                <View style={styles.centerContent}>
                    <View style={styles.emptyIcon}>
                        <Feather name="user-x" size={22} color={UI.label} />
                    </View>
                    <Hint>Pair the app with Spendly first, then search from the widget.</Hint>
                    <Button onPress={onClose}>Close</Button>
                </View>
            ) : (
                <View style={styles.content}>
                    <Field
                        icon="search"
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search payees…"
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Animated.View
                        style={{ opacity: quickActionsAnim }}
                        pointerEvents={query.trim() ? "none" : "auto"}
                    >
                        <View style={styles.quickActionsRow}>
                            <QuickAction
                                icon="plus-circle"
                                label="Add"
                                onPress={() => Linking.openURL(`${baseUrl}/?widget-action=new`)}
                            />
                            <QuickAction
                                icon="mic"
                                label="Voice"
                                onPress={() => onOpenVoice ? onOpenVoice() : Linking.openURL("spendlywidgets://voice")}
                            />
                            <QuickAction
                                icon="camera"
                                label="Photo"
                                onPress={() => Linking.openURL(`${baseUrl}/?widget-action=photo`)}
                            />
                            <QuickAction icon="filter" label="Filter" onPress={toggleFilter} active={hasFilters} />
                        </View>

                        {filterOpen && (
                            <View style={styles.filterPanel}>
                                {filterLoading ? (
                                    <ActivityIndicator color={UI.accent} />
                                ) : filterOptions ? (
                                    <>
                                        <Select
                                            value={filterAccountId ?? "__all__"}
                                            options={[{ value: "__all__", label: "All accounts" }, ...filterOptions.accounts]}
                                            onChange={(v) => setFilterAccountId(v === "__all__" ? undefined : v)}
                                        />
                                        <Select
                                            value={filterCategoryId ?? "__all__"}
                                            options={[{ value: "__all__", label: "All categories" }, ...filterOptions.categories]}
                                            onChange={(v) => setFilterCategoryId(v === "__all__" ? undefined : v)}
                                        />
                                        {hasFilters && (
                                            <Pressable onPress={() => { setFilterAccountId(undefined); setFilterCategoryId(undefined); }}>
                                                <Text style={styles.clearFilters}>Clear filters</Text>
                                            </Pressable>
                                        )}
                                    </>
                                ) : (
                                    <Hint>Couldn&apos;t load accounts/categories.</Hint>
                                )}
                            </View>
                        )}
                    </Animated.View>

                    {busy && !rows ? (
                        <ActivityIndicator color={UI.accent} style={{ marginTop: 24 }} />
                    ) : (
                        <Card style={styles.resultsCard}>
                            <FlatList
                                style={styles.list}
                                data={rows ?? []}
                                keyExtractor={(t) => t.id}
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <View style={styles.emptyIcon}>
                                            <Feather name={query ? "search" : "inbox"} size={22} color={UI.label} />
                                        </View>
                                        <Hint>{query ? "No matches." : "Your latest transactions appear here."}</Hint>
                                    </View>
                                }
                                renderItem={({ item, index }) => {
                                    const isLast = index === (rows?.length ?? 0) - 1;
                                    const income = item.amount >= 0;
                                    const badgeColor = income ? UI.green : UI.danger;
                                    return (
                                        <Pressable
                                            style={({ pressed }) => [
                                                styles.row,
                                                !isLast && styles.rowDivider,
                                                pressed && styles.rowPressed,
                                            ]}
                                            onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}
                                        >
                                            <View style={[styles.rowBadge, { backgroundColor: `${badgeColor}22` }]}>
                                                <Feather
                                                    name={income ? "arrow-up-right" : "arrow-down-left"}
                                                    size={15}
                                                    color={badgeColor}
                                                />
                                            </View>
                                            <View style={{ flex: 1, marginRight: 10 }}>
                                                <Text style={styles.payee} numberOfLines={1}>{item.payee}</Text>
                                                <Text style={styles.sub} numberOfLines={1}>
                                                    {item.date}{item.category ? ` · ${item.category}` : ""} · {item.account}
                                                </Text>
                                            </View>
                                            <AmountPill amount={item.amount} />
                                            <Feather name="chevron-right" size={16} color={UI.border} style={{ marginLeft: 6 }} />
                                        </Pressable>
                                    );
                                }}
                            />
                        </Card>
                    )}
                    <Button icon="external-link" variant="outline" onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}>
                        Open in Spendly
                    </Button>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: UI.bg },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 48,
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    title: { color: UI.text, fontSize: 20, fontWeight: "700" },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: UI.card,
        alignItems: "center",
        justifyContent: "center",
    },
    content: { flex: 1, paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
    centerContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 12 },
    quickActionsRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 2 },
    quickAction: { alignItems: "center", gap: 6, width: 64 },
    quickActionPressed: { opacity: 0.6 },
    quickActionIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: UI.card,
        alignItems: "center",
        justifyContent: "center",
    },
    quickActionDot: {
        position: "absolute",
        top: 2,
        right: 2,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: UI.accent,
        borderWidth: 2,
        borderColor: UI.bg,
    },
    quickActionLabel: { color: UI.label, fontSize: 11, fontWeight: "600" },
    filterPanel: { marginTop: 12, gap: 8 },
    clearFilters: { color: UI.accent, fontSize: 13, fontWeight: "600", textAlign: "center", paddingVertical: 4 },
    resultsCard: { flex: 1, padding: 8, gap: 0 },
    list: { flex: 1 },
    emptyState: { alignItems: "center", paddingTop: 48, gap: 10 },
    emptyIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: UI.card,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 2,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 10,
    },
    rowDivider: { borderBottomColor: UI.border, borderBottomWidth: StyleSheet.hairlineWidth },
    rowPressed: { backgroundColor: UI.cardSubtle },
    rowBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    payee: { color: UI.text, fontSize: 15, fontWeight: "500" },
    sub: { color: UI.label, fontSize: 12, marginTop: 1 },
});
