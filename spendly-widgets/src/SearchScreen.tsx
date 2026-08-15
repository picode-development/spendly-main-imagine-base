import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import ReAnimated, {
    FadeIn,
    LinearTransition,
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withSpring,
} from "react-native-reanimated";
import { Blur, Canvas, Circle, ColorMatrix, Group, Paint, RoundedRect } from "@shopify/react-native-skia";
import { fetchTransactions, pair } from "./api";
import { formatINR } from "./format";
import { WidgetInstanceConfig, WidgetTransaction } from "./config";
import { Button, Card, Field, Hint, Select, SelectOption, UI } from "./ui";

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
    // Lets the "Voice" quick action switch in-place to VoiceScreen within
    // the same popup Activity, instead of a deep-link relaunch — App.tsx
    // wires this to its existing setScreen("voice").
    onOpenVoice?: () => void;
};

// Touch has no hover, so the reference's onMouseEnter/onMouseLeave reveal
// has no literal equivalent — tapping the search field is the closest
// touch-native stand-in for "the user is actively engaging with this area".
const QUICK_ACTIONS_COUNT = 4;
const SHORTCUT_SIZE = 52;
const SHORTCUT_GAP = 16;
const SHORTCUT_STEP = SHORTCUT_SIZE + SHORTCUT_GAP;
const SPRING_CONFIG = { damping: 14, stiffness: 160 };
const STAGGER_MS = 50;
// Fixed goo-canvas geometry (no onLayout round-trip needed for height —
// only the search-bar blob's width is measured, everything else is a
// known constant since row heights don't change).
const SEARCH_BAR_H = 44;
const QUICK_ROW_TOP = SEARCH_BAR_H + 14;
const GOO_CANVAS_H = QUICK_ROW_TOP + SHORTCUT_SIZE;

// Per-shortcut spring: hidden = pulled left proportional to (index+1),
// matching the reference's `x: -1 * (64 * (index + 1))` cascade — later
// items start further off-screen, producing a "fan sweeping open" look.
// Reveal staggers front-to-back; hide staggers back-to-front (the
// reference's exact stagger-reversal between its enter/exit variants).
const useShortcutSpring = (index: number) => {
    const hiddenX = -(SHORTCUT_STEP * (index + 1));
    const x = useSharedValue(hiddenX);
    const scale = useSharedValue(0.7);
    const reveal = () => {
        x.value = withDelay(index * STAGGER_MS, withSpring(0, SPRING_CONFIG));
        scale.value = withDelay(index * STAGGER_MS, withSpring(1, SPRING_CONFIG));
    };
    const hide = () => {
        const reverseDelay = (QUICK_ACTIONS_COUNT - 1 - index) * STAGGER_MS;
        x.value = withDelay(reverseDelay, withSpring(hiddenX, SPRING_CONFIG));
        scale.value = withDelay(reverseDelay, withSpring(0.7, SPRING_CONFIG));
    };
    return { x, scale, reveal, hide };
};

type QuickActionProps = {
    icon: React.ComponentProps<typeof Feather>["name"];
    label: string;
    left: number;
    x: SharedValue<number>;
    scale: SharedValue<number>;
    onPress: () => void;
    active?: boolean;
};

