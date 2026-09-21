"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ClipboardPaste,
    ImagePlus,
    Loader2,
    RefreshCw,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { client } from "@/lib/hono";
import { useNewTransaction } from "@/features/transactions/hooks/use-new-transaction";

// Android Web Share Target & Receipt AI Intake Handler.
//
// Receives shared content from Android share sheet OR provides an instant
// 1-tap screenshot picker when Android WebAPK drops file URIs (Chromium Issue 560272217).
// Runs Spendly AI vision extraction and secure receipt storage concurrently, then stages
// into Detected Transactions with prefilled fields and attached receipt.
const ShareHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const newTransaction = useNewTransaction();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fired = useRef(false);

    const [status, setStatus] = useState<"processing" | "pick_image" | "success" | "error">("processing");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [subMessage, setSubMessage] = useState<string>("Extracting payment details and uploading receipt…");
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelected = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
            toast.error("Please select an image file (JPG, PNG, or WEBP).");
            return;
        }

        setStatus("processing");
        setSubMessage("Reading receipt & analyzing transaction details…");

        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Failed to read image file"));
                reader.readAsDataURL(file);
            });

            setSubMessage("Securing receipt & extracting transaction fields…");

            const res = await client.api["pending-transactions"]["process-share"].$post({
                json: {
                    image: dataUrl,
                    text: null,
                },
            });

            if (!res.ok) {
                const errorBody = await res.json().catch(() => null);
                const msg = (errorBody && typeof errorBody === "object" && "error" in errorBody)
                    ? String((errorBody as { error: unknown }).error)
                    : "Could not process image";
                throw new Error(msg);
            }

            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });

            setStatus("success");
            toast.success("Transaction detected! Tap Add in Detected Transactions to review.");

            setTimeout(() => {
                router.replace("/transactions");
            }, 1200);
        } catch (err: any) {
            console.error("[share] Image processing failed:", err);
            setStatus("error");
            setErrorMessage(err?.message || "Failed to analyze receipt image.");
        }
    }, [queryClient, router]);

    const handlePasteFromClipboard = useCallback(async () => {
        try {
            if (!navigator.clipboard?.read) {
                fileInputRef.current?.click();
                return;
            }
            const items = await navigator.clipboard.read();
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith("image/")) {
                        const blob = await item.getType(type);
                        const file = new File([blob], "pasted_receipt.png", { type });
                        return handleFileSelected(file);
                    }
                }
            }
            toast.info("No image found in clipboard. Please choose your screenshot file.");
            fileInputRef.current?.click();
        } catch {
            fileInputRef.current?.click();
        }
    }, [handleFileSelected]);

    // Handle global paste event
    useEffect(() => {
        const handlePasteEvent = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith("image/")) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        handleFileSelected(file);
                        return;
                    }
                }
            }
        };

        window.addEventListener("paste", handlePasteEvent);
        return () => window.removeEventListener("paste", handlePasteEvent);
    }, [handleFileSelected]);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        const promptPicker = params.get("prompt_picker");
        const errorParam = params.get("error");
        const source = params.get("source");
        const token = params.get("token");
        const fallbackText = [params.get("title"), params.get("text"), params.get("url")]
            .filter(Boolean)
            .join(" ")
            .trim();

        // If Android WebAPK dropped files or user requested picker, show the screenshot selection UI
        if (promptPicker === "true" || errorParam === "no_content_received" || (!token && !fallbackText && source !== "sw")) {
            setStatus("pick_image");
            return;
        }

        const processShare = async () => {
            try {
                if (source === "sw") {
                    if (typeof window === "undefined" || !("caches" in window)) {
                        throw new Error("Browser Cache Storage is unavailable");
                    }
                    const cache = await caches.open("spendly-share-cache");
                    const imageRes = await cache.match("/shared-image");
                    const metaRes = await cache.match("/shared-meta");

                    let dataUrl: string | null = null;
                    if (imageRes) {
                        const blob = await imageRes.blob();
                        await cache.delete("/shared-image");
                        dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }

                    let sharedText: string | null = null;
                    if (metaRes) {
                        const meta = await metaRes.json().catch(() => ({}));
                        await cache.delete("/shared-meta");
                        sharedText = [meta.title, meta.text, meta.url].filter(Boolean).join(" ").trim() || null;
                    }

                    if (!dataUrl && !sharedText) {
                        // Fall back to 1-tap image selection smoothly
                        setStatus("pick_image");
                        return;
                    }

                    const res = await client.api["pending-transactions"]["process-share"].$post({
                        json: {
                            image: dataUrl,
                            text: sharedText,
                        },
                    });

                    if (!res.ok) {
                        const errorBody = await res.json().catch(() => null);
                        const msg = (errorBody && typeof errorBody === "object" && "error" in errorBody)
                            ? String((errorBody as { error: unknown }).error)
                            : "Could not process shared content";
                        throw new Error(msg);
                    }

                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["transactions"] });

                    setStatus("success");
                    toast.success("Transaction detected! Tap Add in Detected Transactions to review.");

                    setTimeout(() => {
                        router.replace("/transactions");
                    }, 1200);
                } else if (token) {
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

                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["transactions"] });

                    setStatus("success");
                    toast.success("Transaction detected! Tap Add in Detected Transactions to review.");

                    setTimeout(() => {
                        router.replace("/transactions");
                    }, 1200);
                } else if (fallbackText) {
                    const res = await client.api["pending-transactions"].$post({
                        json: { message: fallbackText },
                    });

                    if (!res.ok) throw new Error("Could not process message");

                    queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });

                    setStatus("success");
                    toast.success("Message processed! Tap Add in Detected Transactions to review.");

                    setTimeout(() => {
                        router.replace("/transactions");
                    }, 1200);
                }
            } catch (err: any) {
                console.error("[share] Claim processing error:", err);
                setStatus("error");
                setErrorMessage(err?.message || "Something went wrong while reading the shared content.");
            }
        };

        processShare();
    }, [params, router, queryClient, newTransaction, handleFileSelected]);

    return (
        <div className="max-w-screen-md mx-auto w-full pb-16 -mt-24 px-4">
            {/* Hidden file input for native gallery/camera selection */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                }}
            />

            <Card className="border border-white/10 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden">
                <CardContent className="flex min-h-[380px] flex-col items-center justify-center p-6 md:p-8 text-center">
                    {/* 1. PROCESSING / AI EXTRACTION STATE */}
                    {status === "processing" && (
                        <div className="space-y-6 flex flex-col items-center animate-in fade-in duration-300">
                            <div className="relative">
                                <div className="absolute -inset-3 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 opacity-40 blur-xl animate-pulse" />
                                <div className="relative flex size-20 items-center justify-center rounded-full bg-primary/10 border border-primary/30 shadow-inner">
                                    <Sparkles className="size-10 text-primary animate-pulse" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold tracking-tight">
                                    Understanding with AI…
                                </h2>
                                <p className="text-sm text-muted-foreground max-w-sm">
                                    {subMessage}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
                                <Loader2 className="size-3.5 animate-spin text-primary" />
                                <span>Analyzing transaction with Spendly AI</span>
                            </div>
                        </div>
                    )}

                    {/* 2. PICK IMAGE (1-TAP SCREENSHOT CAPTURE) STATE */}
                    {status === "pick_image" && (
                        <div className="space-y-5 flex flex-col items-center max-w-md w-full animate-in fade-in duration-300">
                            <div className="relative">
                                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                                    <ImagePlus className="size-8" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <h2 className="text-xl font-bold tracking-tight">
                                    Scan Payment Screenshot
                                </h2>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Select your payment screenshot to let AI extract payee, amount, date, and note automatically.
                                </p>
                            </div>

                            {/* Clickable Drop Zone */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) handleFileSelected(file);
                                }}
                                className={`w-full py-8 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                                    isDragging
                                        ? "border-primary bg-primary/5 scale-[1.02]"
                                        : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
                                }`}
                            >
                                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1">
                                    <Sparkles className="size-6" />
                                </div>
                                <span className="text-sm font-semibold text-foreground">
                                    Tap to Select Screenshot
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Paytm, PhonePe, GPay, Bank SMS, or Receipt
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full pt-4 pb-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:flex-1"
                                    onClick={handlePasteFromClipboard}
                                >
                                    <ClipboardPaste className="size-4 mr-1.5" />
                                    Paste Screenshot
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full sm:flex-1 text-muted-foreground hover:text-foreground"
                                    onClick={() => router.replace("/transactions")}
                                >
                                    Go to Transactions
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* 3. SUCCESS STATE */}
                    {status === "success" && (
                        <div className="space-y-4 flex flex-col items-center animate-in zoom-in-95 duration-300">
                            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                <CheckCircle2 className="size-10" />
                            </div>
                            <div className="space-y-1">
                                <h2 className="text-lg font-bold">Transaction Detected!</h2>
                                <p className="text-sm text-muted-foreground">
                                    Staged into Detected Transactions. Redirecting…
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 4. ERROR STATE */}
                    {status === "error" && (
                        <div className="space-y-5 flex flex-col items-center max-w-sm animate-in fade-in duration-300">
                            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                                <AlertCircle className="size-8" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold">Couldn&apos;t Read Shared Data</h2>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {errorMessage || "The shared file could not be read."}
                                </p>
                            </div>
                            <div className="flex flex-col gap-2.5 w-full pt-2">
                                <Button
                                    className="w-full"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <RefreshCw className="size-4 mr-2" />
                                    Choose Screenshot Manually
                                </Button>
                                <div className="flex gap-2.5 w-full">
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => router.replace("/transactions")}
                                    >
                                        Transactions
                                    </Button>
                                    <Button
                                        variant="secondary"
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
