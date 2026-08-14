"use client";

import { useUser } from "@clerk/nextjs";
import { useAppLockStore, useAppLockInit } from "@/hooks/use-app-lock";
import { AppLockOverlay } from "@/components/app-lock-overlay";
import { FullPageLoader } from "@/components/FullPageLoader";

/**
 * Gates the app behind the lock overlay when App Lock is enabled and locked.
 * Mounted inside the authenticated (non-auth) layout branch.
 *
 * Fails closed while lock state is still resolving (Clerk hasn't loaded, or
 * our own localStorage read hasn't run yet): renders a neutral loader
 * instead of `children`. Falling through to unprotected children during
 * that window let a page's mount-time side effects run before we knew
 * whether the app should be locked — e.g. the Android share-intent flow
 * cold-starts the PWA straight into /share-claim, which claims a one-time
 * token on mount; if that claim fired during the gap and the lock then
 * engaged a moment later, AppLockGate would unmount the in-progress claim,
 * burning the token, so the retry after unlocking failed as "expired."
 */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const userId = user?.id ?? null;

  useAppLockInit(userId);

  const isLocked = useAppLockStore((s) => s.isLocked);
  const hydrated = useAppLockStore((s) => s.hydrated);

  // Once Clerk has resolved a signed-in user, wait for our own init to read
  // their lock preference before ever rendering children — never guess.
  const stillResolving = !isLoaded || (!!userId && !hydrated);
  if (stillResolving) {
    return <FullPageLoader />;
  }

  if (isLocked) {
    return <AppLockOverlay />;
  }

  return <>{children}</>;
}
