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
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
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
// Levels are dBFS (negative; closer to 0 = louder) — but unlike the web
// app (a real Web Audio AnalyserNode, consistently calibrated), Android's
// MediaRecorder-based metering varies a lot by device/manufacturer: a
// fixed absolute cutoff tuned against one phone's "silence" can sit well
// above another phone's actual noise floor, so genuine silence never
// crosses it and auto-stop never fires. Fixed thresholds were tried twice
// (-38, then -32) and still failed on-device. Replaced with an adaptive
// floor: track the quietest reading actually observed this recording
// (see noiseFloorRef in the component) and define speech/silence as
// margins ABOVE that floor, so it self-calibrates to whatever a given
// phone's real silence reads as, instead of guessing a universal number.
const SILENCE_MARGIN_DB = 8;
const SPEECH_MARGIN_DB = 16;
const LOUD_MARGIN_DB = 40;
// Never let an anomalously-quiet reading drag the floor down further than
// a real phone mic's self-noise floor realistically goes — this was the
// actual bug: an uninitialized "no data yet" placeholder briefly got
// treated as a real reading and permanently pinned the floor here, and
// with the old -70 clamp that meant NOTHING real (including genuine
// silence) ever registered as quiet again for the rest of the recording.
const NOISE_FLOOR_CLAMP_MIN = -55;
const TRAILING_SILENCE_MS = 2500;
const NO_SPEECH_TIMEOUT_MS = 8000;
// Unconditional backstop, independent of metering entirely: if metering
// itself isn't reporting real values on a given device (a known issue in
// some expo-audio versions — see the prepareToRecordAsync fix below),
// every threshold-based auto-stop check above silently does nothing
// forever. This guarantees recording always ends and gets processed
// eventually no matter what, same as tapping the orb manually.
const MAX_RECORDING_MS = 45_000;

