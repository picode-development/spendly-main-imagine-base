"use client";

import { Loader2, Mic } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

// "Speak the whole transaction": records with a live waveform, transcribes,
// extracts every field it can, and opens the pre-filled transaction sheet
export const VoiceTransactionButton = () => {
    const newTransaction = useNewTransaction();

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
        const parsed = data?.parsed;

        newTransaction.onOpen({
            prefill: {
                date: parsed?.date ? new Date(parsed.date) : undefined,
                payee: parsed?.payee ?? "",
                amount: parsed?.amount != null ? String(parsed.amount / 1000) : "",
                notes: parsed?.note ?? data?.transcript ?? undefined,
                accountName: parsed?.accountName ?? undefined,
                categoryName: parsed?.categoryName ?? undefined,
            },
        });
    });

    return (
        <Button
            onClick={toggle}
            size="sm"
            variant={isRecording ? "destructive" : "default"}
            disabled={isProcessing}
            className="w-full lg:w-auto"
        >
            {isProcessing ? (
                <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Thinking…
                </>
            ) : isRecording ? (
                <>
                    {/* Live waveform driven by the mic input */}
                    <span className="mr-2 flex h-4 items-center gap-[2px]" aria-hidden>
                        {levels.map((level, i) => (
                            <span
                                key={i}
                                className="w-[2px] rounded-full bg-current transition-[height] duration-75"
                                style={{ height: `${Math.max(15, level * 100)}%` }}
                            />
                        ))}
                    </span>
                    Listening…
                </>
            ) : (
                <>
                    <Mic className="size-4 mr-2" />
                    Voice
                </>
            )}
        </Button>
    );
};
