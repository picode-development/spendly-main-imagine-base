"use client";

import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

type Props = {
    /** Receives the spoken text once transcribed */
    onResult: (transcript: string) => void;
    label: string;
};

// Small per-field mic: speak the value, it lands in the field. While
// recording it shows a live mini-waveform inside a red ring.
export const VoiceFieldButton = ({ onResult, label }: Props) => {
    const { isRecording, isProcessing, levels, toggle } = useVoiceRecorder(async (blob) => {
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/pending-transactions/voice?mode=transcribe", {
            method: "POST",
            body: form,
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            toast.error(body?.error ?? "Couldn't understand the recording");
            return;
        }
        const { data } = await res.json();
        if (data?.transcript) onResult(data.transcript);
    });

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={isRecording ? `Stop recording ${label}` : `Speak ${label}`}
            className={cn(
                "flex h-6 items-center justify-center rounded-full transition-all",
                isRecording
                    ? "w-12 gap-[2px] bg-destructive/10 px-2 text-destructive ring-2 ring-destructive/40"
                    : "w-6 text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {isProcessing ? (
                <Loader2 className="size-3.5 animate-spin" />
            ) : isRecording ? (
                // Live mini-waveform (3 buckets sampled from the spectrum)
                [2, 5, 8].map((bucket) => (
                    <span
                        key={bucket}
                        aria-hidden
                        className="w-[2px] rounded-full bg-current transition-[height] duration-75"
                        style={{ height: `${Math.max(20, (levels[bucket] ?? 0) * 100)}%` }}
                    />
                ))
            ) : (
                <Mic className="size-3.5" />
            )}
        </button>
    );
};