const ORB_SIZE = 200;
const INTRO_MS = 600;
// Kept low — a soft, subtle reaction, not an aggressive pulse.
const BASE_ROT_SPEED = 0.12;
const MAX_ROT_SPEED = 0.4;
const MAX_HOVER_INTENSITY = 0.3;
// The orb's "activity" (0..1) eases toward that target rather than
// snapping to it, so starting/stopping speech ramps smoothly instead of
// the orb jumping between a reacting and an idle state.
const ACTIVITY_ATTACK = 0.25;
const ACTIVITY_RELEASE = 0.06;

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
    // A second, lower-frequency noise layer blends in gently with hover
    // (live voice activity) -- a soft secondary undulation, not sharp
    // spikes. Kept subtle: low blend weight, close frequency to n0.
    float n1 = snoise3(vec3(uv * noiseScale * 1.4, iTime * 0.8 + 7.0)) * 0.5 + 0.5;
    float n = mix(n0, n1, hover * 0.12);
    float r0 = mix(mix(innerRadius, 1.0, 0.46), mix(innerRadius, 1.0, 0.54), n);
    float d0 = distance(uv, (r0 * invLen) * uv);
    float v0 = light1(1.0, 6.0, d0);
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
// other screen in the app. The recording view uses the app's standard
// dark theme (UI, matching every other screen) with a live shader orb
// behind the mic — a wobbling, noise-driven ring with an orbiting
// hotspot and a hue sweep — that stays still until you actually speak.
export const VoiceScreen = ({ baseUrl, token, onClose }: Props) => {
    const recorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });
    // Faster than the 150ms used before — the orb's own attack/release
    // envelope already smooths frame-to-frame, but it can only react as
    // fast as new metering values actually arrive.
    const recorderState = useAudioRecorderState(recorder, 60);

    const [phase, setPhase] = useState<Phase>("starting");
    const [locked, setLocked] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<VoiceResult | null>(null);
    const [orbUniforms, setOrbUniforms] = useState<OrbUniforms>(INITIAL_UNIFORMS);
    // TEMPORARY diagnostic overlay — five straight blind fixes for
    // auto-stop failed, so this surfaces the real live numbers instead of
    // guessing again. Remove once the underlying issue is confirmed fixed.
    const [debugInfo, setDebugInfo] = useState("");
    const debugThrottleRef = useRef(0);

    const hasSpokenRef = useRef(false);
    const quietSinceRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);
    const stoppingRef = useRef(false);
    const iconVisibleRef = useRef(false);
    const levelRef = useRef(0);
    const lockedRef = useRef(false);
    const activityRef = useRef(0);
    const activeTimeRef = useRef(0);
    // Seeded loud (0dBFS) so the running minimum converges DOWN to
    // whatever this phone's real ambient floor is, whatever that turns
    // out to be, rather than assuming a guessed starting point.
    const noiseFloorRef = useRef(0);

    const iconAnim = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;
    const dotBlink = useRef(new Animated.Value(1)).current;
    const loaderSpin = useRef(new Animated.Value(0)).current;
    const resultAnim = useRef(new Animated.Value(0)).current;

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
            // Redundant with isMeteringEnabled already in useAudioRecorder's
            // config below, confirmed by reading the installed version's
            // own Android source (AudioRecorder.kt): `meteringEnabled` is a
            // field set once from the constructor's options and never
            // reassigned by prepareRecording's options — so this call
            // can't be what's toggling it. Kept anyway since it's a
            // harmless, documented call shape (expo/expo#37241 reported it
            // as necessary on some version); the actual fix for metering
            // going stale is below, reading recorder.getStatus() directly.
            await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
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

    // Drives the shader orb every frame AND the silence auto-stop check.
    // `activity` (0..1) eases toward a target that scales with how loud
    // you actually are relative to this recording's adaptive noise floor
    // (silenceCeiling..loudCeiling), with a fast attack (quick to
    // pick up when you start talking) and a slow release (eases back down
    // instead of snapping off) — an envelope, not a hard gate. `iTime` and
    // `rot` advance proportionally to `activity`, so everything the shader
    // keys off `iTime` (noise wobble, hue sweep, orbiting hotspot) smoothly
    // decelerates to a stop rather than freezing/unfreezing abruptly.
    //
    // The silence check reads recorder.getStatus().metering DIRECTLY every
    // frame here, bypassing useAudioRecorderState/recorderState entirely
    // for this critical path. Confirmed by reading expo-audio's own source
    // (node_modules/expo-audio/src/utils/useAudioRecorderState.ts): that
    // hook deliberately SUPPRESSES its own state update — and therefore a
    // React re-render — whenever the new metering reading is within 0.1dB
    // of the previous one. Real silence is acoustically stable frame to
    // frame, so it routinely stays within that 0.1dB band, meaning
    // recorderState.metering (and anything derived from it, no matter how
    // it's consumed downstream) can simply stop updating for the rest of a
    // quiet stretch. No amount of restructuring the CONSUMING code could
    // ever fix that — the suppression happens upstream, inside the library
    // hook itself. recorder.getStatus() is the same plain method that hook
    // calls internally; calling it ourselves here gets the untouched,
    // unsuppressed native value on every single frame instead.
    //
    // No reanimated — plain rAF + state is fine for a single full-screen
    // canvas. The mic icon fades in a beat later.
    useEffect(() => {
        if (phase !== "recording") return;
        let raf: number;
        let lastTime = 0;
        let currentRot = 0;
        const tick = (t: number) => {
            if (!lastTime) lastTime = t;
            const dt = (t - lastTime) * 0.001;
            lastTime = t;

            // Only real samples calibrate the floor — the brief gap before
            // the recorder's first metering sample arrives must NOT be
            // treated as data, or it permanently anchors the floor at the
            // clamp minimum (this was the actual bug: everything after
            // that read as "louder than silence" forever, since nothing
            // could ever be quieter than an artificial rock-bottom floor).
            const rawDb = recorder.getStatus().metering ?? null;
            if (rawDb !== null) {
                noiseFloorRef.current = Math.max(NOISE_FLOOR_CLAMP_MIN, Math.min(noiseFloorRef.current, rawDb));
            }
            const db = rawDb ?? -160;
            const silenceCeiling = noiseFloorRef.current + SILENCE_MARGIN_DB;
            const speechFloor = noiseFloorRef.current + SPEECH_MARGIN_DB;
            const loudCeiling = noiseFloorRef.current + LOUD_MARGIN_DB;

            const targetActivity = db <= silenceCeiling ? 0 : Math.min(1, (db - silenceCeiling) / (loudCeiling - silenceCeiling));
            const rate = targetActivity > activityRef.current ? ACTIVITY_ATTACK : ACTIVITY_RELEASE;
            activityRef.current += (targetActivity - activityRef.current) * rate;
            const activity = activityRef.current;

            activeTimeRef.current += dt * activity;
            currentRot += dt * activity * (BASE_ROT_SPEED + activity * MAX_ROT_SPEED * 2.0);

            setOrbUniforms({
                iTime: activeTimeRef.current,
                iResolution: [ORB_SIZE, ORB_SIZE, 1],
                hue: 0,
                hover: activity,
                rot: currentRot,
                hoverIntensity: activity * MAX_HOVER_INTENSITY,
            });

            const now = Date.now();
            if (!lockedRef.current) {
                if (db >= speechFloor) {
                    hasSpokenRef.current = true;
                    quietSinceRef.current = null;
                } else if (db <= silenceCeiling) {
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
            } else {
                quietSinceRef.current = null;
            }

            if (t - debugThrottleRef.current > 200) {
                debugThrottleRef.current = t;
                const quietFor = quietSinceRef.current ? ((now - quietSinceRef.current) / 1000).toFixed(1) + "s" : "-";
                setDebugInfo(
                    `metering raw: ${rawDb === null ? "NULL (no sample yet)" : rawDb.toFixed(1) + " dB"}\n` +
                    `floor: ${noiseFloorRef.current.toFixed(1)}  silence<=${silenceCeiling.toFixed(1)}  speech>=${speechFloor.toFixed(1)}\n` +
                    `hasSpoken: ${hasSpokenRef.current}  quietFor: ${quietFor}  locked: ${lockedRef.current}\n` +
                    `activity: ${activity.toFixed(2)}`,
                );
            }

            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        const introTimer = setTimeout(() => {
            iconVisibleRef.current = true;
            Animated.timing(iconAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        }, INTRO_MS);
        // Unconditional — fires regardless of metering, locked, or anything
        // else above. void stopAndUpload() is itself idempotent (guarded by
        // stoppingRef), so this is safe even if a metering-based stop also
        // fires around the same moment.
        const maxDurationTimer = setTimeout(() => void stopAndUpload(), MAX_RECORDING_MS);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(introTimer);
            clearTimeout(maxDurationTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // The same orb keeps going while the recording is understood, now with
    // a gentle constant idle motion instead of voice-driven reaction (there
    // is no more live audio to react to) and a slightly shifted hue so
    // "processing" reads as visually distinct from "recording."
    useEffect(() => {
        if (phase !== "uploading") return;
        let raf: number;
        let lastTime = 0;
        let localTime = activeTimeRef.current;
        const tick = (t: number) => {
            if (!lastTime) lastTime = t;
            const dt = (t - lastTime) * 0.001;
            lastTime = t;
            localTime += dt;
            setOrbUniforms({
                iTime: localTime,
                iResolution: [ORB_SIZE, ORB_SIZE, 1],
                hue: 25,
                hover: 0.35,
                rot: localTime * 0.4,
                hoverIntensity: 0.12,
            });
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [phase]);

    useEffect(() => {
        lockedRef.current = locked;
        if (locked) quietSinceRef.current = null;
    }, [locked]);

    // Cosmetic only (the mic core's subtle scale-with-volume pulse) — fine
    // to source from the hook's possibly-suppressed value, unlike the
    // auto-stop path above which reads recorder.getStatus() directly.
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

    useEffect(() => {
        if (phase !== "uploading") return;
        loaderSpin.setValue(0);
        const loop = Animated.loop(
            Animated.timing(loaderSpin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
        );
        loop.start();
        return () => loop.stop();
    }, [phase, loaderSpin]);

    useEffect(() => {
        if (phase !== "done") return;
        resultAnim.setValue(0);
        Animated.timing(resultAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [phase, resultAnim]);

    const iconScale = iconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
    const corePulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
    const loaderRotate = loaderSpin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
    const resultScale = resultAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

    const handleOrbTap = () => {
        if (phase !== "recording" || !iconVisibleRef.current) return;
        void stopAndUpload();
    };

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
                    <View style={styles.orbGroup}>
                        <View style={styles.statusRow}>
                            <Animated.View style={[styles.liveDot, { opacity: dotBlink }]} />
                            <Text style={styles.statusText}>{locked ? "Recording" : "Listening"}</Text>
                        </View>

                        <Pressable
                            onPress={handleOrbTap}
                            hitSlop={20}
                            style={({ pressed }) => [styles.orbWrap, pressed && styles.orbWrapPressed]}
                        >
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
                                <Feather name="mic" size={30} color="#ffffff" />
                            </Animated.View>
                        </Pressable>

                        <Pressable
                            onPress={() => setLocked((l) => !l)}
                            style={({ pressed }) => [
                                styles.lockToggle,
                                locked && styles.lockToggleActive,
                                pressed && styles.lockTogglePressed,
                            ]}
                        >
                            <Feather name={locked ? "lock" : "unlock"} size={14} color={locked ? UI.accent : UI.label} />
                            <Text style={[styles.lockLabel, locked && { color: UI.accent }]}>
                                {locked ? "Locked" : "Lock"}
                            </Text>
                        </Pressable>

                        {/* TEMPORARY diagnostic overlay — remove once
                            auto-stop is confirmed fixed on-device. */}
                        {!!debugInfo && <Text style={styles.debugText}>{debugInfo}</Text>}
                    </View>
                )}

                {phase === "uploading" && (
                    <View style={styles.orbGroup}>
                        <View style={styles.orbWrap}>
                            {orbShader && (
                                <Canvas style={styles.orbCanvas}>
                                    <Fill>
                                        <Shader source={orbShader} uniforms={orbUniforms} />
                                    </Fill>
                                </Canvas>
                            )}
                            <View style={styles.micCore}>
                                <Animated.View style={{ transform: [{ rotate: loaderRotate }] }}>
                                    <Feather name="loader" size={26} color="#ffffff" />
                                </Animated.View>
                            </View>
                        </View>
                        <Text style={styles.processingTitle}>Understanding your voice note</Text>
                        <Hint>This usually takes a few seconds…</Hint>
                    </View>
                )}

                {phase === "done" && result && (
                    <Animated.View style={[styles.resultGroup, { opacity: resultAnim, transform: [{ scale: resultScale }] }]}>
                        <IconBox color={UI.green}>
                            <Feather name="check" size={18} color={UI.green} />
                        </IconBox>
                        <Card style={{ width: "100%", gap: 4 }}>
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
                    </Animated.View>
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
    orbGroup: { alignItems: "center", gap: 10 },
    resultGroup: { alignItems: "center", gap: 14, width: "100%" },
    processingTitle: { color: UI.text, fontSize: 16, fontWeight: "600", marginTop: 4 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: UI.danger },
    statusText: { color: UI.label, fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
    orbWrap: {
        width: ORB_SIZE,
        height: ORB_SIZE,
        alignItems: "center",
        justifyContent: "center",
    },
    orbWrapPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
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
        backgroundColor: UI.card,
        borderWidth: 1,
        borderColor: UI.border,
        alignItems: "center",
        justifyContent: "center",
    },
    lockToggle: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: `${UI.label}1a`,
    },
    lockToggleActive: { backgroundColor: `${UI.accent}26` },
    lockTogglePressed: { opacity: 0.7 },
    lockLabel: { color: UI.label, fontSize: 12, fontWeight: "600" },
    debugText: {
        marginTop: 8,
        color: "#84cc16",
        fontSize: 10,
        fontFamily: "monospace",
        textAlign: "center",
        backgroundColor: "#00000066",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
    },
    row: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 4 },
    payee: { color: UI.text, fontSize: 17, fontWeight: "600" },
    sub: { color: UI.label, fontSize: 13 },
    transcriptRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
    transcript: { color: UI.label, fontSize: 12, fontStyle: "italic", flex: 1 },
    error: { color: UI.danger, fontSize: 14, textAlign: "center" },
});
