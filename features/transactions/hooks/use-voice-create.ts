"use client";

import { toast } from "sonner";

import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import { useVoiceResultQueue, type QueuedVoiceResult } from "@/features/transactions/hooks/use-voice-result-queue";

/**
 * Shared "speak the whole transaction" pipeline: sends the recording to the
 * voice endpoint and opens the matching pre-filled sheet — the transfer form
 * when the user asked to move money between accounts. If a form sheet is
 * already open (the user recorded a second note before saving the first),
 * the result is queued and opens once that sheet closes.
 */
export const useVoiceCreate = () => {
    const newTransaction = useNewTransaction();
    const newTransfer = useNewTransfer();

    const deliver = (result: QueuedVoiceResult) => {
        const sheetBusy =
            useNewTransaction.getState().isOpen || useNewTransfer.getState().isOpen;
        if (sheetBusy) {
            useVoiceResultQueue.getState().enqueue(result);
            toast.info("Got it — this one opens after you finish the current form.");
            return;
        }
        if (result.kind === "transfer") newTransfer.onOpen({ prefill: result.prefill });
        else newTransaction.onOpen({ prefill: result.prefill });
    };

    return async (blob: Blob) => {
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

        // Extraction came back empty — say what was heard so the failure is
        // diagnosable instead of silently dumping the transcript into notes
        if (!parsed || (!parsed.isTransfer && parsed.amount == null && !parsed.payee && !parsed.accountName && !parsed.switchTo)) {
            toast.info(
                `Heard: "${data?.transcript ?? ""}" — couldn't pick out details, saved to notes.`,
                { duration: 8000 },
            );
        }

        // "Transfer funds from X to Y" or "switch to transfer form" → the
        // transfer form, not a transaction
        if (parsed?.isTransfer || parsed?.switchTo === "transfer") {
            deliver({
                kind: "transfer",
                prefill: {
                    date: parsed.date ? new Date(parsed.date) : undefined,
                    amount: parsed.amount != null ? String(Math.abs(parsed.amount) / 1000) : "",
                    fromAccountName: parsed.accountName ?? undefined,
                    toAccountName: parsed.toAccountName ?? undefined,
                    notes: parsed.note ?? undefined,
                },
            });
            return;
        }

        deliver({
            kind: "transaction",
            prefill: {
                date: parsed?.date ? new Date(parsed.date) : undefined,
                payee: parsed?.payee ?? "",
                amount: parsed?.amount != null ? String(parsed.amount / 1000) : "",
                notes: parsed?.note ?? undefined,
                accountName: parsed?.accountName ?? undefined,
                categoryName: parsed?.categoryName ?? undefined,
            },
        });
    };
};
