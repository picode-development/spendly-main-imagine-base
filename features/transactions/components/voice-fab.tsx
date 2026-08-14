"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Loader2, Lock, LockOpen, Mic, Square } from "lucide-react";

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
import { useVoiceResultQueue } from "@/features/transactions/hooks/use-voice-result-queue";

// Floating mic ball: above the assistant ball on desktop, above the bottom
// navigation on phones. While recording, a pill with the live waveform sits
// beside it; tap the ball again to stop.
export const VoiceFab = () => {
    const { isSignedIn } = useAuth();
    const onAudio = useVoiceCreate();
    const { isRecording, isProcessing, isLocked, levels, toggle, toggleLock } =
        useVoiceRecorder(onAudio);
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

    // A voice result that finished while a sheet was open waits its turn —
    // deliver it as soon as the sheets clear
    const queuedCount = useVoiceResultQueue((s) => s.pending.length);
    const newTransactionOpen = useNewTransaction((s) => s.onOpen);
    const newTransferOpen = useNewTransfer((s) => s.onOpen);
    useEffect(() => {
        if (anySheetOpen || queuedCount === 0) return;
        const next = useVoiceResultQueue.getState().shift();
        if (!next) return;
        if (next.kind === "transfer") newTransferOpen({ prefill: next.prefill });
        else newTransactionOpen({ prefill: next.prefill });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anySheetOpen, queuedCount]);

    // An active or processing recording must stay visible and controllable
    // even when a sheet opens over the dashboard (e.g. the previous voice
    // note's form just appeared while the user records the next one)
    if (!isSignedIn || (anySheetOpen && !isRecording && !isProcessing)) return null;

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

            {/* Waveform pill — grows inward from the ball, which never moves.
                The lock keeps the recording open through long pauses (silence
                auto-stop is suspended while locked). */}
            {isRecording && (
                <div className="absolute right-full top-1/2 mr-3 flex h-10 -translate-y-1/2 items-center gap-[3px] rounded-full border bg-card px-3 shadow-lg">
                    <button
                        type="button"
                        onClick={toggleLock}
                        aria-label={isLocked
                            ? "Unlock — resume auto-stop on silence"
                            : "Lock — keep recording through pauses"}
                        title={isLocked ? "Auto-stop off" : "Auto-stop on"}
                        className={cn(
                            "mr-2 flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                            isLocked
                                ? "bg-[#e3b27a] text-black shadow-[0_0_10px_#e3b27a]"
                                : "text-muted-foreground hover:bg-muted",
                        )}
                    >
                        {isLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                    </button>
                    <div aria-hidden className="flex h-full items-center gap-[3px]">
                        {levels.map((level, i) => (
                            <span
                                key={i}
                                className="w-[3px] rounded-full bg-destructive transition-[height] duration-75"
                                style={{ height: `${Math.max(18, level * 90)}%` }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
