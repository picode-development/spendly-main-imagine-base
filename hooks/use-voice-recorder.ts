"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const VOICE_BARS = 12;

/**
 * Tap to record, tap again to stop. `onAudio` receives the finished clip;
 * `isProcessing` is true while it runs (transcription/extraction).
 * `levels` is a live 0..1 spectrum (VOICE_BARS buckets) for waveform UI.
 */
export const useVoiceRecorder = (onAudio: (blob: Blob) => Promise<void>) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [levels, setLevels] = useState<number[]>(() => Array(VOICE_BARS).fill(0));

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number>(0);

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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
            recorder.start();
            startMeter(stream);
            setIsRecording(true);
        } catch {
            toast.error("Microphone unavailable. Check browser permissions.");
        }
    };

    return { isRecording, isProcessing, levels, toggle };
};
