import { create } from "zustand";
import type { NewTransactionPrefill } from "./use-new-transaction";
import type { NewTransferPrefill } from "./use-new-transfer";

// When a voice note finishes processing while a form sheet is already open
// (e.g. the user recorded a second note before saving the first), the result
// waits here instead of overwriting the open sheet. The VoiceFab drains the
// queue as sheets close, oldest first.
export type QueuedVoiceResult =
    | { kind: "transaction"; prefill: NewTransactionPrefill }
    | { kind: "transfer"; prefill: NewTransferPrefill };

type VoiceResultQueueState = {
    pending: QueuedVoiceResult[];
    enqueue: (result: QueuedVoiceResult) => void;
    shift: () => QueuedVoiceResult | undefined;
};

export const useVoiceResultQueue = create<VoiceResultQueueState>((set, get) => ({
    pending: [],
    enqueue: (result) => set({ pending: [...get().pending, result] }),
    shift: () => {
        const [head, ...rest] = get().pending;
        if (head) set({ pending: rest });
        return head;
    },
}));
