"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { client } from "@/lib/hono";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

// Android Web Share Target handler.
//
// Receives the authenticated GET navigation from /share-target (via ?token=...).
// Immediately invokes Groq AI to process the screenshot & text, then opens the
// Transaction Form with all fields prefilled and the receipt image attached.
const ShareHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const newTransaction = useNewTransaction();
    const fired = useRef(false);

    const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        const token = params.get("token");
        const fallbackText = [params.get("title"), params.get("text"), params.get("url")]
            .filter(Boolean)
            .join(" ")
            .trim();

        const errorParam = params.get("error");
        if (errorParam) {
            setStatus("error");
            setErrorMessage(
                errorParam === "no_content_received"
                    ? "No image or text was received from the share sheet."
                    : errorParam === "invalid_content_type"
                    ? "Invalid content type received."
                    : `Could not process share: ${decodeURIComponent(errorParam)}`
            );
            return;
        }

        if (!token && !fallbackText) {
            router.replace("/transactions");
            return;
        }

        const processShare = async () => {
            try {
                if (token) {
                    // Claim the staged share payload and run Groq AI extraction
                    const res = await client.api["pending-transactions"]["claim-share"].$post({
                        json: { token },
                    });

                    if (!res.ok) {
                        const errorBody = await res.json().catch(() => null);
                        const msg = (errorBody && typeof errorBody === "object" && "error" in errorBody)
                            ? String((errorBody as { error: unknown }).error)
                            : "Could not process shared content";
                        throw new Error(msg);
                    }

                    const json = await res.json();
                    const data = json.data;

                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["transactions"] });

                    setStatus("success");
                    toast.success("Transaction detected! Tap Add in Detected Transactions to review.");

                    // Per user design: Show first in Detected Transactions component.
                    // Allow the user to see the success state for 1 second before navigating.
                    setTimeout(() => {
                        router.replace("/transactions");
                    }, 1000);
                } else if (fallbackText) {
                    // Plain text share without token
                    const res = await client.api["pending-transactions"].$post({
                        json: { message: fallbackText },
                    });

                    if (!res.ok) throw new Error("Could not process message");

                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });

                    setStatus("success");
                    toast.success("Message processed! Tap Add in Detected Transactions to review.");

                    setTimeout(() => {
                        router.replace("/transactions");
                    }, 1000);
                }
            } catch (err: any) {
                console.error("[share] Claim processing error:", err);
                setStatus("error");
                setErrorMessage(err?.message || "Something went wrong while reading the shared content.");
            }
        };

        processShare();
    }, [params, router, queryClient, newTransaction]);

    return (
        <div className="max-w-screen-md mx-auto w-full pb-16 -mt-24 px-4">
            <Card className="border border-white/10 bg-card/90 backdrop-blur-md shadow-2xl overflow-hidden">
                <CardContent className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
                    {status === "processing" && (
                        <div className="space-y-6 flex flex-col items-center animate-in fade-in duration-300">
                            <div className="relative">
                                <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 opacity-30 blur-lg animate-pulse" />
                                <div className="relative flex size-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                                    <Sparkles className="size-10 text-primary animate-pulse" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-semibold tracking-tight">
                                    Understanding with AI…
                                </h2>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    Extracting payment details, receipt images, and merchant info to prepare your transaction.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="size-4 animate-spin text-primary" />
                                <span>Reading images and text</span>
                            </div>
                        </div>
                    )}

                    {status === "success" && (
                        <div className="space-y-4 flex flex-col items-center animate-in zoom-in-95 duration-300">
                            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                <CheckCircle2 className="size-10" />
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-lg font-semibold">Transaction Detected!</h2>
                                <p className="text-sm text-muted-foreground">
                                    Added to Detected Transactions. Redirecting…
                                </p>
                            </div>
                        </div>
                    )}

                    {status === "error" && (
                        <div className="space-y-5 flex flex-col items-center max-w-sm animate-in fade-in duration-300">
                            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                                <AlertCircle className="size-8" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-lg font-semibold">Couldn&apos;t Read Shared Data</h2>
                                <p className="text-sm text-muted-foreground">
                                    {errorMessage || "The shared file or text could not be analyzed."}
                                </p>
                            </div>
                            <div className="flex gap-3 w-full pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => router.replace("/transactions")}
                                >
                                    Transactions
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => {
                                        newTransaction.onOpen();
                                        router.replace("/transactions");
                                    }}
                                >
                                    Add Manually
                                    <ArrowRight className="size-4 ml-1.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default function SharePage() {
    return (
        <Suspense
            fallback={
                <div className="max-w-screen-md mx-auto w-full pb-16 -mt-24 px-4">
                    <Card className="border border-white/10 bg-card/90 shadow-lg">
                        <CardContent className="flex min-h-[380px] items-center justify-center">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </CardContent>
                    </Card>
                </div>
            }
        >
            <ShareHandler />
        </Suspense>
    );
}
