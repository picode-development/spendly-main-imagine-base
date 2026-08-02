"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Fingerprint, LogOut } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { isSupported } from "@/lib/app-lock";
import { useAppLockStore } from "@/hooks/use-app-lock";

type Status = "verifying" | "error";

/**
 * Full-screen lock gate. Styled to match FullPageLoader for brand consistency.
 * Blocks all interaction with the app behind it.
 *
 * Behavior:
 * - Auto-triggers the biometric prompt on mount (no click needed on the happy
 *   path). First time (no credential yet) it enrolls; afterwards it verifies.
 * - If the device has no platform authenticator, it unlocks itself rather than
 *   trapping the user.
 * - A button only surfaces as a fallback when the automatic prompt is blocked
 *   (some browsers require a user gesture) or cancelled, so the user can retry.
 */
export function AppLockOverlay() {
  const { signOut } = useClerk();
  const unlock = useAppLockStore((s) => s.unlock);
  const enable = useAppLockStore((s) => s.enable);
  const disable = useAppLockStore((s) => s.disable);
  const forceUnlock = useAppLockStore((s) => s.forceUnlock);
  const enrolled = useAppLockStore((s) => s.enrolled);

  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const attempted = useRef(false);

  const run = useCallback(async () => {
    setStatus("verifying");
    setErrorMsg("");
    try {
      const supported = await isSupported();
      if (!supported) {
        // No biometric/passcode on this device — don't lock the user out.
        forceUnlock();
        return;
      }
      if (enrolled) {
        await unlock();
      } else {
        // First run with App Lock on-by-default: set up the credential now.
        await enable();
      }
      // Success flips isLocked=false in the store and this overlay unmounts.
    } catch (error) {
      const cancelled =
        error instanceof DOMException && error.name === "NotAllowedError";
      setStatus("error");
      setErrorMsg(
        cancelled
          ? "That didn’t complete. Tap below to try again."
          : "Couldn’t verify. Try again, or sign out."
      );
    }
  }, [enrolled, unlock, enable, forceUnlock]);

  // Auto-trigger once on mount.
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    run();
  }, [run]);

  // Prevent the page behind the overlay from scrolling while locked.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleSignOut = async () => {
    disable(); // clear the lock first so re-login never starts locked out
    await signOut();
  };

  const heading = enrolled ? "Spendly is locked" : "Set up App Lock";
  const subtext = enrolled
    ? "Verifying with your fingerprint, face, or screen lock…"
    : "Confirm your fingerprint, face, or screen lock to turn on App Lock.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-blue-700 to-blue-500 text-white dark:bg-[linear-gradient(to_bottom,var(--header-gradient-from),var(--header-gradient-to))]"
    >
      <Image
        src="/White-Larger-Logo.svg"
        alt="Spendly Logo"
        width={56}
        height={56}
        className="mb-3"
      />
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="mt-2 max-w-xs text-center text-sm text-white/85">
        {status === "verifying" ? subtext : errorMsg}
      </p>

      {status === "verifying" ? (
        <div className="mt-8 flex items-center gap-2 text-white/80">
          <Fingerprint className="size-6 animate-pulse" />
          <span className="text-sm">Waiting for confirmation…</span>
        </div>
      ) : (
        <Button
          onClick={run}
          className="mt-8 bg-white text-blue-700 hover:bg-white/90"
        >
          <Fingerprint className="size-4" />
          {enrolled ? "Unlock" : "Set up"}
        </Button>
      )}

      <Button
        variant="ghost"
        onClick={handleSignOut}
        className="mt-6 text-white/90 hover:bg-white/10 hover:text-white"
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  );
}
