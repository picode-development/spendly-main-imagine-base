"use client";

import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

export type VoiceParsedFields = {
    amount: number | null;
    payee: string | null;
    date: string | null;
    accountName: string | null;
    categoryName: string | null;
    toAccountName: string | null;
    note: string | null;
    isTransfer: boolean;
    switchTo: "transfer" | "transaction" | null;
};

type Props = {
    /** Receives the extracted fields to apply onto the open form */
    onParsed: (parsed: VoiceParsedFields | null, transcript: string) => void;
    disabled?: boolean;
};

// Footer mic that sits beside the Submit button (submit flex-3, mic flex-1).
// Tap → it expands and shows the live waveform; tap again → the spoken
// transaction fills the form's fields.
export const VoiceFormButton = ({ onParsed, disabled }: Props) => {
    const { isRecording, isProcessing, levels, toggle } = useVoiceRecorder(async (blob) => {
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/pending-transactions/voice", {
            method: "POST",
            body: form,
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            toast.error(body?.error ?? "Couldn't understand the recording");
            return;
        }
        const { data } = await res.json();
        onParsed(data?.parsed ?? null, data?.transcript ?? "");
    });

    return (
        <Button
            type="button"
            onClick={toggle}
            disabled={disabled || isProcessing}
            variant={isRecording ? "destructive" : "default"}
            aria-label={isRecording ? "Stop recording" : "Fill the form by voice"}
            className={cn(
                "shrink-0 transition-all duration-300",
                // Square icon button at rest; expands to fit the waveform while recording
                isRecording ? "w-28" : "w-9 px-0",
                // Same "Create New" gold-on-hover as the floating voice ball
                !isRecording && "bg-gradient-to-br from-[var(--header-gradient-from)] to-[var(--header-gradient-to)] text-white hover:bg-none hover:bg-[#e3b27a] hover:text-black hover:shadow-[0_0_15px_#e3b27a]",
            )}
        >
            {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
            ) : isRecording ? (
                <span className="flex h-4 items-center gap-[3px]" aria-hidden>
                    {levels.slice(0, 8).map((level, i) => (
                        <span
                            key={i}
                            className="w-[3px] rounded-full bg-current transition-[height] duration-75"
                            style={{ height: `${Math.max(25, level * 100)}%` }}
                        />
                    ))}
                </span>
            ) : (
                <Mic className="size-4" />
            )}
        </Button>
    );
};
