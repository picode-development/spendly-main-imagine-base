"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ScanText, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { client } from "@/lib/hono";
import { formatCurrency } from "@/lib/utils";

type ClaimState =
    | { phase: "reading" }
    | { phase: "done"; count: number; amount: number | null; payee: string | null }
    | { phase: "error" };

// Lands here (signed-in GET) right after an Android share; claims the
// stashed share into the pending list with a readable progress → reward flow.
const ShareClaimHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const fired = useRef(false);
    const [state, setState] = useState<ClaimState>({ phase: "reading" });

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
                if (!res.ok) throw new Error("claim failed");
                const { data } = await res.json();
                const rows = Array.isArray(data) ? data : [data];
                queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                setState({
                    phase: "done",
                    count: rows.length,
                    amount: rows[0]?.amount ?? null,
                    payee: rows[0]?.payee ?? null,
                });
                setTimeout(() => router.replace("/transactions"), rows.length > 1 ? 2200 : 1800);
            } catch {
                setState({ phase: "error" });
                setTimeout(() => router.replace("/transactions"), 3000);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        // Same shell as every dashboard page: the card rises over the gradient
        <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
            <Card className="border-none drop-shadow-sm">
                <CardContent className="flex min-h-[420px] items-center justify-center">
                    <div className="w-full max-w-sm p-4 text-center">
                {state.phase === "reading" && (
                    <div className="space-y-5">
                        <div className="relative mx-auto size-16">
                            <span className="absolute inset-0 animate-ping rounded-full bg-primary/10" aria-hidden />
                            <div className="relative flex size-16 items-center justify-center rounded-full bg-primary/10">
                                <ScanText className="size-7 animate-pulse text-primary" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">Reading what you shared</h2>
                            <p className="text-sm text-muted-foreground">
                                Picking out the amount, name, and date…
                            </p>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                            <div className="h-full w-1/3 rounded-full bg-primary animate-[progress-sweep_1.4s_ease-in-out_infinite] motion-reduce:animate-pulse" />
                        </div>
                    </div>
                )}

                {state.phase === "done" && (
                    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
                        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/15">
                            <Check className="size-8 text-emerald-500" strokeWidth={3} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">
                                {state.count > 1 ? `${state.count} transactions detected` : "Got it!"}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                {state.count > 1
                                    ? "Each screenshot is saved separately for review."
                                    : state.amount !== null || state.payee
                                        ? "Here's what was detected:"
                                        : "Saved for your review."}
                            </p>
                        </div>
                        {(state.amount !== null || state.payee) && (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                {state.amount !== null && (
                                    <Badge
                                        variant={state.amount < 0 ? "destructive" : "primary"}
                                        className="px-3 py-1 text-sm tabular-nums"
                                    >
                                        {formatCurrency(state.amount / 1000)}
                                    </Badge>
                                )}
                                {state.payee && (
                                    <span className="text-sm font-medium">{state.payee}</span>
                                )}
                                {state.count > 1 && (
                                    <span className="text-xs text-muted-foreground">
                                        +{state.count - 1} more
                                    </span>
                                )}
                            </div>
                        )}
                        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Taking you to review…
                        </p>
                    </div>
                )}

                {state.phase === "error" && (
                    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
                        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10">
                            <XCircle className="size-8 text-destructive" />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-base font-semibold">Couldn&apos;t read that</h2>
                            <p className="text-sm text-muted-foreground">
                                The share didn&apos;t come through. Try sharing it again.
                            </p>
                        </div>
                        <Button size="sm" onClick={() => router.replace("/transactions")}>
                            Go to transactions
                        </Button>
                    </div>
                )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default function ShareClaimPage() {
    return (
        <Suspense
            fallback={
                <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
                    <Card className="border-none drop-shadow-sm">
                        <CardContent className="flex min-h-[420px] items-center justify-center">
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </CardContent>
                    </Card>
                </div>
            }
        >
            <ShareClaimHandler />
        </Suspense>
    );
}
