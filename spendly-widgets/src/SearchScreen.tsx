import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { fetchTransactions } from "./api";
import { WidgetTransaction } from "./config";
import { AmountPill, Button, Field, Hint, UI } from "./ui";

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
};

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — see VoiceScreen.tsx for why. Queries the paired
// account's transactions live; a tap opens Spendly.
export const SearchScreen = ({ baseUrl, token, onClose }: Props) => {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<WidgetTransaction[] | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!token) return;
        const timer = setTimeout(async () => {
            setBusy(true);
            const result = await fetchTransactions(
                baseUrl,
                token,
                query.trim() ? { scope: "all" } : null,
                15,
                10_000,
                query.trim() || undefined,
            );
            setRows(result);
            setBusy(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [query, token, baseUrl]);

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
                    {busy && !rows ? (
                        <ActivityIndicator color={UI.accent} style={{ marginTop: 24 }} />
                    ) : (
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
                            renderItem={({ item }) => (
                                <Pressable
                                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                                    onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}
                                >
                                    <View style={{ flex: 1, marginRight: 10 }}>
                                        <Text style={styles.payee} numberOfLines={1}>{item.payee}</Text>
                                        <Text style={styles.sub} numberOfLines={1}>
                                            {item.date}{item.category ? ` · ${item.category}` : ""} · {item.account}
                                        </Text>
                                    </View>
                                    <AmountPill amount={item.amount} />
                                    <Feather name="chevron-right" size={16} color={UI.border} style={{ marginLeft: 6 }} />
                                </Pressable>
                            )}
                        />
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
        borderBottomColor: UI.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowPressed: { backgroundColor: UI.cardSubtle },
    payee: { color: UI.text, fontSize: 15, fontWeight: "500" },
    sub: { color: UI.label, fontSize: 12, marginTop: 1 },
});
