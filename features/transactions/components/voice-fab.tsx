"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, Mic, Square } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVoiceAutostart } from "@/hooks/use-voice-autostart";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useVoiceCreate } from "@/features/transactions/hooks/use-voice-create";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";
import { useOpenTransaction } from "@/features/transactions/hooks/use-open-transaction";
import { useNewTransfer } from "@/features/transactions/hooks/use-new-transfer";
import { useNewAccount } from "@/features/accounts/hooks/use-new-account";
import { useOpenAccount } from "@/features/accounts/hooks/use-open-account";
import { useNewCategory } from "@/features/categories/hooks/use-new-category";
import { useOpenCategory } from "@/features/categories/hooks/use-open-category";
import { usePendingPopup } from "@/features/transactions/hooks/use-pending-popup";

// Floating mic ball: above the assistant ball on desktop, above the bottom
// navigation on phones. While recording, a pill with the live waveform sits
// beside it; tap the ball again to stop.
export const VoiceFab = () => {
    const { isSignedIn } = useAuth();
    const onAudio = useVoiceCreate();
    const { isRecording, isProcessing, levels, toggle } = useVoiceRecorder(onAudio);
    const popupExpanded = usePendingPopup((s) => s.expanded);

    // Widget deep link (?widget-action=voice) — start recording as if the
    // mic ball had been tapped
    const voicePending = useVoiceAutostart((s) => s.pending);
    const consumeVoice = useVoiceAutostart((s) => s.consume);
    useEffect(() => {
        if (voicePending && isSignedIn && !isRecording && !isProcessing) {
            consumeVoice();
            toggle();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [voicePending, isSignedIn]);

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
        // The ball is the fixed anchor. On phones it hides while the detected-
        // transactions popup is expanded (the wide card would overlap it);
        // on desktop (xl) they don't interfere, so it stays visible.
        <div className={cn(
            "fixed right-4 bottom-20 xl:right-7 xl:bottom-[5.75rem] z-[70]",
            popupExpanded && "hidden xl:block",
        )}>
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
                    "group flex size-12 items-center justify-center rounded-full shadow-lg",
                    "transition-all duration-300 hover:scale-110 active:scale-95",
                    isRecording
                        ? "bg-destructive text-white hover:bg-destructive/90"
                        // Header-gradient ball at rest with a dull-white icon;
                        // on hover it becomes the exact "Create New" gold
                        // (#e3b27a with a warm glow, black icon)
                        : "bg-gradient-to-br from-[var(--header-gradient-from)] to-[var(--header-gradient-to)] text-white/70 hover:bg-none hover:bg-[#e3b27a] hover:text-black hover:shadow-[0_0_15px_#e3b27a]",
                )}
            >
                {isProcessing ? (
                    <Loader2 className="size-5 animate-spin text-white" />
                ) : isRecording ? (
                    <Square className="size-4 fill-current" />
                ) : (
                    <Mic className="size-5 transition-colors duration-300" />
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
