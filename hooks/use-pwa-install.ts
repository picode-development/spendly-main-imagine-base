"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Captures the browser's install prompt so the app can offer a real
 * "Install" button (Chrome/Edge on Android + desktop). On iOS Safari the
 * event never fires — callers should show manual instructions instead.
 */
export const usePwaInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Already running as an installed app?
        if (window.matchMedia("(display-mode: standalone)").matches) {
            setIsInstalled(true);
        }

        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const promptInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
        if (!deferredPrompt) return "unavailable";
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") setDeferredPrompt(null);
        return choice.outcome;
    };

    return {
        canInstall: !!deferredPrompt,
        isInstalled,
        promptInstall,
    };
};
