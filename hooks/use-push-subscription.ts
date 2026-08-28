"use client";

import { useCallback, useEffect, useState } from "react";
import { client } from "@/lib/hono";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// PushManager.subscribe wants the VAPID key as a raw Uint8Array, not the
// base64url string it's distributed as.
function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Wraps browser Notification permission + PushManager subscription state.
 * iOS Safari only supports Web Push once the PWA is installed to the home
 * screen (16.4+) — callers should check `display-mode: standalone` and
 * prompt install first there.
 */
export const usePushSubscription = () => {
    const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const supported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && !!VAPID_PUBLIC_KEY;

    useEffect(() => {
        if (!supported) {
            setPermission("unsupported");
            return;
        }
        setPermission(Notification.permission);
        navigator.serviceWorker.ready
            .then((reg) => reg.pushManager.getSubscription())
            .then((sub) => setIsSubscribed(!!sub))
            .catch(() => {});
    }, [supported]);

    const subscribe = useCallback(async () => {
        if (!supported || !VAPID_PUBLIC_KEY) return false;
        setIsLoading(true);
        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result !== "granted") return false;

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            const json = sub.toJSON();
            await client.api.push.subscribe.$post({
                json: {
                    endpoint: json.endpoint!,
                    keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
                },
            });
            setIsSubscribed(true);
            return true;
        } finally {
            setIsLoading(false);
        }
    }, [supported]);

    const unsubscribe = useCallback(async () => {
        if (!supported) return;
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await client.api.push.subscribe.$delete({ json: { endpoint: sub.endpoint } });
                await sub.unsubscribe();
            }
            setIsSubscribed(false);
        } finally {
            setIsLoading(false);
        }
    }, [supported]);

    return { supported, permission, isSubscribed, isLoading, subscribe, unsubscribe };
};
