import { create } from "zustand";

type NewTransferState = {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
};

export const useNewTransfer = create<NewTransferState>((set) => ({
    isOpen: false,
    onOpen: () => set({ isOpen: true }),
    onClose: () => set({ isOpen: false }),
}));
