import { create } from "zustand";

export type NewTransactionPrefill = {
    date?: Date;
    payee?: string;
    /** Display units as the form expects, e.g. "-520" */
    amount?: string;
    notes?: string;
};

type NewTransactionState = {
    isOpen: boolean;
    prefill?: NewTransactionPrefill;
    /** When set, confirming the transaction clears this pending detection */
    pendingId?: string;
    onOpen: (options?: { prefill?: NewTransactionPrefill; pendingId?: string }) => void;
    onClose: () => void;
};

export const  useNewTransaction = create<NewTransactionState>((set) => ({
    isOpen: false,
    prefill: undefined,
    pendingId: undefined,
    onOpen: (options) => set({
        isOpen: true,
        prefill: options?.prefill,
        pendingId: options?.pendingId,
    }),
    onClose: () => set({ isOpen: false, prefill: undefined, pendingId: undefined }),
}));
