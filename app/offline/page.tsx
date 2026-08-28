"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

// Static, unauthenticated fallback shown by the service worker
// (public/sw.js, CACHE_SHELL) when a navigation fails with no network.
// Deliberately no server data fetch — nothing here can go stale.
export default function OfflinePage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                <WifiOff className="size-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">You&apos;re offline</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
                Spendly can&apos;t reach the network right now. Reconnect and try again —
                any pages you&apos;ve already opened may still work from what&apos;s saved on this device.
            </p>
            <Button onClick={() => window.location.reload()}>Try again</Button>
        </div>
    );
}
