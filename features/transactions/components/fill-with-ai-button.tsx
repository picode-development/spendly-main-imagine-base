"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/hono";
import type { VoiceParsedFields } from "./voice-form-button";

type Props = {
    /** Hosted image URL of the attached receipt/screenshot */
    imageUrl?: string;
    /** Applies the extracted fields onto the open form */
    onParsed: (parsed: VoiceParsedFields) => void;
    disabled?: boolean;
};

// Re-runs AI extraction on the attached screenshot — the recovery for a
// detection that came back blank (usually a momentary rate-limit at share
// time, long since cooled by the time the user is reviewing).
export const FillWithAiButton = ({ imageUrl, onParsed, disabled }: Props) => {
    const [loading, setLoading] = useState(false);

    if (!imageUrl) return null;

    const run = async () => {
        setLoading(true);
        try {
            const res = await client.api["pending-transactions"]["extract-image"].$post({
                json: { image: imageUrl },
            });
            const data = res.ok ? (await res.json()).data : null;
            if (!data) {
                toast.error("Couldn't read the screenshot. Try once more or fill it in.");
                return;
            }
            onParsed({
                amount: data.amount ?? null,
                payee: data.payee ?? null,
                date: data.date ?? null,
                accountName: data.accountName ?? null,
                categoryName: data.categoryName ?? null,
                toAccountName: data.toAccountName ?? null,
                note: data.note ?? null,
                isTransfer: data.isTransfer ?? false,
                switchTo: data.switchTo ?? null,
            });
            toast.success("Filled from the screenshot");
        } catch {
            toast.error("Couldn't read the screenshot. Try once more or fill it in.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            type="button"
            variant="outline"
            className="w-full border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
            onClick={run}
            disabled={disabled || loading}
        >
            {loading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
                <Sparkles className="size-4 mr-2" />
            )}
            {loading ? "Reading the screenshot…" : "Fill with AI"}
        </Button>
    );
};
