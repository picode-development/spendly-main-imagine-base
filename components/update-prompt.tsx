"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps long-running sessions fresh: polls the deployed version (and re-checks
 * whenever the app returns to the foreground); when a new deploy lands, offers
 * a one-tap refresh. Closed-and-reopened apps always load fresh anyway.
 */
export const UpdatePrompt = () => {
    const initialVersion = useRef<string | null>(null);
    const prompted = useRef(false);

    useEffect(() => {
        const check = async () => {
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
                    prompted.current = true;
                    toast("A new version of Spendly is ready", {
                        duration: Infinity,
                        action: {
                            label: "Refresh",
                            onClick: () => window.location.reload(),
                        },
                    });
                }
            } catch {
                // Offline or flaky network — try again next cycle
            }
        };

        check();
        const interval = setInterval(check, CHECK_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return null;
};
