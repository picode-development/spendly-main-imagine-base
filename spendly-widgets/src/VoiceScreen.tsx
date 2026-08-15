import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Linking,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
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
// stopgap.
const LIGHT = {
    bg: "#f1f5f9",
    card: "#ffffff",
    border: "#e2e8f0",
    text: "#020618",
    label: "#62748e",
    danger: "#e7000b",
    green: "#16a34a",
    accent: "#3b82f6",
} as const;

const ORB_SIZE = 200;
const INTRO_MS = 600;
const BASE_ROT_SPEED = 0.3;
const MAX_ROT_SPEED = 1.2;
const MAX_HOVER_INTENSITY = 0.8;

// A noise-driven "voice orb" shader — an organic wobbling ring with a
// slowly orbiting hotspot and a hue sweep around its edge, ported from a
// WebGL reference (github.com Shadertoy-style GLSL) almost verbatim: SKSL
// is a GLSL-ES subset, the only structural change is the entry point
// (fragCoord is a function argument here, not gl_FragCoord) and dropping
// precision qualifiers, which SKSL doesn't use.
const ORB_SHADER_SOURCE = `
uniform float iTime;
uniform vec3 iResolution;
uniform float hue;
uniform float hover;
uniform float rot;
uniform float hoverIntensity;

vec3 rgb2yiq(vec3 c) {
    float y = dot(c, vec3(0.299, 0.587, 0.114));
    float i = dot(c, vec3(0.596, -0.274, -0.322));
    float q = dot(c, vec3(0.211, -0.523, 0.312));
    return vec3(y, i, q);
}

vec3 yiq2rgb(vec3 c) {
    float r = c.x + 0.956 * c.y + 0.621 * c.z;
    float g = c.x - 0.272 * c.y - 0.647 * c.z;
    float b = c.x - 1.106 * c.y + 1.703 * c.z;
    return vec3(r, g, b);
}

vec3 adjustHue(vec3 color, float hueDeg) {
    float hueRad = hueDeg * 3.14159265 / 180.0;
    vec3 yiq = rgb2yiq(color);
    float cosA = cos(hueRad);
    float sinA = sin(hueRad);
    float i = yiq.y * cosA - yiq.z * sinA;
    float q = yiq.y * sinA + yiq.z * cosA;
    yiq.y = i;
    yiq.z = q;
    return yiq2rgb(yiq);
}

vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
    p3 += dot(p3, p3.yxz + 19.19);
    return -1.0 + 2.0 * fract(vec3(
        p3.x + p3.y,
        p3.x + p3.z,
        p3.y + p3.z
    ) * p3.zyx);
}

float snoise3(vec3 p) {
    const float K1 = 0.333333333;
    const float K2 = 0.166666667;
    vec3 i = floor(p + (p.x + p.y + p.z) * K1);
    vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
    vec3 e = step(vec3(0.0), d0 - d0.yzx);
    vec3 i1 = e * (1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1.0 - e);
    vec3 d1 = d0 - (i1 - K2);
    vec3 d2 = d0 - (i2 - K1);
    vec3 d3 = d0 - 0.5;
    vec4 h = max(0.6 - vec4(
        dot(d0, d0),
        dot(d1, d1),
        dot(d2, d2),
        dot(d3, d3)
    ), 0.0);
    vec4 n = h * h * h * h * vec4(
        dot(d0, hash33(i)),
        dot(d1, hash33(i + i1)),
        dot(d2, hash33(i + i2)),
        dot(d3, hash33(i + 1.0))
    );
    return dot(vec4(31.316), n);
}

vec4 extractAlpha(vec3 colorIn) {
    float a = max(max(colorIn.r, colorIn.g), colorIn.b);
    return vec4(colorIn.rgb / (a + 1e-5), a);
}

const vec3 baseColor1 = vec3(0.611765, 0.262745, 0.996078);
const vec3 baseColor2 = vec3(0.298039, 0.760784, 0.913725);
const vec3 baseColor3 = vec3(0.062745, 0.078431, 0.600000);
const float innerRadius = 0.6;
const float noiseScale = 0.65;

float light1(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * attenuation);
}

float light2(float intensity, float attenuation, float dist) {
    return intensity / (1.0 + dist * dist * attenuation);
}

vec4 draw(vec2 uv) {
    vec3 color1 = adjustHue(baseColor1, hue);
    vec3 color2 = adjustHue(baseColor2, hue);
    vec3 color3 = adjustHue(baseColor3, hue);

    float ang = atan(uv.y, uv.x);
    float len = length(uv);
    float invLen = len > 0.0 ? 1.0 / len : 0.0;

    float n0 = snoise3(vec3(uv * noiseScale, iTime * 0.5)) * 0.5 + 0.5;
    float r0 = mix(mix(innerRadius, 1.0, 0.4), mix(innerRadius, 1.0, 0.6), n0);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 10.0, d0);
    v0 *= smoothstep(r0 * 1.05, r0, len);
    float cl = cos(ang + iTime * 2.0) * 0.5 + 0.5;

    float a = iTime * -1.0;
    vec2 pos = vec2(cos(a), sin(a)) * r0;
    float d = distance(uv, pos);
    float v1 = light2(1.5, 5.0, d);
    v1 *= light1(1.0, 50.0, d0);

    float v2 = smoothstep(1.0, mix(innerRadius, 1.0, n0 * 0.5), len);
    float v3 = smoothstep(innerRadius, mix(innerRadius, 1.0, 0.5), len);

    vec3 col = mix(color1, color2, cl);
    col = mix(color3, col, v0);
    col = (col + v1) * v2 * v3;
    col = clamp(col, 0.0, 1.0);

    return extractAlpha(col);
}

vec4 mainImage(vec2 fragCoord) {
    vec2 center = iResolution.xy * 0.5;
    float size = min(iResolution.x, iResolution.y);
    vec2 uv = (fragCoord - center) / size * 2.0;

    float angle = rot;
    float s = sin(angle);
    float c = cos(angle);
    uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

    uv.x += hover * hoverIntensity * 0.1 * sin(uv.y * 10.0 + iTime);
    uv.y += hover * hoverIntensity * 0.1 * sin(uv.x * 10.0 + iTime);

    return draw(uv);
}

vec4 main(vec2 fragCoord) {
    vec4 col = mainImage(fragCoord);
    return vec4(col.rgb * col.a, col.a);
}
`;

