"use client";

import { useAuth } from "@clerk/nextjs";
import { Loader2, Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useVoiceCreate } from "@/features/transactions/hooks/use-voice-create";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { useOpenAccount } from "@/features/accounts/hooks/use-open-account";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";
import { useOpenCategory } from "@/features/categories/hooks/use-open-category";

// Floating mic ball: above the assistant ball on desktop, above the bottom
// navigation on phones. While recording, a pill with the live waveform sits
// beside it; tap the ball again to stop.
export const VoiceFab = () => {
    const { isSignedIn } = useAuth();
    const onAudio = useVoiceCreate();
    const { isRecording, isProcessing, levels, toggle } = useVoiceRecorder(onAudio);

    // Step aside while any sheet is open — same rule as the popup
    const anySheetOpen = [
        useNewTransaction((s) => s.isOpen),
        useOpenTransaction((s) => s.isOpen),
        useNewTransfer((s) => s.isOpen),
        useNewAccount((s) => s.isOpen),
        useOpenAccount((s) => s.isOpen),
        useNewCategory((s) => s.isOpen),
        useOpenCategory((s) => s.isOpen),
    ].some(Boolean);

    if (!isSignedIn || anySheetOpen) return null;

    return (
        // The ball is the fixed anchor — matches the assistant ball's size
        // (56px), blue, and right offset so the two stack in a clean column
        <div className="fixed right-4 bottom-20 xl:right-6 xl:bottom-[5.75rem] z-[70]">
            <button
                type="button"
                onClick={toggle}
                disabled={isProcessing}
                aria-label={
                    isRecording ? "Stop recording"
                    : isProcessing ? "Understanding your voice note"
                    : "Add a transaction by voice"
                }
                className={cn(
                    "flex size-14 items-center justify-center rounded-full text-white shadow-lg",
                    "transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95",
                    isRecording
                        ? "bg-destructive hover:bg-destructive/90"
                        // Spendly's brand green (the logo color) — distinct from
                        // the blue assistant ball below it
                        : "bg-[#02a149] hover:bg-[#029045]",
                )}
            >
                {isProcessing ? (
                    <Loader2 className="size-6 animate-spin" />
                ) : isRecording ? (
                    <Square className="size-5 fill-current" />
                ) : (
                    <Mic className="size-6" />
                )}
            </button>

            {/* Waveform pill — grows inward from the ball, which never moves */}
            {isRecording && (
                <div
                    aria-hidden
                    className="absolute right-full top-1/2 mr-3 flex h-10 -translate-y-1/2 items-center gap-[3px] rounded-full border bg-card px-4 shadow-lg"
                >
                    {levels.map((level, i) => (
                        <span
                            key={i}
                            className="w-[3px] rounded-full bg-destructive transition-[height] duration-75"
                            style={{ height: `${Math.max(18, level * 90)}%` }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
