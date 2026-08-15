import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    Easing,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatINR } from "./format";

// shadcn/ui-flavored primitives for the companion app, matching the main
// site's actual dark-mode tokens (app/globals.css) and component motifs
// (rounded amount pills, colored icon boxes, elevated cards) — not just its
// color values.
export const UI = {
    bg: "#0f172a",
    card: "#1e293b",
    cardSubtle: "#16213a",
    border: "#334155",
    label: "#94a3b8",
    text: "#f8fafc",
    accent: "#3b82f6",
    danger: "#f87171",
    green: "#4ade80",
    // Dark end of the site's header gradient (components/Header.tsx) — used
    // as a solid hero band here rather than a true gradient, since neither
    // expo-linear-gradient nor react-native-svg is in this app yet.
    heroFrom: "#172554",
    heroTo: "#1e3a8a",
} as const;

export const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
    <View style={[styles.card, style]}>{children}</View>
);

// The site's signature rounded-full amount badge (transaction list, columns.tsx):
// soft-tinted background, full-strength text in the same hue.
export const AmountPill = ({
    amount,
    size = "md",
    style,
}: {
    amount: number;
    size?: "md" | "lg";
    style?: object;
}) => {
    const positive = amount >= 0;
    const color = positive ? UI.green : UI.danger;
    return (
        <View style={[styles.pill, size === "lg" && styles.pillLg, { backgroundColor: `${color}26` }, style]}>
            <Text style={[styles.pillText, size === "lg" && styles.pillTextLg, { color }]}>
                {positive ? "+" : ""}{formatINR(amount)}
            </Text>
        </View>
    );
};

// Colored rounded-square icon container (dashboard stat-card motif) —
// holds a real vector icon (e.g. from @expo/vector-icons) so it reads as
// deliberate UI, not an emoji standing in for one.
export const IconBox = ({ children, color = UI.accent }: { children: React.ReactNode; color?: string }) => (
    <View style={[styles.iconBox, { backgroundColor: `${color}26` }]}>
        {children}
    </View>
);

export const CardTitle = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.cardTitle}>{children}</Text>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.sectionLabel}>{children}</Text>
);

export const Hint = ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <Text style={[styles.hint, color && { color }]}>{children}</Text>
);

export const Field = ({
    icon,
    ...props
}: TextInputProps & { icon?: React.ComponentProps<typeof Feather>["name"] }) => {
    if (!icon) {
        return (
            <TextInput
                placeholderTextColor={UI.border}
                {...props}
                style={[styles.input, props.style]}
            />
        );
    }
    return (
        <View style={styles.inputIconWrap}>
            <Feather name={icon} size={17} color={UI.label} style={styles.inputIcon} />
            <TextInput
                placeholderTextColor={UI.border}
                {...props}
                style={[styles.input, styles.inputWithIcon, props.style]}
            />
        </View>
    );
};

export const Button = ({
    children,
    onPress,
    disabled,
    variant = "default",
    icon,
    color,
    borderColor,
}: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    variant?: "default" | "outline" | "ghost" | "accent";
    icon?: React.ComponentProps<typeof Feather>["name"];
    // Outline/ghost variants render light text on a transparent background,
    // which only reads on this app's default dark screens — light-theme
    // screens (e.g. VoiceScreen) must override both.
    color?: string;
    borderColor?: string;
}) => {
    const textColor = variant === "default" ? "#0f172a" : color ?? UI.text;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.button,
                variant === "outline" && styles.buttonOutline,
                variant === "outline" && borderColor && { borderColor },
                variant === "ghost" && styles.buttonGhost,
                variant === "accent" && styles.buttonAccent,
                (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 },
            ]}
        >
            {icon && <Feather name={icon} size={15} color={textColor} style={{ marginRight: 7 }} />}
            <Text style={[styles.buttonText, { color: textColor }]}>{children}</Text>
        </Pressable>
    );
};

export type SelectOption = { value: string; label: string };

// Plain timing, NOT spring — see [[animation-preferences-disliked]]: a
// spring (even a settled, no-overshoot one) reads as "alive"/organic,
// which isn't the register a compact menu/dropdown wants. shadcn's own
// actual motion is a fast opacity+tiny-scale ease, no bounce at all —
// matched here with a plain duration + Easing curve.
const MENU_TIMING = { duration: 130 };

// The check glyph fades/scales in quickly rather than snapping — reacts
// to `active` flipping true (both on open, showing the current selection,
// and live if the parent's value changes while the sheet is still open).
const OptionRow = ({
    label,
    active,
    onPress,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
}) => {
    const checkAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
    useEffect(() => {
        Animated.timing(checkAnim, { toValue: active ? 1 : 0, useNativeDriver: true, ...MENU_TIMING }).start();
    }, [active, checkAnim]);

    return (
        <Pressable
            style={({ pressed }) => [
                styles.optionRow,
                active && styles.optionRowActive,
                pressed && { backgroundColor: UI.cardSubtle },
            ]}
            onPress={onPress}
        >
            <Text style={[styles.optionText, active && { fontWeight: "600" }]} numberOfLines={1}>
                {label}
            </Text>
            <Animated.View style={{ opacity: checkAnim, transform: [{ scale: checkAnim }] }}>
                <Feather name="check" size={16} color={UI.accent} />
            </Animated.View>
        </Pressable>
    );
};

