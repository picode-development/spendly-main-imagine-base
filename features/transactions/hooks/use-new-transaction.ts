import { create } from "zustand";
import { TransactionImage } from "@/db/schema";

export type NewTransactionPrefill = {
    date?: Date;
    payee?: string;
    /** Display units as the form expects, e.g. "-520" */
    amount?: string;
    notes?: string;
    /** Account/category NAMES (matched to ids by the sheet's loaded options) */
    accountName?: string;
    categoryName?: string;
    /** Receipt images to attach (e.g. a shared payment screenshot) */
    imageUrls?: TransactionImage[];
};

type NewTransactionState = {
    isOpen: boolean;
    prefill?: NewTransactionPrefill;
    /** Changes on every prefilled open so the form remounts with new defaults */
    prefillKey?: number;
    /** When set, confirming the transaction clears this pending detection */
    pendingId?: string;
    onOpen: (options?: { prefill?: NewTransactionPrefill; pendingId?: string }) => void;
    onClose: () => void;
};

export const  useNewTransaction = create<NewTransactionState>((set) => ({
    isOpen: false,
    prefill: undefined,
    prefillKey: undefined,
    pendingId: undefined,
    onOpen: (options) => set({
        isOpen: true,
        prefill: options?.prefill,
        prefillKey: options?.prefill ? Date.now() : undefined,
        pendingId: options?.pendingId,
    }),
    onClose: () => set({ isOpen: false, prefill: undefined, prefillKey: undefined, pendingId: undefined }),
}));