type OrbUniforms = {
    iTime: number;
    iResolution: [number, number, number];
    hue: number;
    hover: number;
    rot: number;
    hoverIntensity: number;
};

const INITIAL_UNIFORMS: OrbUniforms = {
    iTime: 0,
    iResolution: [ORB_SIZE, ORB_SIZE, 1],
    hue: 0,
    hover: 0,
    rot: 0,
    hoverIntensity: 0,
};

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
// theme (a light theme sourced from the main site's real tokens) with a
// live shader orb behind the mic — a wobbling, noise-driven ring with an
// orbiting hotspot and a hue sweep, reacting to live mic volume — rather
// than a flat CSS approximation.
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
    const [orbUniforms, setOrbUniforms] = useState<OrbUniforms>(INITIAL_UNIFORMS);

    const hasSpokenRef = useRef(false);
    const quietSinceRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);
    const stoppingRef = useRef(false);
    const iconVisibleRef = useRef(false);
    const levelRef = useRef(0);

    const iconAnim = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;
    const dotBlink = useRef(new Animated.Value(1)).current;

    // Guarded rather than asserted non-null: this shader was hand-ported
    // from GLSL to SKSL and hasn't been run through a device compile yet,
    // so a bad port should fall back to no orb (mic icon still works)
    // instead of crashing the whole recording screen.
    const orbShader = useMemo(() => Skia.RuntimeEffect.Make(ORB_SHADER_SOURCE), []);

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

    // Drives the shader orb every frame: rotation speed and ripple
    // intensity both scale with live mic volume, same as the reference.
    // No reanimated — plain rAF + state is fine for a single full-screen
    // canvas. The mic icon fades in a beat later; the orb itself is live
    // from the first frame.
    useEffect(() => {
        if (phase !== "recording") return;
        let raf: number;
        let lastTime = 0;
        let currentRot = 0;
        const tick = (t: number) => {
            if (!lastTime) lastTime = t;
            const dt = (t - lastTime) * 0.001;
            lastTime = t;
            const voiceLevel = levelRef.current;
            const voiceRotSpeed = BASE_ROT_SPEED + voiceLevel * MAX_ROT_SPEED * 2.0;
            if (voiceLevel > 0.05) currentRot += dt * voiceRotSpeed;
            setOrbUniforms({
                iTime: t * 0.001,
                iResolution: [ORB_SIZE, ORB_SIZE, 1],
                hue: 0,
                hover: Math.min(voiceLevel * 2.0, 1.0),
                rot: currentRot,
                hoverIntensity: Math.min(voiceLevel * MAX_HOVER_INTENSITY * 0.8, MAX_HOVER_INTENSITY),
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        const introTimer = setTimeout(() => {
            iconVisibleRef.current = true;
            Animated.timing(iconAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        }, INTRO_MS);
        return () => {
            cancelAnimationFrame(raf);
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
        levelRef.current = level;
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
                            {orbShader && (
                                <Canvas style={styles.orbCanvas}>
                                    <Fill>
                                        <Shader source={orbShader} uniforms={orbUniforms} />
                                    </Fill>
                                </Canvas>
                            )}

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
    orbCanvas: {
        position: "absolute",
        width: ORB_SIZE,
        height: ORB_SIZE,
    },
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
