import React, { useState } from "react";
import {
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

export const Hint = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.hint}>{children}</Text>
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
}: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    variant?: "default" | "outline" | "ghost" | "accent";
    icon?: React.ComponentProps<typeof Feather>["name"];
}) => {
    const textColor = variant === "default" ? "#0f172a" : UI.text;
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.button,
                variant === "outline" && styles.buttonOutline,
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

// The web app's Select, RN-style: bordered trigger with a chevron, options
// in a dark sheet with a check on the active row.
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
    const current = options.find((o) => o.value === value);

    return (
        <>
            <Pressable style={styles.selectTrigger} onPress={() => setOpen(true)}>
                <Text
                    style={[styles.selectValue, !current && { color: UI.label }]}
                    numberOfLines={1}
                >
                    {current?.label ?? placeholder}
                </Text>
                <Text style={styles.selectChevron}>▾</Text>
            </Pressable>
            <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
                    <View style={styles.modalCard}>
                        <FlatList
                            data={options}
                            keyExtractor={(o) => o.value}
                            renderItem={({ item }) => (
                                <Pressable
                                    style={({ pressed }) => [styles.optionRow, pressed && { backgroundColor: UI.cardSubtle }]}
                                    onPress={() => {
                                        onChange(item.value);
                                        setOpen(false);
                                    }}
                                >
                                    <Text style={[styles.optionText, item.value === value && { color: UI.accent, fontWeight: "600" }]}>
                                        {item.label}
                                    </Text>
                                    {item.value === value && <Text style={{ color: UI.accent }}>✓</Text>}
                                </Pressable>
                            )}
                        />
                    </View>
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
    selectValue: { color: UI.text, fontSize: 15, flex: 1, marginRight: 8 },
    selectChevron: { color: UI.label, fontSize: 13 },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(2, 6, 23, 0.75)",
        justifyContent: "center",
        padding: 28,
    },
    modalCard: {
        backgroundColor: UI.card,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
        maxHeight: 420,
        paddingVertical: 6,
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    optionText: { color: UI.text, fontSize: 15, flex: 1, marginRight: 8 },
});