// An anchored combobox-style dropdown, not a centered popup: the options
// list grows directly out of the trigger's own position (measured on open
// via `measureInWindow`) with no dimmed backdrop behind it — matching how
// a real combobox behaves rather than a modal sheet. A transparent
// full-screen Pressable still sits behind it purely to catch outside taps
// and close it. Deliberately core RN `Animated`, NOT reanimated — this
// file is imported by App.tsx at module scope, and reanimated throws at
// import time if its native side isn't ready (see SearchScreen.tsx's
// comment on why that took the whole app down once already). A shared
// file every screen depends on can't risk that.
export const Select = ({
    value,
    options,
    onChange,
    placeholder = "Select…",
}: {
    value: string | undefined;
    options: SelectOption[];
    onChange: (value: string) => void;
    placeholder?: string;
}) => {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<{ x: number; y: number; width: number } | null>(null);
    const triggerRef = useRef<View>(null);
    const current = options.find((o) => o.value === value);
    const chevronAnim = useRef(new Animated.Value(0)).current;
    const sheetAnim = useRef(new Animated.Value(0)).current;

    const openSheet = () => {
        triggerRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y: y + height + 6, width });
        });
        setOpen(true);
        sheetAnim.setValue(0);
        Animated.parallel([
            Animated.timing(chevronAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
            Animated.timing(sheetAnim, { toValue: 1, easing: Easing.out(Easing.cubic), useNativeDriver: true, ...MENU_TIMING }),
        ]).start();
    };
    const closeSheet = () => {
        Animated.timing(chevronAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start();
        setOpen(false);
    };
    // Picking an option closes immediately from a tap in the abstract, but
    // that gave the check-pop animation (above) no time to actually play —
    // the sheet unmounted the same frame it started. A short pause lets you
    // SEE the selection land before the sheet dismisses; tapping outside to
    // dismiss without choosing stays instant (closeSheet directly).
    const selectOption = (v: string) => {
        onChange(v);
        setTimeout(closeSheet, 200);
    };

    const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
    // Anchored at the top edge (transformOrigin below), so this genuinely
    // grows downward out of the trigger rather than scaling from its center.
    const sheetOpacity = sheetAnim;
    const sheetScale = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });

    return (
        <>
            <Pressable
                ref={triggerRef}
                style={({ pressed }) => [styles.selectTrigger, pressed && styles.selectTriggerPressed]}
                onPress={openSheet}
            >
                <Text
                    style={[styles.selectValue, !current && { color: UI.label }]}
                    numberOfLines={1}
                >
                    {current?.label ?? placeholder}
                </Text>
                <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
                    <Feather name="chevron-down" size={16} color={UI.label} />
                </Animated.View>
            </Pressable>
            <Modal transparent visible={open} animationType="none" onRequestClose={closeSheet}>
                <Pressable style={styles.dropdownBackdrop} onPress={closeSheet}>
                    {anchor && (
                        <Animated.View
                            style={[
                                styles.dropdownCard,
                                {
                                    top: anchor.y,
                                    left: anchor.x,
                                    width: anchor.width,
                                    transformOrigin: "top",
                                    opacity: sheetOpacity,
                                    transform: [{ scaleY: sheetScale }],
                                },
                            ]}
                        >
                            <FlatList
                                data={options}
                                keyExtractor={(o) => o.value}
                                ItemSeparatorComponent={() => <View style={styles.optionSeparator} />}
                                renderItem={({ item }) => (
                                    <OptionRow
                                        label={item.label}
                                        active={item.value === value}
                                        onPress={() => selectOption(item.value)}
                                    />
                                )}
                            />
                        </Animated.View>
                    )}
                </Pressable>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: UI.card,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 16,
        padding: 16,
        gap: 10,
        // Real elevation (site's card `shadow-sm`) instead of a flat hairline box
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    pill: {
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    pillText: { fontSize: 14, fontWeight: "700" },
    pillLg: { paddingHorizontal: 18, paddingVertical: 10 },
    pillTextLg: { fontSize: 24, fontWeight: "800" },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    cardTitle: { color: UI.text, fontSize: 16, fontWeight: "600" },
    sectionLabel: {
        color: UI.label,
        fontSize: 11,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    hint: { color: UI.label, fontSize: 13, lineHeight: 18 },
    input: {
        borderWidth: 1,
        borderColor: UI.border,
        borderRadius: 10,
        color: UI.text,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        backgroundColor: UI.bg,
    },
    inputIconWrap: { position: "relative", justifyContent: "center" },
    inputIcon: { position: "absolute", left: 14, zIndex: 1 },
    inputWithIcon: { paddingLeft: 40 },
    button: {
        backgroundColor: UI.text,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
    },
    buttonOutline: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: UI.border,
    },
    buttonGhost: { backgroundColor: "transparent" },
    buttonAccent: { backgroundColor: UI.accent },
    buttonText: { fontSize: 15, fontWeight: "600" },
    selectTrigger: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: UI.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 11,
        backgroundColor: UI.bg,
    },
    selectTriggerPressed: { backgroundColor: UI.cardSubtle },
    selectValue: { color: UI.text, fontSize: 15, flex: 1, marginRight: 8 },
    // No dim/tint — a real dropdown doesn't darken the page behind it,
    // only a modal sheet does. This View exists purely to catch
    // outside-taps and close the menu.
    dropdownBackdrop: { flex: 1 },
    dropdownCard: {
        position: "absolute",
        backgroundColor: UI.card,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        maxHeight: 280,
        padding: 6,
        // Real elevation, matching Card — a flat hairline box read as
        // basic; a floating menu should look like it's sitting above
        // the page.
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 10,
    },
    // Neutral, not the app's blue accent — a whole tinted-blue row read as
    // too loud; the accent color now shows up only on the small check
    // glyph, a single deliberate cue rather than the row itself shouting.
    optionRowActive: { backgroundColor: `${UI.text}0d` },
    optionSeparator: { height: 1, backgroundColor: UI.border, marginVertical: 2, opacity: 0.5 },
    optionText: { color: UI.text, fontSize: 15, flex: 1, marginRight: 8 },
});
