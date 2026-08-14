import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
    RecordingPresets,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
} from "expo-audio";
import { uploadVoice, VoiceResult } from "./api";
import { formatINR } from "./format";
import { Button, Hint, UI } from "./ui";

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

// Popup voice note: opens from the widget, starts recording immediately,
// auto-stops on silence, then shows what Spendly understood. The parsed
// transaction is staged in Spendly's detected-transactions for review.
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
            // Leaving the popup mid-recording discards it
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

    return (
        <View style={styles.backdrop}>
            <View style={styles.sheet}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>Voice note</Text>
                    <Pressable onPress={onClose} hitSlop={12}>
                        <Text style={styles.close}>✕</Text>
                    </Pressable>
                </View>

                {phase === "starting" && <ActivityIndicator color={UI.accent} style={{ marginVertical: 24 }} />}

                {phase === "recording" && (
                    <>
                        <View style={styles.meterTrack}>
                            <View style={[styles.meterFill, { flex: Math.max(0.04, level) }]} />
                            <View style={{ flex: Math.max(0.04, 1 - level) }} />
                        </View>
                        <Hint>
                            Speak the transaction — it stops by itself when you go quiet.
                            {locked ? " Auto-stop is off." : ""}
                        </Hint>
                        <View style={styles.row}>
                            <Button
                                variant={locked ? "gold" : "outline"}
                                onPress={() => setLocked((l) => !l)}
                            >
                                {locked ? "🔒 Locked" : "Lock (pause freely)"}
                            </Button>
                            <Button onPress={stopAndUpload}>Stop</Button>
                        </View>
                    </>
                )}

                {phase === "uploading" && (
                    <>
                        <ActivityIndicator color={UI.accent} style={{ marginVertical: 12 }} />
                        <Hint>Understanding your voice note…</Hint>
                    </>
                )}

                {phase === "done" && result && (
                    <>
                        <View style={styles.resultCard}>
                            {result.parsed?.amount != null && (
                                <Text style={styles.amount}>{formatINR(Math.abs(result.parsed.amount))}</Text>
                            )}
                            {result.parsed?.payee && <Text style={styles.payee}>{result.parsed.payee}</Text>}
                            <Text style={styles.sub}>
                                {[result.parsed?.accountName, result.parsed?.categoryName, result.parsed?.date]
                                    .filter(Boolean).join(" · ") || "Details to fill in Spendly"}
                            </Text>
                            {result.parsed?.note && <Text style={styles.sub}>{result.parsed.note}</Text>}
                            <Text style={styles.transcript}>“{result.transcript}”</Text>
                        </View>
                        <Hint>Saved to your detected transactions — confirm it in Spendly.</Hint>
                        <View style={styles.row}>
                            <Button variant="outline" onPress={onClose}>Done</Button>
                            <Button onPress={() => Linking.openURL(baseUrl)}>Open Spendly</Button>
                        </View>
                    </>
                )}

                {phase === "error" && (
                    <>
                        <Text style={styles.error}>{error}</Text>
                        <Button variant="outline" onPress={onClose}>Close</Button>
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
    meterTrack: {
        flexDirection: "row",
        height: 10,
        borderRadius: 5,
        backgroundColor: UI.bg,
        overflow: "hidden",
        marginVertical: 8,
    },
    meterFill: { backgroundColor: UI.danger, borderRadius: 5 },
    row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    resultCard: {
        backgroundColor: UI.bg,
        borderColor: UI.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 14,
        padding: 14,
        gap: 4,
    },
    amount: { color: UI.danger, fontSize: 26, fontWeight: "800" },
    payee: { color: UI.text, fontSize: 17, fontWeight: "600" },
    sub: { color: UI.label, fontSize: 13 },
    transcript: { color: UI.label, fontSize: 12, fontStyle: "italic", marginTop: 6 },
    error: { color: UI.danger, fontSize: 14 },
});
