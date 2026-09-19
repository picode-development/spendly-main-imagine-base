"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js and drives its update lifecycle: a first-ever
 * install activates immediately (nothing to lose), but once a page is
 * already controlled by a SW, a newly-installed one waits for an explicit
 * SKIP_WAITING message (see components/update-prompt.tsx) before taking
 * over — so in-flight tabs are never surprised by new caching logic
 * mid-session. Also nudges the offline-write outbox (lib/offline-outbox.ts)
 * to drain whenever the browser regains connectivity, as the cross-browser
 * fallback for the Background Sync API (Chromium-only).
 */
export const SwRegister = () => {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        // First-ever install has nothing running yet to disrupt, so it takes
        // control silently — only an update to an ALREADY-controlled page
        // should ever force a reload. Set synchronously right before the
        // postMessage below; the resulting controllerchange is inherently
        // async, so there's no race with this flag.
        let expectingSilentActivation = false;
        let refreshing = false;
        const onControllerChange = () => {
            if (expectingSilentActivation) {
                expectingSilentActivation = false;
                return;
            }
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        const onOnline = () => {
            navigator.serviceWorker.controller?.postMessage({ type: "DRAIN_OUTBOX" });
        };
        window.addEventListener("online", onOnline);

        const registerAndWatch = async () => {
            try {
                const reg = await navigator.serviceWorker.register("/sw.js", {
                    updateViaCache: "none",
                });

                // Check for updates on register, focus, and visibility change
                reg.update().catch(() => {});
                const checkUpdate = () => {
                    if (document.visibilityState === "visible") {
                        reg.update().catch(() => {});
                    }
                };
                window.addEventListener("focus", checkUpdate);
                document.addEventListener("visibilitychange", checkUpdate);

                if (reg.waiting) {
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                    window.dispatchEvent(new CustomEvent("sw-update-available", { detail: reg }));
                }

                reg.addEventListener("updatefound", () => {
                    const installing = reg.installing;
                    if (!installing) return;
                    installing.addEventListener("statechange", () => {
                        if (installing.state !== "installed") return;
                        if (navigator.serviceWorker.controller) {
                            // Update available — activate it immediately
                            installing.postMessage({ type: "SKIP_WAITING" });
                            window.dispatchEvent(new CustomEvent("sw-update-available", { detail: reg }));
                        } else {
                            // First-ever install for this client — activate silently
                            expectingSilentActivation = true;
                            installing.postMessage({ type: "SKIP_WAITING" });
                        }
                    });
                });
            } catch {
                // Shares fall back to the server-side stash path
            }
        };
        registerAndWatch();

        return () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
            window.removeEventListener("online", onOnline);
        };
    }, []);
    return null;
};
