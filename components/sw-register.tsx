"use client";

import { useEffect } from "react";

/** Registers the share-target service worker (public/sw.js). */
export const SwRegister = () => {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(() => {
                // Shares fall back to the server-side stash path
            });
        }
    }, []);
    return null;
};
