import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { fetchTransactions } from "./api";
import { WidgetTransaction } from "./config";
import { formatINR } from "./format";
import { Button, Field, Hint, UI } from "./ui";

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
};

// Popup-style search: opened straight from the widget's search button.
// Queries the paired account's transactions live; a tap opens Spendly.
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
        <View style={styles.backdrop}>
            <View style={styles.sheet}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>Search transactions</Text>
                    <Pressable onPress={onClose} hitSlop={12}>
                        <Text style={styles.close}>✕</Text>
                    </Pressable>
                </View>

                {!token ? (
                    <>
                        <Hint>Pair the app with Spendly first, then search from the widget.</Hint>
                        <Button onPress={onClose}>Close</Button>
                    </>
                ) : (
                    <>
                        <Field
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Search payees…"
                            autoFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        {busy && !rows ? (
                            <ActivityIndicator color={UI.accent} style={{ marginVertical: 16 }} />
                        ) : (
                            <FlatList
                                style={{ maxHeight: 340 }}
                                data={rows ?? []}
                                keyExtractor={(t) => t.id}
                                ListEmptyComponent={
                                    <Hint>{query ? "No matches." : "Your latest transactions appear here."}</Hint>
                                }
                                renderItem={({ item }) => (
                                    <Pressable
                                        style={styles.row}
                                        onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}
                                    >
                                        <View style={{ flex: 1, marginRight: 10 }}>
                                            <Text style={styles.payee} numberOfLines={1}>{item.payee}</Text>
                                            <Text style={styles.sub} numberOfLines={1}>
                                                {item.date}{item.category ? ` · ${item.category}` : ""} · {item.account}
                                            </Text>
                                        </View>
                                        <Text style={[styles.amount, { color: item.amount < 0 ? UI.danger : UI.green }]}>
                                            {item.amount < 0 ? "-" : "+"}{formatINR(Math.abs(item.amount))}
                                        </Text>
                                    </Pressable>
                                )}
                            />
                        )}
                        <Button variant="outline" onPress={() => Linking.openURL(`${baseUrl}/transactions?search=1`)}>
                            Open in Spendly
                        </Button>
                    </>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(2, 6, 23, 0.92)",
        justifyContent: "center",
        padding: 18,
    },
    sheet: {
        backgroundColor: UI.card,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 18,
        padding: 18,
        gap: 12,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { color: UI.text, fontSize: 18, fontWeight: "700" },
    close: { color: UI.label, fontSize: 18, padding: 4 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomColor: UI.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    payee: { color: UI.text, fontSize: 15, fontWeight: "500" },
    sub: { color: UI.label, fontSize: 12, marginTop: 1 },
    amount: { fontSize: 15, fontWeight: "700" },
});
