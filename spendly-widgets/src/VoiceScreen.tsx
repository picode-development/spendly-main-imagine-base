import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Easing,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from "expo-audio";
import { uploadVoice, VoiceResult } from "./api";
import { AmountPill, Button, Card, Hint, IconBox } from "./ui";

// Mirrors the web app's silence auto-stop: once the user has spoken,
// sustained quiet ends the recording; never-spoke bails out sooner.
// Levels are dBFS (negative; closer to 0 = louder).
const SPEECH_DB = -25;
const SILENCE_DB = -38;
const TRAILING_SILENCE_MS = 2500;
const NO_SPEECH_TIMEOUT_MS = 8000;

// A light, grayish-white palette used only on this screen — deliberately
// distinct from the rest of the (dark) app, per design reference.
const LIGHT = {
    bg: "#f1f0f7",
    card: "#ffffff",
    border: "#e2e0ee",
    text: "#1e1b2e",
    label: "#6b6880",
    danger: "#dc2626",
    green: "#16a34a",
    accent: "#7c6ef2",
} as const;

const GRADIENT = ["#60a5fa", "#a78bfa", "#f472b6"] as const;
const ORB_SIZE = 176;
const BLOB_CORE = 104;
const BLOB_WRAP = Math.round(BLOB_CORE * 1.6);
const ORBIT_R = 36;
const INTRO_MS = 600;

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
};

