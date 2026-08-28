"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Shown whenever the browser reports no connection, so any numbers the
 * service worker is serving from cache (public/sw.js, stale-while-revalidate
 * on /api/summary, /api/accounts, etc.) are never mistaken for live data.
 */
export const OfflineBadge = () => {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        setIsOffline(!navigator.onLine);
        const onOffline = () => setIsOffline(true);
        const onOnline = () => setIsOffline(false);
        window.addEventListener("offline", onOffline);
        window.addEventListener("online", onOnline);
        return () => {
            window.removeEventListener("offline", onOffline);
            window.removeEventListener("online", onOnline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-amber-950">
            <WifiOff className="size-3.5" />
            You&apos;re offline — showing saved data
        </div>
    );
};
