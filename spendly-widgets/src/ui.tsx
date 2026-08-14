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

// shadcn/ui-flavored primitives for the companion app, matching the main
// site's dark theme: slate surfaces, subtle borders, the site's gold accent.
export const UI = {
    bg: "#0f172a",
    card: "#1e293b",
    cardSubtle: "#16213a",
    border: "#334155",
    label: "#94a3b8",
    text: "#f8fafc",
    accent: "#3b82f6",
    gold: "#e3b27a",
    danger: "#f87171",
    green: "#4ade80",
} as const;

export const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => (
    <View style={[styles.card, style]}>{children}</View>
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

export const Field = (props: TextInputProps) => (
    <TextInput
        placeholderTextColor={UI.border}
        {...props}
        style={[styles.input, props.style]}
    />
);

export const Button = ({
    children,
    onPress,
    disabled,
    variant = "default",
}: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
    variant?: "default" | "outline" | "ghost" | "gold";
}) => (
    <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
            styles.button,
            variant === "outline" && styles.buttonOutline,
            variant === "ghost" && styles.buttonGhost,
            variant === "gold" && styles.buttonGold,
            (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 },
        ]}
    >
        <Text
            style={[
                styles.buttonText,
                variant === "default" && { color: "#0f172a" },
                variant === "gold" && { color: "#111111" },
                (variant === "outline" || variant === "ghost") && { color: UI.text },
            ]}
        >
            {children}
        </Text>
    </Pressable>
);

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
                                    <Text style={[styles.optionText, item.value === value && { color: UI.gold, fontWeight: "600" }]}>
                                        {item.label}
                                    </Text>
                                    {item.value === value && <Text style={{ color: UI.gold }}>✓</Text>}
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
    button: {
        backgroundColor: UI.text,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: "center",
    },
    buttonOutline: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: UI.border,
    },
    buttonGhost: { backgroundColor: "transparent" },
    buttonGold: { backgroundColor: UI.gold },
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
