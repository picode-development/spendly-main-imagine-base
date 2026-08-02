"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { isLockedByDefault } from "@/lib/app-lock";
import { useAppLockStore, useAppLockInit } from "@/hooks/use-app-lock";
import { AppLockOverlay } from "@/components/app-lock-overlay";

/**
 * Gates the app behind the lock overlay when App Lock is enabled and locked.
 * Mounted inside the authenticated (non-auth) layout branch.
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;

  useAppLockInit(userId);

  const isLocked = useAppLockStore((s) => s.isLocked);
  const hydrated = useAppLockStore((s) => s.hydrated);

  // Seed the very first client render from localStorage so an enrolled user
  // never sees a flash of unlocked content before the init effect runs.
  const [seedLocked] = useState(() =>
    typeof window !== "undefined" && userId ? isLockedByDefault(userId) : false
  );

  const showOverlay = isLoaded && (isLocked || (seedLocked && !hydrated));

  if (showOverlay) {
    return <AppLockOverlay />;
  }

  return <>{children}</>;
}
