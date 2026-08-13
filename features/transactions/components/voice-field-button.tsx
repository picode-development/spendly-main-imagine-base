"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

type Props = {
    /** Receives the spoken text once transcribed */
    onResult: (transcript: string) => void;
    label: string;
};

// Small per-field mic: speak the value, it lands in the field
export const VoiceFieldButton = ({ onResult, label }: Props) => {
    const { isRecording, isProcessing, toggle } = useVoiceRecorder(async (blob) => {
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
                "flex size-6 items-center justify-center rounded-full transition-colors",
                isRecording
                    ? "bg-destructive/15 text-destructive animate-pulse"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
        >
            {isProcessing
                ? <Loader2 className="size-3.5 animate-spin" />
                : isRecording
                    ? <Square className="size-3" />
                    : <Mic className="size-3.5" />}
        </button>
    );
};