const QuickAction = ({ icon, label, left, x, scale, onPress, active }: QuickActionProps) => {
    const animStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }, { scale: scale.value }],
    }));
    return (
        <ReAnimated.View style={[styles.quickAction, { left }, animStyle]}>
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [styles.quickActionInner, pressed && styles.quickActionPressed]}
            >
                <View style={styles.quickActionIcon}>
                    <Feather name={icon} size={19} color={UI.text} />
                    {active && <View style={styles.quickActionDot} />}
                </View>
                <Text style={styles.quickActionLabel} numberOfLines={1}>{label}</Text>
            </Pressable>
        </ReAnimated.View>
    );
};

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — see VoiceScreen.tsx for why. Queries the paired
// account's transactions live; a tap opens Spendly.
export const SearchScreen = ({ baseUrl, token, onClose, onOpenVoice }: Props) => {
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const [rows, setRows] = useState<WidgetTransaction[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [zoneWidth, setZoneWidth] = useState(320);

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

    const addAnim = useShortcutSpring(0);
    const voiceAnim = useShortcutSpring(1);
    const photoAnim = useShortcutSpring(2);
    const filterAnim = useShortcutSpring(3);

    const visible = focused && !query.trim();
    useEffect(() => {
        [addAnim, voiceAnim, photoAnim, filterAnim].forEach((a) => (visible ? a.reveal() : a.hide()));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    // Goo-blob cx per shortcut — the SAME shared values driving the real
    // buttons above, so the blobs move in exact sync and visually merge
    // into the search bar as the buttons slide close during reveal.
    const restCx = (i: number) => i * SHORTCUT_STEP + SHORTCUT_SIZE / 2;
    const gooCx0 = useDerivedValue(() => restCx(0) + addAnim.x.value);
    const gooCx1 = useDerivedValue(() => restCx(1) + voiceAnim.x.value);
    const gooCx2 = useDerivedValue(() => restCx(2) + photoAnim.x.value);
    const gooCx3 = useDerivedValue(() => restCx(3) + filterAnim.x.value);
    const gooR0 = useDerivedValue(() => (SHORTCUT_SIZE / 2) * addAnim.scale.value);
    const gooR1 = useDerivedValue(() => (SHORTCUT_SIZE / 2) * voiceAnim.scale.value);
    const gooR2 = useDerivedValue(() => (SHORTCUT_SIZE / 2) * photoAnim.scale.value);
    const gooR3 = useDerivedValue(() => (SHORTCUT_SIZE / 2) * filterAnim.scale.value);
    const gooCy = QUICK_ROW_TOP + SHORTCUT_SIZE / 2;

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
                <ReAnimated.View
                    style={styles.content}
                    layout={LinearTransition.springify().damping(18).stiffness(140)}
                >
                    <View
                        style={styles.searchZone}
                        onLayout={(e) => setZoneWidth(e.nativeEvent.layout.width)}
                    >
                        <Canvas style={[styles.gooCanvas, { height: GOO_CANVAS_H }]} pointerEvents="none">
                            <Group layer={
                                <Paint>
                                    <Blur blur={14} />
                                    <ColorMatrix matrix={[
                                        1, 0, 0, 0, 0,
                                        0, 1, 0, 0, 0,
                                        0, 0, 1, 0, 0,
                                        0, 0, 0, 18, -9,
                                    ]} />
                                </Paint>
                            }>
                                <RoundedRect x={0} y={0} width={zoneWidth} height={SEARCH_BAR_H} r={10} color={UI.card} />
                                {/* Always mounted (not gated on `visible`) — the hidden-state
                                    cx lands off-canvas (x<0) by construction, so unmounting
                                    would cut the outgoing spring off mid-flight instead of
                                    letting it play out. */}
                                <Circle cx={gooCx0} cy={gooCy} r={gooR0} color={UI.card} />
                                <Circle cx={gooCx1} cy={gooCy} r={gooR1} color={UI.card} />
                                <Circle cx={gooCx2} cy={gooCy} r={gooR2} color={UI.card} />
                                <Circle cx={gooCx3} cy={gooCy} r={gooR3} color={UI.card} />
                            </Group>
                        </Canvas>

                        <Field
                            icon="search"
                            value={query}
                            onChangeText={setQuery}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            placeholder="Search payees…"
                            autoFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={[styles.quickActionsRow, { top: QUICK_ROW_TOP }]} pointerEvents={visible ? "auto" : "none"}>
                            <QuickAction
                                icon="plus-circle"
                                label="Add"
                                left={restCx(0) - SHORTCUT_SIZE / 2}
                                x={addAnim.x}
                                scale={addAnim.scale}
                                onPress={() => Linking.openURL(`${baseUrl}/?widget-action=new`)}
                            />
                            <QuickAction
                                icon="mic"
                                label="Voice"
                                left={restCx(1) - SHORTCUT_SIZE / 2}
                                x={voiceAnim.x}
                                scale={voiceAnim.scale}
                                onPress={() => onOpenVoice ? onOpenVoice() : Linking.openURL("spendlywidgets://voice")}
                            />
                            <QuickAction
                                icon="camera"
                                label="Photo"
                                left={restCx(2) - SHORTCUT_SIZE / 2}
                                x={photoAnim.x}
                                scale={photoAnim.scale}
                                onPress={() => Linking.openURL(`${baseUrl}/?widget-action=photo`)}
                            />
                            <QuickAction
                                icon="filter"
                                label="Filter"
                                left={restCx(3) - SHORTCUT_SIZE / 2}
                                x={filterAnim.x}
                                scale={filterAnim.scale}
                                onPress={toggleFilter}
                                active={hasFilters}
                            />
                        </View>
                        {/* Reserves layout height for the absolutely-positioned row above */}
                        <View style={{ height: visible ? SHORTCUT_SIZE + 26 : 0 }} />
                    </View>

                    {filterOpen && visible && (
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

                    {busy && !rows ? (
                        <ActivityIndicator color={UI.accent} style={{ marginTop: 24 }} />
                    ) : (
                        <Card style={styles.resultsCard}>
                            {(rows ?? []).length === 0 ? (
                                <View style={styles.emptyState}>
                                    <View style={styles.emptyIcon}>
                                        <Feather name={query ? "search" : "inbox"} size={22} color={UI.label} />
                                    </View>
                                    <Hint>{query ? "No matches." : "Your latest transactions appear here."}</Hint>
                                </View>
                            ) : (
                                <View style={styles.list}>
                                    {(rows ?? []).map((item, index) => {
                                        const isLast = index === (rows?.length ?? 0) - 1;
                                        const income = item.amount >= 0;
                                        const badgeColor = income ? UI.green : UI.danger;
                                        return (
                                            <ReAnimated.View key={item.id} entering={FadeIn.delay(index * 80).duration(220)}>
                                                <Pressable
                                                    style={({ pressed }) => [
                                                        styles.row,
                                                        !isLast && styles.rowDivider,
                                                        pressed && styles.rowPressed,
                                                    ]}
                                                    onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}
                                                >
                                                    <Text style={styles.rowDate} numberOfLines={1}>{item.date}</Text>
                                                    <View style={styles.rowMain}>
                                                        <View style={styles.rowValueLine}>
                                                            <Text style={styles.payee} numberOfLines={1}>{item.payee}</Text>
                                                            <Text style={[styles.rowAmount, { color: badgeColor }]} numberOfLines={1}>
                                                                {income ? "+" : ""}{formatINR(item.amount)}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.sub} numberOfLines={1}>
                                                            {item.category ?? "Uncategorized"} · {item.account}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.rowBadge, { backgroundColor: `${badgeColor}22` }]}>
                                                        <Feather
                                                            name={income ? "arrow-up-right" : "arrow-down-left"}
                                                            size={15}
                                                            color={badgeColor}
                                                        />
                                                    </View>
                                                </Pressable>
                                            </ReAnimated.View>
                                        );
                                    })}
                                </View>
                            )}
                        </Card>
                    )}
                    <Button icon="external-link" variant="outline" onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}>
                        Open in Spendly
                    </Button>
                </ReAnimated.View>
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
    searchZone: { position: "relative" },
    gooCanvas: { position: "absolute", left: 0, right: 0, top: 0 },
    quickActionsRow: { position: "absolute", left: 0, right: 0, height: SHORTCUT_SIZE + 20 },
    quickAction: { position: "absolute", top: 0, width: SHORTCUT_SIZE, alignItems: "center", gap: 6 },
    quickActionInner: { alignItems: "center", gap: 6 },
    quickActionPressed: { opacity: 0.6 },
    quickActionIcon: {
        width: SHORTCUT_SIZE,
        height: SHORTCUT_SIZE,
        borderRadius: SHORTCUT_SIZE / 2,
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
    filterPanel: { gap: 8 },
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
    // Mirrors PointsAwards' actual grid: fixed-width muted date on the
    // left, a bold-value + colored-companion-value pair in the middle,
    // an icon badge on the right — not a generic transaction-row layout.
    rowDate: { width: 60, color: UI.label, fontSize: 12 },
    rowMain: { flex: 1, marginRight: 10 },
    rowValueLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
    payee: { color: UI.text, fontSize: 15, fontWeight: "600", flexShrink: 1 },
    rowAmount: { fontSize: 13, fontWeight: "700" },
    sub: { color: UI.label, fontSize: 12, marginTop: 1 },
    rowBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
});
