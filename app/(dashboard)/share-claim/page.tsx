"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { client } from "@/lib/hono";
import { formatCurrency } from "@/lib/utils";
import { uploadImageWithProgress, makeImagePreview } from "@/features/transactions/lib/upload-imgbb";
import { toAiDataUrl } from "@/features/transactions/lib/image-data-url";

const MAX_SHARE_IMAGES = 25;
// Extraction now runs through the Hermes bridge (a single dedicated
// backend), not Groq's per-key rate-limited free tier — this just bounds
// how many images read in parallel, not a key-pool sizing.
const CONCURRENCY = 6;

type ItemStatus = "queued" | "working" | "retry" | "done" | "empty" | "error";

// Finished items (wins first) sort to the top; still-processing sink down
const STATUS_ORDER: Record<ItemStatus, number> = {
    done: 0, empty: 1, error: 2, retry: 3, working: 4, queued: 5,
};
type Item = {
    status: ItemStatus;
    preview?: string;         // objectURL thumbnail for the row
    amount?: number | null;
    payee?: string | null;
    // Kept on blank rows so a manual retry can re-read them
    url?: string;
    pendingId?: string;
};

// Lands here (signed-in GET) right after an Android share; claims the shared
// screenshots, showing each one as a live row with its own status + result.
const ShareClaimHandler = () => {
    const params = useSearchParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const fired = useRef(false);
    const previews = useRef<string[]>([]);

    const [phase, setPhase] = useState<"reading" | "done" | "error">("reading");
    const [items, setItems] = useState<Item[]>([]);
    const [retrying, setRetrying] = useState(false);
    // Non-image single spinner (text share / server-stash fallback)
    const [simple, setSimple] = useState(false);
    // Which of the top-level throw sites fired — shown under the error
    // card so a report carries the real cause instead of just the generic
    // "Couldn't read that" text.
    const [errorReason, setErrorReason] = useState<string | null>(null);

    const itemsRef = useRef<Item[]>([]);
    itemsRef.current = items;

    const updateItem = (i: number, patch: Partial<Item>) =>
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

    // Re-read a hosted screenshot and fill its blank pending row. url/
    // pendingId are re-stamped on every outcome (not just success) so a
    // failed attempt still leaves the row retryable — this is called both
    // as the single automatic retry right after the first read (from
    // processOne) and from the manual "Retry N" button below; either way,
    // if this attempt also comes up blank, the row must still carry what
    // the NEXT retry needs.
    const extractAndFill = async (index: number, url: string, pendingId: string) => {
        updateItem(index, { status: "retry", url, pendingId });
        const res = await client.api["pending-transactions"]["extract-image"]
            .$post({ json: { image: url } }).catch(() => null);
        const data = res?.ok ? (await res.json()).data : null;
        const hasData = data && (data.amount != null || !!data.payee);
        if (hasData) {
            await client.api["pending-transactions"]["detected"][":id"].$patch({
                param: { id: pendingId },
                json: {
                    amount: data.isTransaction ? data.amount : null,
                    payee: data.payee ?? null,
                    accountHint: data.accountName ?? data.accountHint ?? null,
                    categoryHint: data.categoryName ?? null,
                    note: data.note ?? null,
                    date: data.date ? new Date(data.date) : undefined,
                },
            }).catch(() => null);
            updateItem(index, { status: "done", amount: data.amount ?? null, payee: data.payee ?? null });
            return true;
        }
        updateItem(index, { status: "empty", url, pendingId });
        return false;
    };

    // Manual "Retry pending" — re-runs every still-blank row
    const retryBlanks = async () => {
        setRetrying(true);
        const blanks = itemsRef.current
            .map((it, i) => ({ it, i }))
            .filter(({ it }) => it.status === "empty" && it.url && it.pendingId);
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, blanks.length) }, async () => {
                while (blanks.length > 0) {
                    const { it, i } = blanks.shift()!;
                    await extractAndFill(i, it.url!, it.pendingId!).catch(() => {});
                }
            }),
        );
        queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
        setRetrying(false);
        // All resolved — head to review
        if (!itemsRef.current.some((it) => it.status === "empty" || it.status === "error")) {
            router.replace("/transactions");
        }
    };

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;

        const token = params.get("token");
        const localId = params.get("local");
        if (!token && !localId) {
            router.replace("/transactions");
            return;
        }

        const contentHash = async (file: File): Promise<string | null> => {
            try {
                const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
                return Array.from(new Uint8Array(digest))
                    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
            } catch {
                return null;
            }
        };

        // Service-worker path: files were parked on-device at FULL quality.
        const claimLocal = async (id: string) => {
            const cache = await caches.open("spendly-share-stash");
            const metaRes = await cache.match(`/__share/${id}/meta`);
            if (!metaRes) throw new Error("share-expired");
            const meta = (await metaRes.json()) as { text: string; count: number; dropped?: number };
            if (meta.dropped && meta.dropped > 0) {
                toast.info(`${meta.dropped} more skipped — share up to ${MAX_SHARE_IMAGES} at a time.`);
            }

            const files: File[] = [];
            for (let i = 0; i < meta.count; i++) {
                const fileRes = await cache.match(`/__share/${id}/file/${i}`);
                if (!fileRes) continue;
                const blob = await fileRes.blob();
                files.push(new File([blob], "screenshot.jpg", { type: blob.type || "image/jpeg" }));
                await cache.delete(`/__share/${id}/file/${i}`);
            }
            await cache.delete(`/__share/${id}/meta`);

            // Text-only share → single spinner path
            if (files.length === 0) {
                if (!meta.text) throw new Error("nothing-to-read");
                setSimple(true);
                const res = await client.api["pending-transactions"]["from-share"].$post({
                    json: { text: meta.text, images: [] },
                });
                if (!res.ok) {
                    const body: unknown = await res.json().catch(() => null);
                    const serverError = body && typeof body === "object" && "error" in body
                        ? String((body as { error: unknown }).error)
                        : null;
                    throw new Error(`extraction-failed${serverError ? `: ${serverError}` : ""}`);
                }
                queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
                router.replace("/transactions");
                return;
            }

            // Seed one row per screenshot with a thumbnail
            const seeded: Item[] = files.map((f) => {
                const preview = URL.createObjectURL(f);
                previews.current.push(preview);
                return { status: "queued", preview };
            });
            setItems(seeded);

            const extractFrom = async (image: string) => {
                const res = await client.api["pending-transactions"]["extract-image"]
                    .$post({ json: { image, text: meta.text || null } })
                    .catch(() => null);
                return res?.ok ? (await res.json()).data : null;
            };

            const processOne = async (file: File, index: number) => {
                updateItem(index, { status: "working" });

                // Upload (full quality) and AI read (local copy) in parallel —
                // concurrent reads land on different keys server-side
                const aiPromise = (async () => {
                    const dataUrl = await toAiDataUrl(file);
                    return extractFrom(dataUrl);
                })().catch(() => null);

                const uploadPromise = (async () => {
                    const [url, preview] = await Promise.all([
                        uploadImageWithProgress(file, () => {}).promise,
                        makeImagePreview(file).catch(() => undefined),
                    ]);
                    return { url, preview };
                })().catch(() => null);

                const [initialExtract, hosted, clientKey] = await Promise.all([
                    aiPromise, uploadPromise, contentHash(file),
                ]);
                let extracted = initialExtract;

                // Local read failed but upload landed — one immediate retry
                if (!extracted && hosted) extracted = await extractFrom(hosted.url);

                if (!extracted && !hosted) {
                    updateItem(index, { status: "error" });
                    return;
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
                if (!res.ok) { updateItem(index, { status: "error" }); return; }

                const { data } = await res.json();
                const hasData = data?.amount != null || !!data?.payee;
                if (hasData) {
                    updateItem(index, { status: "done", amount: data?.amount ?? null, payee: data?.payee ?? null });
                } else if (hosted && data?.id) {
                    // One automatic retry, right now — not deferred to a
                    // later batch-wide pass. extractAndFill correctly shows
                    // "retry" only while this real second attempt is
                    // actually in flight, and leaves the row retryable via
                    // "Retry N" if it fails too.
                    await extractAndFill(index, hosted.url, data.id)
                        .catch(() => updateItem(index, { status: "empty", url: hosted.url, pendingId: data.id }));
                } else {
                    updateItem(index, { status: "empty" });
                }
            };

            const queue = files.map((f, i) => ({ f, i }));
            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
                    while (queue.length > 0) {
                        const { f, i } = queue.shift()!;
                        await processOne(f, i).catch(() => updateItem(i, { status: "error" }));
                    }
                }),
            );

            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
            setPhase("done");
            // If some rows are still blank, DON'T auto-redirect — let the user
            // choose to retry them or continue. Only auto-leave when all clean.
            const anyBlank = itemsRef.current.some((it) => it.status === "empty" || it.status === "error");
            if (!anyBlank) {
                setTimeout(() => router.replace("/transactions"), Math.min(3500, 1200 + files.length * 150));
            }
        };

        // Server-stash path (fallback when the service worker isn't active)
        const claimToken = async (t: string) => {
            setSimple(true);
            const res = await client.api["pending-transactions"]["claim-share"].$post({ json: { token: t } });
            if (!res.ok) {
                const body: unknown = await res.json().catch(() => null);
                const serverError = body && typeof body === "object" && "error" in body
                    ? String((body as { error: unknown }).error)
                    : null;
                throw new Error(`claim-failed${serverError ? `: ${serverError}` : ""} (status ${res.status})`);
            }
            queryClient.invalidateQueries({ queryKey: ["pending-transactions"] });
            router.replace("/transactions");
        };

        (async () => {
            try {
                if (localId) await claimLocal(localId);
                else await claimToken(token!);
            } catch (err) {
                console.error("[share-claim] claim failed:", err);
                setErrorReason(err instanceof Error ? err.message : String(err));
                setPhase("error");
                setTimeout(() => router.replace("/transactions"), 3000);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const inFlight = (s: ItemStatus) => s === "queued" || s === "working" || s === "retry";
    const doneCount = items.filter((i) => !inFlight(i.status)).length;
    const successCount = items.filter((i) => i.status === "done").length;
    const blankCount = items.filter((i) => i.status === "empty" || i.status === "error").length;
    const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

    return (
        // Same shell as every dashboard page: the card rises over the gradient
        <div className="max-w-screen-2xl mx-auto w-full pb-16 -mt-24">
            <Card className="border-none drop-shadow-sm">
                <CardContent className="flex min-h-[420px] items-center justify-center py-6">
                    <div className="w-full max-w-md">
                        {phase === "error" ? (
                            <div className="space-y-5 text-center animate-in fade-in zoom-in-95 duration-300">
                                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10">
                                    <XCircle className="size-8 text-destructive" />
                                </div>
                                <div className="space-y-1">
                                    <h2 className="text-base font-semibold">Couldn&apos;t read that</h2>
                                    <p className="text-sm text-muted-foreground">
                                        The share didn&apos;t come through. Try sharing it again.
                                    </p>
                                    {errorReason && (
                                        <p className="text-xs text-muted-foreground/70">
                                            Reason: {errorReason}
                                        </p>
                                    )}
                                </div>
                                <Button size="sm" onClick={() => router.replace("/transactions")}>
                                    Go to transactions
                                </Button>
                            </div>
                        ) : simple || items.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                                <Loader2 className="size-6 animate-spin text-primary" />
                                <span className="text-sm">Reading what you shared…</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Full-batch win moment: a green burst when the
                                    whole batch finishes */}
                                {phase === "done" ? (
                                    <div className="flex flex-col items-center gap-2 py-1 text-center animate-in fade-in zoom-in-95 duration-300">
                                        <div className="relative mx-auto flex size-14 items-center justify-center">
                                            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" aria-hidden />
                                            <span className="relative flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                                                <Check className="size-7 animate-in zoom-in-50 duration-500" strokeWidth={3} />
                                            </span>
                                        </div>
                                        <h2 className="text-base font-semibold">
                                            {successCount > 0
                                                ? `${successCount} transaction${successCount > 1 ? "s" : ""} detected`
                                                : "All done"}
                                        </h2>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-3">
                                        <h2 className="text-base font-semibold">
                                            Reading {items.length} screenshot{items.length > 1 ? "s" : ""}…
                                        </h2>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                            {doneCount}/{items.length}
                                        </span>
                                    </div>
                                )}
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
                                            phase === "done" ? "bg-emerald-500" : "bg-primary",
                                        )}
                                        style={{ width: `${Math.max(3, progress)}%` }}
                                    />
                                </div>

                                {/* Per-screenshot rows — finished float to the
                                    top (wins first), in-progress sink to the bottom */}
                                <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto">
                                    {items
                                        .map((item, i) => ({ item, i }))
                                        .sort((a, b) => STATUS_ORDER[a.item.status] - STATUS_ORDER[b.item.status])
                                        .map(({ item, i }) => {
                                            const finished = item.status === "done" || item.status === "empty" || item.status === "error";
                                            return (
                                                <li
                                                    key={i}
                                                    className={cn(
                                                        "flex items-center gap-3 rounded-lg border p-2 transition-colors duration-500",
                                                        item.status === "done" && "border-emerald-500/30 bg-emerald-500/5",
                                                        item.status === "error" && "border-destructive/30 bg-destructive/5",
                                                        !finished && "bg-card/50",
                                                    )}
                                                >
                                                    <div className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                                                        {item.preview && (
                                                            <img src={item.preview} alt="" className="size-full object-cover" />
                                                        )}
                                                        {(item.status === "queued" || item.status === "working" || item.status === "retry") && (
                                                            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                                <Loader2 className={cn("size-4 text-white", item.status !== "queued" && "animate-spin")} />
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        {item.status === "done" ? (
                                                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1 duration-300">
                                                                {item.amount != null && (
                                                                    <Badge
                                                                        variant={item.amount < 0 ? "destructive" : "primary"}
                                                                        className="shrink-0 tabular-nums"
                                                                    >
                                                                        {formatCurrency(item.amount / 1000)}
                                                                    </Badge>
                                                                )}
                                                                <span className="truncate text-sm font-medium">
                                                                    {item.payee ?? "Detected"}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <p className={cn(
                                                                "truncate text-sm",
                                                                item.status === "error" ? "text-destructive" : "text-muted-foreground",
                                                            )}>
                                                                {item.status === "queued" && "Waiting…"}
                                                                {item.status === "working" && "Reading…"}
                                                                {item.status === "retry" && "Retrying…"}
                                                                {item.status === "empty" && "Saved — add details manually"}
                                                                {item.status === "error" && "Couldn't read this one"}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="shrink-0">
                                                        {item.status === "done" && (
                                                            <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white animate-in zoom-in-50 duration-300">
                                                                <Check className="size-3.5" strokeWidth={3} />
                                                            </span>
                                                        )}
                                                        {item.status === "empty" && <Check className="size-4 text-muted-foreground" />}
                                                        {item.status === "error" && <XCircle className="size-4 text-destructive" />}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                </ul>

                                {phase === "done" && (
                                    blankCount > 0 ? (
                                        // Some couldn't be read — let the user choose
                                        <div className="space-y-2 pt-1">
                                            <p className="text-center text-xs text-muted-foreground">
                                                {blankCount} couldn&apos;t be read. Retry them, or continue and use Fill with AI later.
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={retryBlanks}
                                                    disabled={retrying}
                                                >
                                                    {retrying
                                                        ? <Loader2 className="size-4 mr-2 animate-spin" />
                                                        : null}
                                                    {retrying ? "Retrying…" : `Retry ${blankCount}`}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="flex-1"
                                                    onClick={() => router.replace("/transactions")}
                                                    disabled={retrying}
                                                >
                                                    Continue
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="size-3 animate-spin" />
                                            Taking you to review…
                                        </p>
                                    )
                                )}
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
