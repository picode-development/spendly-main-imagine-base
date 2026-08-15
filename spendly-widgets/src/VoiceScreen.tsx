import React, { useEffect, useMemo, useRef, useState } from "react";
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

// A light theme used only on this screen, sourced exactly from the main
// app's real :root design tokens (app/globals.css) rather than invented
// colors — background/card/border/foreground/muted-foreground/destructive
// converted from their oklch values, accent from --header-gradient-to
// (already plain hex). No --success token exists anywhere in the site's
// CSS (light or dark), so `green` stays a plain Tailwind green-600
// stopgap, same as it was before this pass.
const LIGHT = {
    bg: "#f1f5f9",
    card: "#ffffff",
    border: "#e2e8f0",
    text: "#020618",
    label: "#62748e",
    danger: "#e7000b",
    green: "#16a34a",
    accent: "#3b82f6",
    accentDeep: "#1d4ed8",
} as const;

const ORB_SIZE = 176;
const PARTICLE_COUNT = 30;
const PARTICLE_MIN_R = 52;
const PARTICLE_MAX_R = 92;
const DRIVER_MS = 3000;
const INTRO_MS = 600;

type Particle = {
    x: number;
    y: number;
    size: number;
    color: string;
    phase: number;
    maxOpacity: number;
    driftX: number;
    driftY: number;
};

const pickParticleColor = () => {
    const r = Math.random();
    if (r < 0.7) return LIGHT.accent;
    if (r < 0.9) return LIGHT.accentDeep;
    return "#ffffff";
};

// Fixed at mount, never reshuffled — a scattered sparkle field, not two
// shapes orbiting the mic. Even area density via sqrt(random) radius
// sampling (uniform random radius would clump particles near center).
const generateParticles = (count: number): Particle[] =>
    Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * (PARTICLE_MAX_R - PARTICLE_MIN_R) + PARTICLE_MIN_R;
        const driftPx = 2 + Math.random() * 3;
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            size: 2 + Math.random() * 3,
            color: pickParticleColor(),
            phase: Math.random(),
            maxOpacity: 0.6 + Math.random() * 0.4,
            driftX: Math.cos(angle) * driftPx,
            driftY: Math.sin(angle) * driftPx,
        };
    });

type Props = {
    baseUrl: string;
    token: string | null;
    onClose: () => void;
};

type Phase = "starting" | "recording" | "uploading" | "done" | "error";

// A widget button opens this as its own full-screen page (PopupActivity),
// not a floating card — Android can't render a truly transparent Activity
// reliably, so this owns its own background and a real header like any
// other screen in the app. The recording view breaks from the app's dark
// theme (a light theme sourced from the main site's real tokens, per
// design reference) with a sparkle particle field — not shapes rotating
// around the mic — that flows in before the mic icon appears and
// recording begins.
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
    const particlesRef = useRef<Particle[] | null>(null);
    if (!particlesRef.current) particlesRef.current = generateParticles(PARTICLE_COUNT);
    const particles = particlesRef.current;

    const driver = useRef(new Animated.Value(0)).current;
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

    // The particle field: one shared clock drives every particle's
    // twinkle + drift via phase-shifted interpolation, so nothing pulses
    // in unison and only one native-driven loop is ever running. The mic
    // icon fades in a beat later — audio capture already began above,
    // this delay is purely visual.
    useEffect(() => {
        if (phase !== "recording") return;
        const loop = Animated.loop(
            Animated.timing(driver, { toValue: 1, duration: DRIVER_MS, easing: Easing.linear, useNativeDriver: true }),
        );
        loop.start();
        const introTimer = setTimeout(() => {
            iconVisibleRef.current = true;
            Animated.timing(iconAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        }, INTRO_MS);
        return () => {
            loop.stop();
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

    // Each particle reads the one shared driver at its own phase offset
    // via Animated.modulo — computed once since particles/driver are
    // stable for the life of this screen.
    const particleAnims = useMemo(
        () =>
            particles.map((p) => {
                const clock = Animated.modulo(Animated.add(driver, p.phase), 1);
                const opacity = clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, p.maxOpacity, 0.15] });
                const drift = clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
                const scale = clock.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1.15, 0.85] });
                return {
                    opacity,
                    scale,
                    translateX: Animated.multiply(drift, p.driftX),
                    translateY: Animated.multiply(drift, p.driftY),
                };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

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
                            <LinearGradient
                                colors={[LIGHT.accent, `${LIGHT.accent}00`]}
                                start={{ x: 0.35, y: 0.25 }}
                                end={{ x: 0.9, y: 0.9 }}
                                style={styles.glowOuter}
                            />
                            <LinearGradient
                                colors={[LIGHT.accent, `${LIGHT.accent}00`]}
                                start={{ x: 0.35, y: 0.25 }}
                                end={{ x: 0.9, y: 0.9 }}
                                style={styles.glowMid}
                            />

                            {particles.map((p, i) => (
                                <Animated.View
                                    key={i}
                                    style={[
                                        styles.particle,
                                        {
                                            left: ORB_SIZE / 2 + p.x - p.size / 2,
                                            top: ORB_SIZE / 2 + p.y - p.size / 2,
                                            width: p.size,
                                            height: p.size,
                                            borderRadius: p.size / 2,
                                            backgroundColor: p.color,
                                            opacity: particleAnims[i].opacity,
                                            transform: [
                                                { translateX: particleAnims[i].translateX },
                                                { translateY: particleAnims[i].translateY },
                                                { scale: particleAnims[i].scale },
                                            ],
                                        },
                                    ]}
                                />
                            ))}

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
    glowOuter: {
        position: "absolute",
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: ORB_SIZE / 2,
        opacity: 0.05,
    },
    glowMid: {
        position: "absolute",
        width: 130,
        height: 130,
        borderRadius: 65,
        opacity: 0.09,
    },
    particle: { position: "absolute" },
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
