import { create } from "zustand";

// Shared flag so the floating chat/assistant ball can step aside while the
// detected-transactions popup is expanded (and reappear when it collapses).
type PendingPopupState = {
    expanded: boolean;
    setExpanded: (value: boolean) => void;
};

export const usePendingPopup = create<PendingPopupState>((set) => ({
    expanded: false,
    setExpanded: (expanded) => set({ expanded }),
}));
