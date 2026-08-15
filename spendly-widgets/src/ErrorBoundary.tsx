import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { UI } from "./ui";

type Props = {
    children: React.ReactNode;
    /** Shown above the error text, e.g. "Search is unavailable". */
    label?: string;
    onClose?: () => void;
};

type State = { error: Error | null };

// Without this, ANY render-time throw unmounts the whole tree and leaves a
// bare dark-blue screen that's indistinguishable from a dead JS bundle —
// which is exactly how the reanimated failures presented. A contained,
// readable failure beats a blank screen every time.
export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error("[ErrorBoundary]", error?.message, error?.stack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <View style={styles.wrap}>
                <Text style={styles.title}>{this.props.label ?? "Something went wrong"}</Text>
                <Text style={styles.detail} numberOfLines={6}>
                    {error.message || String(error)}
                </Text>
                <View style={styles.actions}>
                    <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
                        <Text style={styles.buttonText}>Try again</Text>
                    </Pressable>
                    {this.props.onClose && (
                        <Pressable style={[styles.button, styles.buttonGhost]} onPress={this.props.onClose}>
                            <Text style={[styles.buttonText, { color: UI.label }]}>Close</Text>
                        </Pressable>
                    )}
                </View>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    wrap: { flex: 1, backgroundColor: UI.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
    title: { color: UI.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
    detail: { color: UI.label, fontSize: 12, textAlign: "center", lineHeight: 17 },
    actions: { flexDirection: "row", gap: 10, marginTop: 6 },
    button: { backgroundColor: UI.text, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
    buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: UI.border },
    buttonText: { color: "#0f172a", fontSize: 14, fontWeight: "600" },
});
