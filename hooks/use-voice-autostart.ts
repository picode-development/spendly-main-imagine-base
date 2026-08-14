import { create } from "zustand";

// Set by the widget deep link (?widget-action=voice); the VoiceFab consumes
// it on mount and starts recording as if the mic ball had been tapped.
type VoiceAutostartState = {
    pending: boolean;
    request: () => void;
    consume: () => boolean;
};

export const useVoiceAutostart = create<VoiceAutostartState>((set, get) => ({
    pending: false,
    request: () => set({ pending: true }),
    consume: () => {
        const was = get().pending;
        if (was) set({ pending: false });
        return was;
    },
}));