type Phase = "starting" | "recording" | "uploading" | "done" | "error";

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — Android can't render a truly transparent Activity
// reliably, so this owns its own background and a real header like any
// other screen in the app. The recording view intentionally breaks from
// the app's dark theme (grayish-white, per design reference) with a
// gradient orb that flows in before the mic appears and recording begins.
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
    const iconVisibleRef = useRef(false);

    const spin = useRef(new Animated.Value(0)).current;
    const iconAnim = useRef(new Animated.Value(0)).current;
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

    // The orb: two gradient blobs flow around an empty center as soon as
    // recording starts, then the mic icon fades in a beat later. Audio
    // capture already began above — this delay is purely visual.
    useEffect(() => {
        if (phase !== "recording") return;
        const spinLoop = Animated.loop(
            Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
        );
        spinLoop.start();
        const introTimer = setTimeout(() => {
            iconVisibleRef.current = true;
            Animated.timing(iconAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        }, INTRO_MS);
        return () => {
            spinLoop.stop();
            clearTimeout(introTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

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

    const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
    const iconScale = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const corePulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

    const handleOrbTap = () => {
        if (phase !== "recording" || !iconVisibleRef.current) return;
        void stopAndUpload();
    };

    return (
        <View style={styles.screen}>
            <StatusBar barStyle="dark-content" backgroundColor={LIGHT.bg} />
            <View style={styles.header}>
                <Text style={styles.title}>Voice note</Text>
                <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
                    <Feather name="x" size={18} color={LIGHT.label} />
                </Pressable>
            </View>

            <View style={styles.content}>
                {phase === "starting" && <ActivityIndicator color={LIGHT.accent} />}

                {phase === "recording" && (
                    <>
                        <View style={styles.statusRow}>
                            <Animated.View style={[styles.liveDot, { opacity: dotBlink }]} />
                            <Text style={styles.statusText}>{locked ? "Recording" : "Listening"}</Text>
                        </View>

                        <Pressable onPress={handleOrbTap} hitSlop={20} style={styles.orbWrap}>
                            <Animated.View style={[styles.orbitLayer, { transform: [{ rotate: spinDeg }] }]}>
                                <View style={[styles.blobSlot, { transform: [{ translateX: ORBIT_R }] }]}>
                                    <GradientBlob start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} />
                                </View>
                                <View style={[styles.blobSlot, { transform: [{ translateX: -ORBIT_R }] }]}>
                                    <GradientBlob start={{ x: 0.9, y: 0 }} end={{ x: 0.1, y: 1 }} />
                                </View>
                            </Animated.View>

                            <Animated.View
                                style={[
                                    styles.micCore,
                                    { opacity: iconAnim, transform: [{ scale: iconScale }, { scale: corePulseScale }] },
                                ]}
                            >
                                <Feather name="mic" size={30} color={LIGHT.accent} />
                            </Animated.View>
                        </Pressable>

                        <Hint color={LIGHT.label}>
                            Speak the transaction — tap to stop, or it stops itself when you go quiet.
                            {locked ? " Auto-stop is off." : ""}
                        </Hint>

                        <Pressable
                            onPress={() => setLocked((l) => !l)}
                            style={[styles.lockPill, locked && styles.lockPillActive]}
                        >
                            <Feather name={locked ? "lock" : "unlock"} size={14} color={locked ? LIGHT.accent : LIGHT.label} />
                            <Text style={[styles.lockLabel, locked && { color: LIGHT.accent }]}>
                                {locked ? "Locked" : "Lock"}
                            </Text>
                        </Pressable>
                    </>
                )}

                {phase === "uploading" && (
                    <>
                        <ActivityIndicator color={LIGHT.accent} style={{ marginBottom: 12 }} />
                        <Hint color={LIGHT.label}>Understanding your voice note…</Hint>
                    </>
                )}

                {phase === "done" && result && (
                    <>
                        <IconBox color={LIGHT.green}>
                            <Feather name="check" size={18} color={LIGHT.green} />
                        </IconBox>
                        <Card style={{ backgroundColor: LIGHT.card, borderColor: LIGHT.border, width: "100%", gap: 4 }}>
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
                                <Feather name="volume-2" size={12} color={LIGHT.label} style={{ marginTop: 1 }} />
                                <Text style={styles.transcript}>{result.transcript}</Text>
                            </View>
                        </Card>
                        <Hint color={LIGHT.label}>Saved to your detected transactions — confirm it in Spendly.</Hint>
                        <View style={styles.row}>
                            <Button variant="outline" color={LIGHT.text} borderColor={LIGHT.border} onPress={onClose}>
                                Done
                            </Button>
                            <Button icon="external-link" onPress={() => Linking.openURL(baseUrl)}>Open Spendly</Button>
                        </View>
                    </>
                )}

                {phase === "error" && (
                    <>
                        <IconBox color={LIGHT.danger}>
                            <Feather name="alert-circle" size={18} color={LIGHT.danger} />
                        </IconBox>
                        <Text style={styles.error}>{error}</Text>
                        <Button variant="outline" color={LIGHT.text} borderColor={LIGHT.border} onPress={onClose}>
                            Close
                        </Button>
                    </>
                )}
            </View>
        </View>
    );
};

// Three same-gradient circles layered at decreasing size/increasing
// opacity fake a soft glow falloff — there's no blur primitive available
// without adding expo-blur, and this reads close enough at this scale.
const GradientBlob = ({ start, end }: { start: { x: number; y: number }; end: { x: number; y: number } }) => (
    <View style={styles.blob}>
        <LinearGradient colors={GRADIENT} start={start} end={end} style={[styles.blobLayer, styles.blobLayerOuter]} />
        <LinearGradient colors={GRADIENT} start={start} end={end} style={[styles.blobLayer, styles.blobLayerMid]} />
        <LinearGradient colors={GRADIENT} start={start} end={end} style={[styles.blobLayer, styles.blobLayerCore]} />
    </View>
);

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: LIGHT.bg },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 48,
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    title: { color: LIGHT.text, fontSize: 20, fontWeight: "700" },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: LIGHT.card,
        borderWidth: 1,
        borderColor: LIGHT.border,
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
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIGHT.danger },
    statusText: { color: LIGHT.label, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
    orbWrap: {
        width: ORB_SIZE,
        height: ORB_SIZE,
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 6,
    },
    orbitLayer: {
        position: "absolute",
        width: ORB_SIZE,
        height: ORB_SIZE,
    },
    blobSlot: {
        position: "absolute",
        left: (ORB_SIZE - BLOB_WRAP) / 2,
        top: (ORB_SIZE - BLOB_WRAP) / 2,
        width: BLOB_WRAP,
        height: BLOB_WRAP,
        alignItems: "center",
        justifyContent: "center",
    },
    blob: { width: BLOB_WRAP, height: BLOB_WRAP, alignItems: "center", justifyContent: "center" },
    blobLayer: { position: "absolute", borderRadius: 999 },
    blobLayerOuter: { width: BLOB_WRAP, height: BLOB_WRAP, opacity: 0.15 },
    blobLayerMid: { width: Math.round(BLOB_CORE * 1.3), height: Math.round(BLOB_CORE * 1.3), opacity: 0.35 },
    blobLayerCore: { width: BLOB_CORE, height: BLOB_CORE, opacity: 1 },
    micCore: {
        position: "absolute",
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: LIGHT.card,
        borderWidth: 1,
        borderColor: LIGHT.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    lockPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: LIGHT.border,
        backgroundColor: LIGHT.card,
    },
    lockPillActive: { borderColor: LIGHT.accent },
    lockLabel: { color: LIGHT.label, fontSize: 12, fontWeight: "600" },
    row: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 4 },
    payee: { color: LIGHT.text, fontSize: 17, fontWeight: "600" },
    sub: { color: LIGHT.label, fontSize: 13 },
    transcriptRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
    transcript: { color: LIGHT.label, fontSize: 12, fontStyle: "italic", flex: 1 },
    error: { color: LIGHT.danger, fontSize: 14, textAlign: "center" },
});
