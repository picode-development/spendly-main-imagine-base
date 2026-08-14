import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from "expo-audio";
import { uploadVoice, VoiceResult } from "./api";
import { AmountPill, Button, Card, Hint, IconBox, UI } from "./ui";

// Mirrors the web app's silence auto-stop: once the user has spoken,
// sustained quiet ends the recording; never-spoke bails out sooner.
// Levels are dBFS (negative; closer to 0 = louder).
const SPEECH_DB = -25;
const SILENCE_DB = -38;
const TRAILING_SILENCE_MS = 2500;
const NO_SPEECH_TIMEOUT_MS = 8000;

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
};

type Phase = "starting" | "recording" | "uploading" | "done" | "error";

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — Android can't render a truly transparent Activity
// reliably (it showed a dark tinge instead of the launcher behind it), so
// this owns its own solid background and a real header like any other
// screen in the app.
export const VoiceScreen = ({ baseUrl, token, onClose }: Props) => {
    const recorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });
    const recorderState = useAudioRecorderState(recorder, 150);

    const [phase, setPhase] = useState<Phase>("starting");
    const [locked, setLocked] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<VoiceResult | null>(null);

    const hasSpokenRef = useRef(false);
    const quietSinceRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);
    const stoppingRef = useRef(false);
    const pulse = useRef(new Animated.Value(0)).current;
    const dotBlink = useRef(new Animated.Value(1)).current;

    const stopAndUpload = async () => {
        if (stoppingRef.current) return;
        stoppingRef.current = true;
        setPhase("uploading");
        try {
            await recorder.stop();
            const uri = recorder.uri;
            if (!uri || !token) {
                setError(!token ? "Pair the app with Spendly first." : "Recording failed.");
                setPhase("error");
                return;
            }
            const res = await uploadVoice(baseUrl, token, uri);
            if (!res.ok) {
                setError(res.error);
                setPhase("error");
                return;
            }
            setResult(res.data);
            setPhase("done");
        } catch {
            setError("Recording failed.");
            setPhase("error");
        }
    };

    useEffect(() => {
        (async () => {
            if (!token) {
                setError("Pair the app with Spendly first.");
                setPhase("error");
                return;
            }
            const perm = await requestRecordingPermissionsAsync();
            if (!perm.granted) {
                setError("Microphone permission is needed for voice notes.");
                setPhase("error");
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
            startedAtRef.current = Date.now();
            setPhase("recording");
        })();
        return () => {
            // Leaving the page mid-recording discards it
            if (!stoppingRef.current) {
                recorder.stop().catch(() => {});
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Silence auto-stop, suspended while locked
    useEffect(() => {
        if (phase !== "recording" || locked) {
            quietSinceRef.current = null;
            return;
        }
        const db = recorderState.metering ?? -160;
        const now = Date.now();
        if (db >= SPEECH_DB) {
            hasSpokenRef.current = true;
            quietSinceRef.current = null;
        } else if (db <= SILENCE_DB) {
            quietSinceRef.current ??= now;
            const quietFor = now - quietSinceRef.current;
            if (hasSpokenRef.current && quietFor >= TRAILING_SILENCE_MS) void stopAndUpload();
            else if (!hasSpokenRef.current && now - startedAtRef.current >= NO_SPEECH_TIMEOUT_MS) {
                setError("Didn't hear anything.");
                setPhase("error");
                stoppingRef.current = true;
                recorder.stop().catch(() => {});
            }
        } else {
            quietSinceRef.current = null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recorderState.metering, phase, locked]);

    const level = Math.max(0, Math.min(1, ((recorderState.metering ?? -60) + 60) / 60));

    // The mic circle grows a little with speech volume, and the "Listening"
    // dot breathes steadily — a full page has room for a real focal point
    // instead of just a thin meter bar.
    useEffect(() => {
        Animated.spring(pulse, { toValue: level, useNativeDriver: true, friction: 6 }).start();
    }, [level, pulse]);
    useEffect(() => {
        if (phase !== "recording") return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(dotBlink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
                Animated.timing(dotBlink, { toValue: 1, duration: 700, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [phase, dotBlink]);
    const micScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });

    return (
        <View style={styles.screen}>
            <StatusBar barStyle="light-content" backgroundColor={UI.bg} />
            <View style={styles.header}>
                <Text style={styles.title}>Voice note</Text>
                <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
                    <Feather name="x" size={18} color={UI.label} />
                </Pressable>
            </View>

            <View style={styles.content}>
                {phase === "starting" && <ActivityIndicator color={UI.accent} />}

                {phase === "recording" && (
                    <>
                        <View style={styles.statusRow}>
                            <Animated.View style={[styles.liveDot, { opacity: dotBlink }]} />
                            <Text style={styles.statusText}>{locked ? "Recording" : "Listening"}</Text>
                        </View>
                        <View style={styles.micWrap}>
                            <Animated.View style={[styles.micRing, { transform: [{ scale: micScale }] }]} />
                            <View style={styles.micCore}>
                                <Feather name="mic" size={34} color={UI.danger} />
                            </View>
                        </View>
                        <Hint>
                            Speak the transaction — it stops by itself when you go quiet.
                            {locked ? " Auto-stop is off." : ""}
                        </Hint>
                        <View style={styles.actionsRow}>
                            <Pressable
                                onPress={() => setLocked((l) => !l)}
                                style={[styles.iconButton, locked && styles.iconButtonActive]}
                            >
                                <Feather name={locked ? "lock" : "unlock"} size={18} color={locked ? UI.accent : UI.label} />
                                <Text style={[styles.iconButtonLabel, locked && { color: UI.accent }]}>
                                    {locked ? "Locked" : "Lock"}
                                </Text>
                            </Pressable>
                            <Pressable onPress={stopAndUpload} style={styles.stopButton}>
                                <Feather name="square" size={20} color="#0f172a" />
                            </Pressable>
                            <View style={styles.iconButton} />
                        </View>
                    </>
                )}

                {phase === "uploading" && (
                    <>
                        <ActivityIndicator color={UI.accent} style={{ marginBottom: 12 }} />
                        <Hint>Understanding your voice note…</Hint>
                    </>
                )}

                {phase === "done" && result && (
                    <>
                        <IconBox color={UI.green}>
                            <Feather name="check" size={18} color={UI.green} />
                        </IconBox>
                        <Card style={styles.resultCard}>
                            {result.parsed?.amount != null && (
                                <AmountPill amount={result.parsed.amount} size="lg" />
                            )}
                            {result.parsed?.payee && <Text style={styles.payee}>{result.parsed.payee}</Text>}
                            <Text style={styles.sub}>
                                {[result.parsed?.accountName, result.parsed?.categoryName, result.parsed?.date]
                                    .filter(Boolean).join(" · ") || "Details to fill in Spendly"}
                            </Text>
                            {result.parsed?.note && <Text style={styles.sub}>{result.parsed.note}</Text>}
                            <View style={styles.transcriptRow}>
                                <Feather name="volume-2" size={12} color={UI.label} style={{ marginTop: 1 }} />
                                <Text style={styles.transcript}>{result.transcript}</Text>
                            </View>
                        </Card>
                        <Hint>Saved to your detected transactions — confirm it in Spendly.</Hint>
                        <View style={styles.row}>
                            <Button variant="outline" onPress={onClose}>Done</Button>
                            <Button icon="external-link" onPress={() => Linking.openURL(baseUrl)}>Open Spendly</Button>
                        </View>
                    </>
                )}

                {phase === "error" && (
                    <>
                        <IconBox color={UI.danger}>
                            <Feather name="alert-circle" size={18} color={UI.danger} />
                        </IconBox>
                        <Text style={styles.error}>{error}</Text>
                        <Button variant="outline" onPress={onClose}>Close</Button>
                    </>
                )}
            </View>
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
    content: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        gap: 14,
    },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: UI.danger },
    statusText: { color: UI.label, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
    micWrap: { width: 140, height: 140, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    micRing: {
        position: "absolute",
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: `${UI.danger}26`,
    },
    micCore: {
        width: 92,
        height: 92,
        borderRadius: 46,
        backgroundColor: UI.card,
        borderWidth: 1,
        borderColor: UI.border,
        alignItems: "center",
        justifyContent: "center",
    },
    actionsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        marginTop: 8,
    },
    iconButton: { width: 64, alignItems: "center", gap: 4 },
    iconButtonActive: {},
    iconButtonLabel: { color: UI.label, fontSize: 11, fontWeight: "600" },
    stopButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: UI.text,
        alignItems: "center",
        justifyContent: "center",
    },
    row: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 4 },
    resultCard: { width: "100%", gap: 4 },
    payee: { color: UI.text, fontSize: 17, fontWeight: "600" },
    sub: { color: UI.label, fontSize: 13 },
    transcriptRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
    transcript: { color: UI.label, fontSize: 12, fontStyle: "italic", flex: 1 },
    error: { color: UI.danger, fontSize: 14, textAlign: "center" },
});
