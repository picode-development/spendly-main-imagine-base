"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Keeps long-running sessions fresh. Two independent signals both lead to
 * the same "Refresh" toast: the service worker's own update lifecycle
 * (fast — fires as soon as a new SW finishes installing) and a `/version`
 * poll (a backup net, since a deploy can change server code without
 * changing sw.js at all). Whichever fires first prompts; the other becomes
 * a no-op via the `prompted` guard.
 */
export const UpdatePrompt = () => {
    const initialVersion = useRef<string | null>(null);
    const prompted = useRef(false);

    useEffect(() => {
        const promptRefresh = (reg?: ServiceWorkerRegistration) => {
            if (prompted.current) return;
            prompted.current = true;
            toast("A new version of Spendly is ready", {
                duration: Infinity,
                action: {
                    label: "Refresh",
                    onClick: () => {
                        if (reg?.waiting) {
                            reg.waiting.postMessage({ type: "SKIP_WAITING" });
                        } else {
                            window.location.reload();
                        }
                    },
                },
            });
        };

        const checkVersion = async () => {
            if (prompted.current) return;
            try {
                const res = await fetch("/version", { cache: "no-store" });
                if (!res.ok) return;
                const { version } = await res.json();
                if (!version || version === "dev") return;

                if (initialVersion.current === null) {
                    initialVersion.current = version;
                    return;
                }
                if (version !== initialVersion.current) {
                    promptRefresh();
                }
            } catch {
                // Offline or flaky network — try again next cycle
            }
        };

        const onSwUpdate = (e: Event) => {
            promptRefresh((e as CustomEvent<ServiceWorkerRegistration>).detail);
        };
        window.addEventListener("sw-update-available", onSwUpdate);

        checkVersion();
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
        }
        const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            checkVersion();
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("sw-update-available", onSwUpdate);
        };
    }, []);

    return null;
};
