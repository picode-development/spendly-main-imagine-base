"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type OutboxResult = { id: string; ok: boolean; status?: number };

/** Reacts to public/sw.js's OUTBOX_DRAINED broadcast after a replay pass. */
export const OfflineOutboxListener = () => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const onMessage = (event: MessageEvent) => {
            if (event.data?.type !== "OUTBOX_DRAINED") return;
            const results = (event.data.results as OutboxResult[]) ?? [];
            const synced = results.filter((r) => r.ok).length;
            const failed = results.filter((r) => !r.ok && r.status === 401).length;

            if (synced > 0) {
                toast.success(synced === 1 ? "1 offline change synced" : `${synced} offline changes synced`);
                queryClient.invalidateQueries({ queryKey: ["transactions"] });
                queryClient.invalidateQueries({ queryKey: ["summary"] });
            }
            if (failed > 0) {
                toast.error("Couldn't sync some offline changes — please sign in again");
            }
        };

        navigator.serviceWorker.addEventListener("message", onMessage);
        return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }, [queryClient]);

    return null;
};
