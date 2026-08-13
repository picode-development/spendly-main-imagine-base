"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ScanText, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { client } from "@/lib/hono";
import { formatCurrency } from "@/lib/utils";
import { uploadImageWithProgress, makeImagePreview } from "@/features/transactions/lib/upload-imgbb";
import { toAiDataUrl } from "@/features/transactions/lib/image-data-url";

type ClaimState =
    | { phase: "reading"; detail?: string; progress?: number }
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
        const localId = params.get("local");
        if (!token && !localId) {
            router.replace("/transactions");
            return;
        }

        const finish = (rows: { amount?: number | null; payee?: string | null }[]) => {
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
            setState({
                phase: "done",
                count: rows.length,
                amount: rows[0]?.amount ?? null,
                payee: rows[0]?.payee ?? null,
            });
            setTimeout(() => router.replace("/transactions"), rows.length > 1 ? 2200 : 1800);
        };

        // Service-worker path: files were parked on-device at FULL quality.
        // A pool processes up to 5 screenshots concurrently; per screenshot,
        // the full-quality upload and the AI read (from a local copy) run in
        // PARALLEL — one progress bar spans everything.
        const claimLocal = async (id: string) => {
            const cache = await caches.open("spendly-share-stash");
            const metaRes = await cache.match(`/__share/${id}/meta`);
            if (!metaRes) throw new Error("share expired");
            const meta = (await metaRes.json()) as { text: string; count: number; dropped?: number };
            if (meta.dropped && meta.dropped > 0) {
                toast.info(`${meta.dropped} screenshot${meta.dropped > 1 ? "s" : ""} skipped — share up to 3 at a time.`);
            }

            // Pull all files off the cache immediately
            const files: File[] = [];
            for (let i = 0; i < meta.count; i++) {
                const fileRes = await cache.match(`/__share/${id}/file/${i}`);
                if (!fileRes) continue;
                const blob = await fileRes.blob();
                files.push(new File([blob], "screenshot.jpg", { type: blob.type || "image/jpeg" }));
                await cache.delete(`/__share/${id}/file/${i}`);
            }
            await cache.delete(`/__share/${id}/meta`);

            const totalSteps = Math.max(1, files.length * 2); // upload + AI per image
            let doneSteps = 0;
            let doneItems = 0;
            const tick = () => {
                setState({
                    phase: "reading",
                    detail: files.length > 1
                        ? `${doneItems} of ${files.length} screenshots done…`
                        : "Uploading and reading the screenshot…",
                    progress: Math.min(99, Math.round((doneSteps / totalSteps) * 100)),
                });
            };
            tick();

            const rows: { amount?: number | null; payee?: string | null }[] = [];
            let duplicates = 0;

            // Vision calls run one at a time (the free tier rate-limits
            // concurrent calls into silent failures); uploads stay parallel
            let aiChain: Promise<unknown> = Promise.resolve();
            const queueAi = <T,>(task: () => Promise<T>): Promise<T> => {
                const run = aiChain.then(task, task);
                aiChain = run.catch(() => null);
                return run;
            };

            const contentHash = async (file: File): Promise<string | null> => {
                try {
                    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
                    return Array.from(new Uint8Array(digest))
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("")
                        .slice(0, 32);
                } catch {
                    return null;
                }
            };

            const processOne = async (file: File) => {
                // AI reads the local copy while the full-quality original uploads
                const aiPromise = queueAi(async () => {
                    const dataUrl = await toAiDataUrl(file);
                    const res = await client.api["pending-transactions"]["extract-image"].$post({
                        json: { image: dataUrl, text: meta.text || null },
                    });
                    return res.ok ? (await res.json()).data : null;
                }).catch(() => null).finally(() => { doneSteps += 1; tick(); });

                const uploadPromise = (async () => {
                    const [url, preview] = await Promise.all([
                        uploadImageWithProgress(file, () => {}).promise,
                        makeImagePreview(file).catch(() => undefined),
                    ]);
                    return { url, preview };
                })().catch(() => null).finally(() => { doneSteps += 1; tick(); });

                const [initialExtract, hosted, clientKey] = await Promise.all([
                    aiPromise,
                    uploadPromise,
                    contentHash(file),
                ]);
                let extracted = initialExtract;
                if (!extracted && !hosted) return; // both halves failed

                // Local-copy read failed but the upload landed — from here on
                // the AI works off the hosted ImgBB URL
                if (!extracted && hosted) {
                    const res = await queueAi(() =>
                        client.api["pending-transactions"]["extract-image"].$post({
                            json: { image: hosted.url, text: meta.text || null },
                        }),
                    ).catch(() => null);
                    if (res?.ok) extracted = (await res.json()).data;
                }

                const res = await client.api["pending-transactions"]["create-detected"].$post({
                    json: {
                        rawMessage: meta.text || "Shared screenshot",
                        amount: extracted?.isTransaction ? extracted.amount : null,
                        payee: extracted?.payee ?? null,
                        accountHint: extracted?.accountName ?? extracted?.accountHint ?? null,
                        categoryHint: extracted?.categoryName ?? null,
                        note: extracted?.note ?? null,
                        date: extracted?.date ? new Date(extracted.date) : undefined,
                        imageUrls: hosted ? [hosted] : null,
                        clientKey,
                    },
                });
                if (res.ok) {
                    const { data } = await res.json();
                    if (data) rows.push(data);
                    else duplicates += 1; // same screenshot already pending
                }
            };

            // Worker pool: up to 5 screenshots in flight at once
            const queue = [...files];
            await Promise.all(
                Array.from({ length: Math.min(5, queue.length) }, async () => {
                    while (queue.length > 0) {
                        const file = queue.shift()!;
                        await processOne(file).catch(() => {});
                        doneItems += 1;
                        tick();
                    }
                }),
            );

            // Text-only share (no images survived or none were sent)
            if (rows.length === 0 && meta.text) {
                setState({ phase: "reading", detail: "Reading the message…" });
                const res = await client.api["pending-transactions"]["from-share"].$post({
                    json: { text: meta.text, images: [] },
                });
                if (!res.ok) throw new Error("extraction failed");
                const { data } = await res.json();
                rows.push(...(Array.isArray(data) ? data : [data]));
            }

            // Everything was a re-delivered duplicate — nothing new to show
            if (rows.length === 0 && duplicates > 0) {
                router.replace("/transactions");
                return;
            }

            if (rows.length === 0) throw new Error("nothing to read");
            finish(rows);
        };

        // Server-stash path (fallback when the service worker isn't active)
        const claimToken = async (t: string) => {
            const res = await client.api["pending-transactions"]["claim-share"].$post({
                json: { token: t },
            });
            if (!res.ok) throw new Error("claim failed");
            const { data } = await res.json();
            finish(Array.isArray(data) ? data : [data]);
        };

        (async () => {
            try {
                if (localId) await claimLocal(localId);
                else await claimToken(token!);
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
                                {state.detail ?? "Picking out the amount, name, and date…"}
                            </p>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                            {state.progress !== undefined ? (
                                // Determinate: upload + AI steps across the whole batch
                                <div
                                    className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                                    style={{ width: `${Math.max(4, state.progress)}%` }}
                                />
                            ) : (
                                <div className="h-full w-1/3 rounded-full bg-primary animate-[progress-sweep_1.4s_ease-in-out_infinite] motion-reduce:animate-pulse" />
                            )}
                        </div>
                        {state.progress !== undefined && (
                            <p className="text-xs text-muted-foreground tabular-nums">{state.progress}%</p>
                        )}
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
