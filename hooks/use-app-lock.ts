import { useEffect } from "react";
import { create } from "zustand";
import {
  enroll,
  isSupported,
  readRecord,
  verify,
  writeRecord,
} from "@/lib/app-lock";

/** Re-lock after the tab has been hidden for longer than this. */
const RELOCK_AFTER_MS = 60_000;

type AppLockState = {
  userId: string | null;
  enabled: boolean;
  /** Whether a credential is enrolled on this device for this user. */
  enrolled: boolean;
  isLocked: boolean;
  isSupported: boolean;
  /** Becomes true once localStorage has been read on the client. */
  hydrated: boolean;
  lastHiddenAt: number | null;

  init: (userId: string) => void;
  setSupported: (value: boolean) => void;
  enable: () => Promise<void>;
  disable: () => void;
  unlock: () => Promise<void>;
  forceUnlock: () => void;
  markHidden: () => void;
  maybeRelockOnVisible: () => void;
  reset: () => void;
};

export const useAppLockStore = create<AppLockState>((set, get) => ({
  userId: null,
  enabled: false,
  enrolled: false,
  isLocked: false,
  isSupported: false,
  hydrated: false,
  lastHiddenAt: null,

  init: (userId) => {
    const record = readRecord(userId);
    // App Lock is ON by default: no stored choice => enabled.
    const enabled = record ? record.enabled : true;
    const enrolled = !!record?.credentialId;
    set({
      userId,
      enabled,
      enrolled,
      // Locked on every fresh load/refresh whenever the feature is enabled.
      isLocked: enabled,
      hydrated: true,
      lastHiddenAt: null,
    });
  },

  setSupported: (value) => set({ isSupported: value }),

  enable: async () => {
    const { userId } = get();
    if (!userId) throw new Error("Not signed in");
    await enroll(userId);
    set({ enabled: true, enrolled: true, isLocked: false });
  },

  disable: () => {
    const { userId } = get();
    // Persist an explicit "off" record so a reload doesn't revert to default-on.
    if (userId) writeRecord(userId, { enabled: false, credentialId: "" });
    set({ enabled: false, enrolled: false, isLocked: false });
  },

  unlock: async () => {
    const { userId } = get();
    if (!userId) throw new Error("Not signed in");
    await verify(userId);
    set({ isLocked: false });
  },

  // Unlock without a biometric check — used when the device has no platform
  // authenticator, so we never trap the user behind a lock they can't open.
  forceUnlock: () => set({ isLocked: false }),

  markHidden: () => {
    if (get().enabled) set({ lastHiddenAt: Date.now() });
  },

  maybeRelockOnVisible: () => {
    const { enabled, lastHiddenAt } = get();
    if (enabled && lastHiddenAt && Date.now() - lastHiddenAt > RELOCK_AFTER_MS) {
      set({ isLocked: true, lastHiddenAt: null });
    }
  },

  reset: () =>
    set({
      userId: null,
      enabled: false,
      enrolled: false,
      isLocked: false,
      hydrated: false,
      lastHiddenAt: null,
    }),
}));

/**
 * Wires the store to Clerk identity + browser lifecycle. Call once, high in the
 * tree (from AppLockGate). Handles capability detection, per-user init, and the
 * background-then-return re-lock.
 */
export function useAppLockInit(userId: string | null) {
  const init = useAppLockStore((s) => s.init);
  const reset = useAppLockStore((s) => s.reset);
  const setSupported = useAppLockStore((s) => s.setSupported);
  const markHidden = useAppLockStore((s) => s.markHidden);
  const maybeRelockOnVisible = useAppLockStore((s) => s.maybeRelockOnVisible);

  useEffect(() => {
    isSupported().then(setSupported);
  }, [setSupported]);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    init(userId);
  }, [userId, init, reset]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) markHidden();
      else maybeRelockOnVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [markHidden, maybeRelockOnVisible]);
}

/** Convenience selector for components that only need to read the enabled state. */
export function useAppLockEnabled() {
  return useAppLockStore((s) => s.enabled);
}
