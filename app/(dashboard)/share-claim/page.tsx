"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/lib/hono";

// Lands here (signed-in GET) right after an Android share; claims the
// stashed share into the pending list and heads to the transactions page.
const ShareClaimHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        const token = params.get("token");
        if (!token) {
            router.replace("/transactions");
            return;
        }

        (async () => {
            try {
                const res = await client.api["pending-transactions"]["claim-share"].$post({
                    json: { token },
                });
                if (res.ok) {
                    toast.success("Transaction detected — review it below");
                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                } else {
                    toast.error("Couldn't read the shared content");
                }
            } catch {
                toast.error("Couldn't read the shared content");
            } finally {
                router.replace("/transactions");
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-[60vh] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Reading what you shared…</span>
        </div>
    );
};

export default function ShareClaimPage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-[60vh] items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <ShareClaimHandler />
        </Suspense>
    );
}
