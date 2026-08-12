"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useCreatePendingTransaction } from "@/features/transactions/api/use-create-pending-transaction";

// Android share-target endpoint (see app/manifest.ts): receives shared text,
// stores it as a pending transaction, and lands on the transactions page
// where the review popup picks it up.
const ShareHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const createPending = useCreatePendingTransaction();
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        const message = [params.get("title"), params.get("text"), params.get("url")]
            .filter(Boolean)
            .join(" ")
            .trim();

        if (!message) {
            router.replace("/transactions");
            return;
        }

        createPending.mutate(
            { message },
            { onSettled: () => router.replace("/transactions") },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-[60vh] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Reading the shared message…</span>
        </div>
    );
};

export default function SharePage() {
    return (
        <Suspense
            fallback={
                <div className="flex h-[60vh] items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            }
        >
            <ShareHandler />
        </Suspense>
    );
}
