"use client";

import { Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";

// "Speak the whole transaction": records with a live waveform, transcribes,
// extracts every field it can, and opens the matching pre-filled sheet —
// the transfer form when the user asked to move money between accounts.
export const VoiceTransactionButton = () => {
    const newTransaction = useNewTransaction();
    const newTransfer = useNewTransfer();

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

        // "Transfer funds from X to Y" → the transfer form, not a transaction
        if (parsed?.isTransfer) {
            newTransfer.onOpen({
                prefill: {
                    date: parsed.date ? new Date(parsed.date) : undefined,
                    amount: parsed.amount != null ? String(Math.abs(parsed.amount) / 1000) : "",
                    fromAccountName: parsed.accountName ?? undefined,
                    toAccountName: parsed.toAccountName ?? undefined,
                    notes: parsed.note ?? data?.transcript ?? undefined,
                },
            });
            return;
        }

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

    if (isRecording) {
        return (
            <Button
                onClick={toggle}
                size="sm"
                className="w-full lg:w-auto bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/30"
            >
                {/* Blinking record dot + live waveform driven by the mic */}
                <span className="relative mr-2 flex size-2.5" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-white" />
                </span>
                <span className="mr-2 flex h-5 items-end gap-[3px]" aria-hidden>
                    {levels.map((level, i) => (
                        <span
                            key={i}
                            className="w-[3px] rounded-full bg-white/90 transition-[height] duration-75"
                            style={{ height: `${Math.max(25, level * 100)}%` }}
                        />
                    ))}
                </span>
                Tap to stop
            </Button>
        );
    }

    if (isProcessing) {
        return (
            <Button size="sm" variant="secondary" disabled className="w-full lg:w-auto">
                <Sparkles className="size-4 mr-2 animate-pulse text-primary" />
                Understanding…
            </Button>
        );
    }

    return (
        <Button onClick={toggle} size="sm" className="w-full lg:w-auto">
            <Mic className="size-4 mr-2" />
            Voice
        </Button>
    );
};
