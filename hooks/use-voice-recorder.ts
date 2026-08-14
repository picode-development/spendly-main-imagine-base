"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const VOICE_BARS = 12;

// Auto-stop tuning: once the user has spoken, this much sustained quiet ends
// the recording; if they never speak at all, give up sooner with a hint.
const SPEECH_LEVEL = 0.15;      // avg bar level that counts as speech
const SILENCE_LEVEL = 0.1;      // below this counts as quiet (hysteresis)
const TRAILING_SILENCE_MS = 2500;
const NO_SPEECH_TIMEOUT_MS = 8000;

/**
 * Tap to record, tap again to stop — or just stop talking: after speech,
 * ~2.5s of silence ends the recording automatically. `onAudio` receives the
 * finished clip; `isProcessing` is true while it runs (transcription/
 * extraction). `levels` is a live 0..1 spectrum (VOICE_BARS buckets) for
 * waveform UI.
 */
export const useVoiceRecorder = (onAudio: (blob: Blob) => Promise<void>) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [levels, setLevels] = useState<number[]>(() => Array(VOICE_BARS).fill(0));

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number>(0);
    const hasSpokenRef = useRef(false);
    const quietSinceRef = useRef<number | null>(null);
    const startedAtRef = useRef(0);

    const stopMeter = () => {
        cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setLevels(Array(VOICE_BARS).fill(0));
    };

    useEffect(() => () => {
        cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close().catch(() => {});
        recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    }, []);

    const startMeter = async (stream: MediaStream) => {
        try {
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            // Mobile browsers start audio contexts suspended — without this the
            // analyser reads silence and the waveform stays flat
            if (ctx.state === "suspended") await ctx.resume();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.6;
            ctx.createMediaStreamSource(stream).connect(analyser);

            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                analyser.getByteFrequencyData(data);
                // Voice lives in the lower bins — sample those into the bars
                const usable = Math.floor(data.length * 0.6);
                const bucket = Math.max(1, Math.floor(usable / VOICE_BARS));
                const next = Array.from({ length: VOICE_BARS }, (_, i) => {
                    let sum = 0;
                    for (let j = 0; j < bucket; j++) sum += data[i * bucket + j] ?? 0;
                    return Math.min(1, (sum / bucket) / 160);
                });
                setLevels(next);

                // Silence auto-stop
                const avg = next.reduce((a, v) => a + v, 0) / next.length;
                const now = Date.now();
                if (avg >= SPEECH_LEVEL) {
                    hasSpokenRef.current = true;
                    quietSinceRef.current = null;
                } else if (avg <= SILENCE_LEVEL) {
                    quietSinceRef.current ??= now;
                    const quietFor = now - quietSinceRef.current;
                    const recorder = recorderRef.current;
                    const canStop = recorder?.state === "recording";
                    if (canStop && hasSpokenRef.current && quietFor >= TRAILING_SILENCE_MS) {
                        recorder.stop();
                        return; // stop the meter loop; onstop cleans up
                    }
                    if (canStop && !hasSpokenRef.current && now - startedAtRef.current >= NO_SPEECH_TIMEOUT_MS) {
                        toast.info("Didn't hear anything — recording stopped.");
                        recorder.stop();
                        return;
                    }
                } else {
                    // Between thresholds — neither clear speech nor clear quiet
                    quietSinceRef.current = null;
                }

                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } catch {
            // No meter — recording still works, bars just stay flat
        }
    };

    const toggle = async () => {
        if (isProcessing) return;

        if (isRecording) {
            recorderRef.current?.stop();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                // Clean the signal at the source — the difference between
                // usable and garbled speech in noisy rooms
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
                ? "audio/webm"
                : undefined;
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach((track) => track.stop());
                stopMeter();
                setIsRecording(false);
                setIsProcessing(true);
                try {
                    await onAudio(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
                } finally {
                    setIsProcessing(false);
                }
            };

            recorderRef.current = recorder;
            hasSpokenRef.current = false;
            quietSinceRef.current = null;
            startedAtRef.current = Date.now();
            recorder.start();
            startMeter(stream);
            setIsRecording(true);
        } catch {
            toast.error("Microphone unavailable. Check browser permissions.");
        }
    };

    return { isRecording, isProcessing, levels, toggle };
};
