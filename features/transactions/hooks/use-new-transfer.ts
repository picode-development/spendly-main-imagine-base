import { create } from "zustand";

export type NewTransferPrefill = {
    date?: Date;
    /** Positive display units, e.g. "500" */
    amount?: string;
    /** Account NAMES (matched to ids by the sheet's loaded options) */
    fromAccountName?: string;
    toAccountName?: string;
    notes?: string;
};

type NewTransferState = {
    isOpen: boolean;
    prefill?: NewTransferPrefill;
    /** Changes on every prefilled open so the form remounts with new defaults */
    prefillKey?: number;
    onOpen: (options?: { prefill?: NewTransferPrefill }) => void;
    onClose: () => void;
};

export const useNewTransfer = create<NewTransferState>((set) => ({
    isOpen: false,
    prefill: undefined,
    prefillKey: undefined,
    onOpen: (options) => set({
        isOpen: true,
        prefill: options?.prefill,
        prefillKey: options?.prefill ? Date.now() : undefined,
    }),
    onClose: () => set({ isOpen: false, prefill: undefined, prefillKey: undefined }),
}));
