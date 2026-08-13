"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

/**
 * Tap to record, tap again to stop. `onAudio` receives the finished clip;
 * `isProcessing` is true while it runs (transcription/extraction).
 */
export const useVoiceRecorder = (onAudio: (blob: Blob) => Promise<void>) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

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
            setIsRecording(true);
        } catch {
            toast.error("Microphone unavailable. Check browser permissions.");
        }
    };

    return { isRecording, isProcessing, toggle };
};
