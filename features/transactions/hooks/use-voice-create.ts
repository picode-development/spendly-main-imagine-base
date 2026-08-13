"use client";

import { toast } from "sonner";

import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";

/**
 * Shared "speak the whole transaction" pipeline: sends the recording to the
 * voice endpoint and opens the matching pre-filled sheet — the transfer form
 * when the user asked to move money between accounts.
 */
export const useVoiceCreate = () => {
    const newTransaction = useNewTransaction();
    const newTransfer = useNewTransfer();

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

        // "Transfer funds from X to Y" or "switch to transfer form" → the
        // transfer form, not a transaction
        if (parsed?.isTransfer || parsed?.switchTo === "transfer") {
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
    };
};
