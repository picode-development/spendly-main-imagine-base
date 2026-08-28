"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";

/**
 * Cache Storage is unpartitioned per-origin, not per-user. If a second
 * Clerk account ever signs in on the same device, cached financial API
 * responses (public/sw.js's CACHE_API) from the previous user could
 * otherwise flash before the first real fetch completes. Purge that cache
 * the moment a signed-in session ends.
 */
export const SwCacheGuard = () => {
    const { isLoaded, userId } = useAuth();
    const wasSignedIn = useRef(false);

    useEffect(() => {
        if (!isLoaded) return;
        if (userId) {
            wasSignedIn.current = true;
            return;
        }
        if (wasSignedIn.current && "serviceWorker" in navigator) {
            navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_API_CACHE" });
        }
        wasSignedIn.current = false;
    }, [isLoaded, userId]);

    return null;
};
