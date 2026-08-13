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
        <div className="fixed right-4 bottom-20 xl:right-6 xl:bottom-24 z-[70] flex items-center gap-2">
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
                    "flex size-12 items-center justify-center rounded-full shadow-lg transition-colors",
                    isRecording
                        ? "bg-rose-600 text-white shadow-rose-600/40"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
            >
                {isProcessing ? (
                    <Loader2 className="size-5 animate-spin" />
                ) : isRecording ? (
                    <Square className="size-4 fill-current" />
                ) : (
                    <Mic className="size-5" />
                )}
            </button>

            {/* Waveform pill — appears on the right of the ball while recording */}
            {isRecording && (
                <div
                    aria-hidden
                    className="flex h-10 items-center gap-[3px] rounded-full border border-rose-500/30 bg-card px-4 shadow-lg"
                >
                    {levels.map((level, i) => (
                        <span
                            key={i}
                            className="w-[3px] rounded-full bg-rose-500 transition-[height] duration-75"
                            style={{ height: `${Math.max(18, level * 90)}%` }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
