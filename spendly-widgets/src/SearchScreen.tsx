import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Modal,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import ReAnimated, {
    Easing,
    FadeIn,
    LinearTransition,
    SharedValue,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
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

// Spotlight-style layout: the search bar and the shortcut buttons share ONE
// row. Focusing the field shrinks the bar and the shortcuts slide out from
// behind it; typing (or blurring) sends them back under the bar and the bar
// reclaims the full width. Icons only, no labels — matching the reference.
const SHORTCUT_SIZE = 44;
// Wider gap than the first pass — the goo blur was strong enough that
// tightly-packed circles read as one indistinct blob rather than four
// separate buttons with a subtle merge effect.
const SHORTCUT_GAP = 14;
const SHORTCUT_STEP = SHORTCUT_SIZE + SHORTCUT_GAP;
const SHORTCUTS_COUNT = 4;
const SHORTCUTS_W = SHORTCUTS_COUNT * SHORTCUT_SIZE + (SHORTCUTS_COUNT - 1) * SHORTCUT_GAP;
const BAR_GAP = 10;
const ROW_H = 52;
const BAR_H = 44;
const FILTER_MENU_W = 240;
// damping/stiffness ratio ≈1.03 — just past critically damped, so it settles
// directly into place with no oscillation at all. The previous pass
// (26/260 ≈ 0.81) was still underdamped enough to visibly wobble once it
// reached the goo blobs, which read as a "liquid jiggle" on top of the
// blur/merge effect rather than a clean settle.
const SPRING = { damping: 32, stiffness: 240 };
const STAGGER_MS = 30;

// Small, CAPPED slide-in distance — not proportional to index (the first
// pass grew this up to -232px for the last icon, i.e. the icon started
// nearly a whole row-width off to the side). Two problems with that: it
// read as a long sweeping motion rather than a settled pop-in, and the
// goo blob tracking this same offset traveled outside the Skia canvas's
// own bounds partway through, where canvases hard-clip (unlike RN views,
// which default to overflow:visible) — the literal cause of the visible
// horizontal cut. A small fixed offset keeps every blob within the canvas
// for the whole animation, and reads as "settle into place" rather than
// "slide in from off-screen".
const hiddenOffset = (_index: number) => -18;

const useShortcut = (index: number) => {
    // Single 0..1 progress per shortcut — position, scale and the matching
    // goo blob all derive from it, so nothing can drift out of sync.
    const t = useSharedValue(0);
    const show = () => {
        t.value = withDelay(index * STAGGER_MS, withSpring(1, SPRING));
    };
    const hide = () => {
        // Reversed stagger on the way out, as in the reference's exit variant.
        t.value = withDelay((SHORTCUTS_COUNT - 1 - index) * STAGGER_MS, withSpring(0, SPRING));
    };
    return { t, show, hide };
};

type QuickActionProps = {
    icon: React.ComponentProps<typeof Feather>["name"];
    label: string;
    left: number;
    index: number;
    t: SharedValue<number>;
    onPress: () => void;
    active?: boolean;
    // Only the Filter button needs this — lets the filter popup measure
    // exactly where to anchor itself.
    pressableRef?: React.RefObject<View | null>;
};

const QuickAction = ({ icon, label, left, index, t, onPress, active, pressableRef }: QuickActionProps) => {
    // Precomputed on the JS thread and captured as a plain number: a
    // worklet body may only call other worklets, so calling hiddenOffset()
    // inside useAnimatedStyle would throw on the UI thread.
    const hx = hiddenOffset(index);
    const animStyle = useAnimatedStyle(() => ({
        opacity: t.value,
        transform: [
            { translateX: hx * (1 - t.value) },
            { scale: 0.7 + 0.3 * t.value },
        ],
    }));
    return (
        <ReAnimated.View style={[styles.shortcut, { left }, animStyle]}>
            <Pressable
                ref={pressableRef}
                onPress={onPress}
                accessibilityLabel={label}
                style={({ pressed }) => [styles.shortcutInner, pressed && styles.shortcutPressed]}
            >
                <Feather name={icon} size={19} color={UI.text} />
                {active && <View style={styles.shortcutDot} />}
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
    const [zoneWidth, setZoneWidth] = useState(0);

    // Filter menu, opened from the Filter shortcut — a real floating popup
    // anchored to that button (measured on open), NOT inline content that
    // pushes the results list down. Options are fetched lazily (re-uses
    // `pair()` — the token IS the pairing code, same trick ConfigScreen.tsx
    // already relies on) and cached so reopening doesn't refetch.
    const [filterOpen, setFilterOpen] = useState(false);
    const [filterAnchor, setFilterAnchor] = useState<{ top: number; left: number } | null>(null);
    const [filterOptions, setFilterOptions] = useState<{ accounts: SelectOption[]; categories: SelectOption[] } | null>(null);
    const [filterLoading, setFilterLoading] = useState(false);
    const [filterAccountId, setFilterAccountId] = useState<string | undefined>(undefined);
    const [filterCategoryId, setFilterCategoryId] = useState<string | undefined>(undefined);
    const hasFilters = !!filterAccountId || !!filterCategoryId;
    const filterTriggerRef = useRef<View>(null);
    // Minimal, shadcn-style motion: a plain timing fade + tiny scale/slide,
    // no spring/bounce at all — see [[animation-preferences-disliked]] on
    // why a spring here (even a settled one) read as the wrong register
    // for what should feel like a crisp, restrained menu.
    const menuAnim = useSharedValue(0);
    const menuStyle = useAnimatedStyle(() => ({
        opacity: menuAnim.value,
        transform: [
            { scale: 0.96 + 0.04 * menuAnim.value },
            { translateY: -6 * (1 - menuAnim.value) },
        ],
    }));

    const s0 = useShortcut(0);
    const s1 = useShortcut(1);
    const s2 = useShortcut(2);
    const s3 = useShortcut(3);
    // Drives the search bar's width directly (no stagger) so the bar starts
    // making room the instant the shortcuts begin sliding out.
    const openness = useSharedValue(0);

    const visible = focused && !query.trim();
    useEffect(() => {
        openness.value = withSpring(visible ? 1 : 0, SPRING);
        [s0, s1, s2, s3].forEach((s) => (visible ? s.show() : s.hide()));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const shortcutLeft = (i: number) => zoneWidth - SHORTCUTS_W + i * SHORTCUT_STEP;

    // Everything a worklet needs is precomputed here on the JS thread and
    // captured as plain numbers — worklet bodies can only call other
    // worklets, so calling shortcutLeft()/hiddenOffset() inside them would
    // throw on the UI thread (which blanked the whole screen).
    const zw = zoneWidth;
    const openW = SHORTCUTS_W + BAR_GAP;
    const restCx0 = shortcutLeft(0) + SHORTCUT_SIZE / 2;
    const restCx1 = shortcutLeft(1) + SHORTCUT_SIZE / 2;
    const restCx2 = shortcutLeft(2) + SHORTCUT_SIZE / 2;
    const restCx3 = shortcutLeft(3) + SHORTCUT_SIZE / 2;
    const hx0 = hiddenOffset(0);
    const hx1 = hiddenOffset(1);
    const hx2 = hiddenOffset(2);
    const hx3 = hiddenOffset(3);
    const halfShortcut = SHORTCUT_SIZE / 2;

    // Always returns the same key. Returning `{}` instead is legal but
    // leaves the last-applied width stuck on the native view, since
    // reanimated doesn't unset keys that disappear from the style object.
    const barStyle = useAnimatedStyle(() => ({
        width: zw <= 0 ? undefined : zw - openness.value * openW,
    }));

    // Goo blobs track the same progress values as the real buttons, so the
    // blurred shapes merge into the search bar exactly as the buttons slide
    // out of it. r shrinks to 0 when hidden, so nothing lingers on canvas.
    // Capture the SharedValues themselves, not the {t, show, hide} objects
    // they live on — a worklet closure serializes whole captured objects,
    // which would drag the non-worklet show/hide functions into the UI
    // runtime on every recreation.
    const t0 = s0.t, t1 = s1.t, t2 = s2.t, t3 = s3.t;
    const barW = useDerivedValue(() => Math.max(0, zw - openness.value * openW));
    const cy = ROW_H / 2;
    const cx0 = useDerivedValue(() => restCx0 + hx0 * (1 - t0.value));
    const cx1 = useDerivedValue(() => restCx1 + hx1 * (1 - t1.value));
    const cx2 = useDerivedValue(() => restCx2 + hx2 * (1 - t2.value));
    const cx3 = useDerivedValue(() => restCx3 + hx3 * (1 - t3.value));
    const r0 = useDerivedValue(() => halfShortcut * t0.value);
    const r1 = useDerivedValue(() => halfShortcut * t1.value);
    const r2 = useDerivedValue(() => halfShortcut * t2.value);
    const r3 = useDerivedValue(() => halfShortcut * t3.value);

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

    const openFilterMenu = async () => {
        filterTriggerRef.current?.measureInWindow((x, y, width, height) => {
            // Anchored via `left`, computed so the popup's RIGHT edge lines
            // up with the button's right edge — using `right` here would
            // need the window width; this needs only the button's own
            // measured position and the popup's known fixed width.
            setFilterAnchor({ top: y + height + 6, left: Math.max(8, x + width - FILTER_MENU_W) });
        });
        setFilterOpen(true);
        menuAnim.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
        if (!filterOptions && token) {
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
    const closeFilterMenu = () => {
        menuAnim.value = withTiming(0, { duration: 120, easing: Easing.in(Easing.cubic) });
        setFilterOpen(false);
    };
    const toggleFilter = () => (filterOpen ? closeFilterMenu() : openFilterMenu());

    // Typing hides the shortcuts (and with them, conceptually, the Filter
    // button) — close the menu along with them rather than leaving it
    // floating with nothing to anchor to anymore.
    useEffect(() => {
        if (!visible && filterOpen) closeFilterMenu();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

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
                        style={styles.searchRow}
                        onLayout={(e) => setZoneWidth(e.nativeEvent.layout.width)}
                    >
                        {zoneWidth > 0 && (
                            <Canvas style={styles.gooCanvas} pointerEvents="none">
                                <Group layer={
                                    <Paint>
                                        {/* Same recipe as before, dialed down again — this is
                                            now a light touch: blobs stay visibly separate
                                            circles and only pull together right as they'd
                                            physically overlap, instead of merging from a
                                            visible distance. */}
                                        <Blur blur={3} />
                                        <ColorMatrix matrix={[
                                            1, 0, 0, 0, 0,
                                            0, 1, 0, 0, 0,
                                            0, 0, 1, 0, 0,
                                            0, 0, 0, 6, -2,
                                        ]} />
                                    </Paint>
                                }>
                                    <RoundedRect
                                        x={0}
                                        y={(ROW_H - BAR_H) / 2}
                                        width={barW}
                                        height={BAR_H}
                                        r={BAR_H / 2}
                                        color={UI.card}
                                    />
                                    {/* Always mounted — r animates to 0 when hidden, so the
                                        outgoing spring plays out instead of being cut off by
                                        an unmount. */}
                                    <Circle cx={cx0} cy={cy} r={r0} color={UI.card} />
                                    <Circle cx={cx1} cy={cy} r={r1} color={UI.card} />
                                    <Circle cx={cx2} cy={cy} r={r2} color={UI.card} />
                                    <Circle cx={cx3} cy={cy} r={r3} color={UI.card} />
                                </Group>
                            </Canvas>
                        )}

                        <ReAnimated.View style={[styles.barWrap, barStyle]}>
                            <Field
                                icon="search"
                                value={query}
                                onChangeText={setQuery}
                                onFocus={() => setFocused(true)}
                                onBlur={() => setFocused(false)}
                                placeholder="Search"
                                // Deliberately NOT autoFocus: the shortcuts are
                                // revealed by focusing the field, so auto-focusing
                                // on mount would spring them open before any tap.
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={styles.barInput}
                            />
                        </ReAnimated.View>

                        {zoneWidth > 0 && (
                            <View style={styles.shortcutsLayer} pointerEvents={visible ? "box-none" : "none"}>
                                <QuickAction
                                    icon="plus"
                                    label="Add transaction"
                                    index={0}
                                    t={s0.t}
                                    left={shortcutLeft(0)}
                                    onPress={() => Linking.openURL(`${baseUrl}/?widget-action=new`)}
                                />
                                <QuickAction
                                    icon="mic"
                                    label="Voice note"
                                    index={1}
                                    t={s1.t}
                                    left={shortcutLeft(1)}
                                    onPress={() => onOpenVoice ? onOpenVoice() : Linking.openURL("spendlywidgets://voice")}
                                />
                                <QuickAction
                                    icon="camera"
                                    label="Scan photo"
                                    index={2}
                                    t={s2.t}
                                    left={shortcutLeft(2)}
                                    onPress={() => Linking.openURL(`${baseUrl}/?widget-action=photo`)}
                                />
                                <QuickAction
                                    icon="sliders"
                                    label="Filter"
                                    index={3}
                                    t={s3.t}
                                    left={shortcutLeft(3)}
                                    onPress={toggleFilter}
                                    active={hasFilters}
                                    pressableRef={filterTriggerRef}
                                />
                            </View>
                        )}
                    </View>

                    {busy && !rows ? (
                        <ActivityIndicator color={UI.accent} style={{ marginTop: 24 }} />
                    ) : (
                        <Card style={styles.resultsCard}>
                            <FlatList
                                style={styles.list}
                                data={rows ?? []}
                                keyExtractor={(item) => item.id}
                                // A plain `.map()` in a non-scrolling View has no
                                // bounded height and no clipping, so past a
                                // handful of rows the list silently overflowed
                                // past the Card and rendered ON TOP OF the "Open
                                // in Spendly" button below it — the "list gets
                                // corrupted" symptom. FlatList scrolls and clips
                                // properly, same as v1 did before this rewrite.
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
                                        <ReAnimated.View entering={FadeIn.delay(Math.min(index, 8) * 40).duration(180)}>
                                            <Pressable
                                                style={({ pressed }) => [
                                                    styles.row,
                                                    !isLast && styles.rowDivider,
                                                    pressed && styles.rowPressed,
                                                ]}
                                                onPress={() => Linking.openURL(`${baseUrl}/transactions?edit=${item.id}`)}
                                            >
                                                <View style={styles.rowMain}>
                                                    <View style={styles.rowValueLine}>
                                                        <Text style={styles.payee} numberOfLines={1}>{item.payee}</Text>
                                                        <Text style={[styles.rowAmount, { color: badgeColor }]} numberOfLines={1}>
                                                            {income ? "+" : ""}{formatINR(item.amount)}
                                                        </Text>
                                                    </View>
                                                    {/* Date folded into the description line, like a
                                                        note, rather than its own column. */}
                                                    <Text style={styles.sub} numberOfLines={1}>
                                                        {item.date} · {item.category ?? "Uncategorized"} · {item.account}
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
                                }}
                            />
                        </Card>
                    )}
                    <Button icon="external-link" variant="outline" onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}>
                        Open in Spendly
                    </Button>
                </ReAnimated.View>
            )}

            {/* A real floating popup menu anchored to the Filter button —
                not inline content, so it never pushes the results list
                down. Renders in its own native window (like Select's
                dropdown), so it sits above everything regardless of where
                it lives in this tree. */}
            <Modal transparent visible={filterOpen} animationType="none" onRequestClose={closeFilterMenu}>
                <Pressable style={styles.filterMenuBackdrop} onPress={closeFilterMenu}>
                    {filterAnchor && (
                        <ReAnimated.View
                            style={[
                                styles.filterMenuCard,
                                { top: filterAnchor.top, left: filterAnchor.left, transformOrigin: "top right" },
                                menuStyle,
                            ]}
                        >
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
                        </ReAnimated.View>
                    )}
                </Pressable>
            </Modal>
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
    searchRow: { height: ROW_H, justifyContent: "center" },
    gooCanvas: { position: "absolute", left: 0, right: 0, top: 0, height: ROW_H },
    barWrap: { height: BAR_H, justifyContent: "center" },
    // Carries its own background rather than relying on the goo canvas to
    // draw the bar: if Skia ever fails to render, the field must still be
    // visible and usable instead of leaving a blank strip.
    barInput: { backgroundColor: UI.card, borderColor: "transparent", borderRadius: BAR_H / 2, height: BAR_H },
    shortcutsLayer: { position: "absolute", left: 0, right: 0, top: 0, height: ROW_H },
    shortcut: {
        position: "absolute",
        top: (ROW_H - SHORTCUT_SIZE) / 2,
        width: SHORTCUT_SIZE,
        height: SHORTCUT_SIZE,
    },
    shortcutInner: {
        width: SHORTCUT_SIZE,
        height: SHORTCUT_SIZE,
        borderRadius: SHORTCUT_SIZE / 2,
        // Same reasoning as barInput: don't depend on the goo canvas for
        // the visible pill, it only adds the merge effect behind these.
        backgroundColor: UI.card,
        alignItems: "center",
        justifyContent: "center",
    },
    shortcutPressed: { opacity: 0.6 },
    shortcutDot: {
        position: "absolute",
        top: 4,
        right: 4,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: UI.accent,
        borderWidth: 2,
        borderColor: UI.card,
    },
    // No dim behind it — same reasoning as Select's dropdown: a real menu
    // doesn't darken the page, this View only exists to catch outside taps.
    filterMenuBackdrop: { flex: 1 },
    filterMenuCard: {
        position: "absolute",
        width: FILTER_MENU_W,
        gap: 8,
        backgroundColor: UI.card,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        padding: 10,
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
    },
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
    // PointsAwards-style value pairing (bold label + colored companion
    // value) on the top line; date/category/account folded into a single
    // muted description line beneath, like a note — not a separate column.
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

// Default export so App.tsx can React.lazy() this screen — keeping it out
// of the root module means a failure in its native-dependent imports
// (reanimated/Skia) can no longer prevent registerRootComponent() from running.
export default SearchScreen;
