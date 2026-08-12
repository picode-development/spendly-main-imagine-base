"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Maximize2, Plus, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadImageWithProgress, makeImagePreview, formatSpeed, formatEta } from "@/features/transactions/lib/upload-imgbb";
import { TransactionImage } from "@/db/schema";

type Props = {
    value: TransactionImage[];
    onChange: (images: TransactionImage[]) => void;
    disabled?: boolean;
    max?: number;
};

type UploadingItem = {
    id: string;
    previewUrl: string;
    loaded: number;
    total: number;
    percent: number;
    speedBps: number | null;
    etaSeconds: number | null;
    lengthComputable: boolean;
    abort: () => void;
};

const focusRing =
    "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

// WhatsApp-style blur-up: the stored tiny preview shows blurred immediately,
// and the full-resolution image fades in over it once downloaded. Falls back
// to a skeleton pulse for legacy images saved without a preview.
const FadeImg = ({ src, preview, alt, className }: { src: string; preview?: string; alt: string; className?: string }) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <>
            {!loaded && (preview ? (
                <img
                    src={preview}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 size-full scale-110 object-cover blur-md"
                />
            ) : (
                <span className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
            ))}
            <img
                src={src}
                alt={alt}
                onLoad={() => setLoaded(true)}
                className={cn(className, "relative transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
        </>
    );
};

export const ImageUpload = ({ value, onChange, disabled, max = 5 }: Props) => {
    const [uploads, setUploads] = useState<UploadingItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [lightboxLoaded, setLightboxLoaded] = useState(false);
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const lastTranslate = useRef({ x: 0, y: 0 });
    const lastPinchDist = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // onChange isn't a functional setter — two uploads finishing in the same
    // tick would each spread a stale `value` and drop a URL without this ref.
    const valueRef = useRef(value);
    valueRef.current = value;

    const uploadsRef = useRef(uploads);
    uploadsRef.current = uploads;

    useEffect(() => () => {
        uploadsRef.current.forEach((u) => {
            u.abort();
            URL.revokeObjectURL(u.previewUrl);
        });
    }, []);

    const resetView = useCallback(() => {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        lastTranslate.current = { x: 0, y: 0 };
    }, []);

    const openLightbox = (index: number) => { resetView(); setLightboxLoaded(false); setLightboxIndex(index); };
    const closeLightbox = useCallback(() => { setLightboxIndex(null); resetView(); }, [resetView]);
    const goTo = useCallback((index: number) => {
        const clamped = Math.min(Math.max(index, 0), valueRef.current.length - 1);
        resetView();
        setLightboxLoaded(false);
        setLightboxIndex(clamped);
    }, [resetView]);

    // Preload neighbours while the lightbox is open so prev/next is instant
    useEffect(() => {
        if (lightboxIndex === null) return;
        [lightboxIndex - 1, lightboxIndex + 1].forEach((i) => {
            const image = valueRef.current[i];
            if (image) {
                const img = new Image();
                img.src = image.url;
            }
        });
    }, [lightboxIndex]);

    useEffect(() => {
        if (lightboxIndex === null) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeLightbox();
            if (e.key === "ArrowLeft") goTo(lightboxIndex - 1);
            if (e.key === "ArrowRight") goTo(lightboxIndex + 1);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [lightboxIndex, closeLightbox, goTo]);

    const zoom = (factor: number) =>
        setScale(prev => Math.min(Math.max(prev * factor, 0.5), 8));

    // React registers wheel listeners as passive, so preventDefault inside a
    // React onWheel can't stop the page from scrolling — attach natively.
    useEffect(() => {
        if (lightboxIndex === null) return;
        const el = canvasRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            zoom(e.deltaY < 0 ? 1.15 : 0.87);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [lightboxIndex]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale <= 1) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - lastTranslate.current.x, y: e.clientY - lastTranslate.current.y };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        const newX = e.clientX - panStart.current.x;
        const newY = e.clientY - panStart.current.y;
        lastTranslate.current = { x: newX, y: newY };
        setTranslate({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsPanning(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
        } else if (e.touches.length === 1 && scale > 1) {
            setIsPanning(true);
            panStart.current = {
                x: e.touches[0].clientX - lastTranslate.current.x,
                y: e.touches[0].clientY - lastTranslate.current.y,
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        // touch-action: none on the canvas keeps the browser from panning or
        // pinch-zooming the page, so these handlers own the gesture.
        if (e.touches.length === 2 && lastPinchDist.current !== null) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            zoom(dist / lastPinchDist.current);
            lastPinchDist.current = dist;
        } else if (e.touches.length === 1 && isPanning) {
            const newX = e.touches[0].clientX - panStart.current.x;
            const newY = e.touches[0].clientY - panStart.current.y;
            lastTranslate.current = { x: newX, y: newY };
            setTranslate({ x: newX, y: newY });
        }
    };

    const handleTouchEnd = () => {
        lastPinchDist.current = null;
        setIsPanning(false);
    };

    const removeUpload = (id: string) => {
        setUploads(prev => {
            const item = prev.find(u => u.id === id);
            if (item) URL.revokeObjectURL(item.previewUrl);
            return prev.filter(u => u.id !== id);
        });
    };

    const handleFiles = (files: File[]) => {
        if (disabled) return;
        const imageFiles = files.filter(f => f.type.startsWith("image/"));
        const skipped = files.length - imageFiles.length;
        if (skipped > 0) {
            toast.error(`Skipped ${skipped} non-image file${skipped > 1 ? "s" : ""}.`);
        }
        if (imageFiles.length === 0) return;

        const slots = max - valueRef.current.length - uploadsRef.current.length;
        if (slots <= 0) {
            toast.error(`You can attach up to ${max} images per transaction.`);
            return;
        }
        if (imageFiles.length > slots) {
            toast.error(`You can attach up to ${max} images per transaction.`);
        }

        imageFiles.slice(0, slots).forEach((file) => {
            const id = crypto.randomUUID();
            const previewUrl = URL.createObjectURL(file);
            // Generate the tiny blur-up placeholder while the upload runs
            const previewPromise = makeImagePreview(file).catch(() => undefined);
            const { promise, abort } = uploadImageWithProgress(file, (p) => {
                setUploads(prev => prev.map(u =>
                    u.id === id ? { ...u, ...p, lengthComputable: true } : u
                ));
            });

            setUploads(prev => [...prev, {
                id,
                previewUrl,
                loaded: 0,
                total: file.size,
                percent: 0,
                speedBps: null,
                etaSeconds: null,
                lengthComputable: false,
                abort,
            }]);

            promise
                .then(async (url) => {
                    const preview = await previewPromise;
                    const next = [...valueRef.current, { url, preview }];
                    valueRef.current = next;
                    onChange(next);
                    removeUpload(id);
                })
                .catch((e) => {
                    removeUpload(id);
                    if (e instanceof Error && e.name === "AbortError") return;
                    console.error("Image upload error:", e);
                    toast.error(
                        e instanceof Error && e.message !== "ImgBB upload failed"
                            ? e.message
                            : `Couldn't upload ${file.name}. Please try again.`
                    );
                });
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) handleFiles(Array.from(e.target.files));
        e.target.value = "";
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
    };

    const handleRemove = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
        if (lightboxIndex !== null) {
            if (value.length <= 1) closeLightbox();
            else if (lightboxIndex >= index) setLightboxIndex(Math.max(0, Math.min(lightboxIndex - 1, value.length - 2)));
        }
    };

    const openPicker = () => !disabled && inputRef.current?.click();
    const hasSlots = value.length + uploads.length < max;
    const isEmpty = value.length === 0 && uploads.length === 0;

    // Aggregate progress across all in-flight uploads
    const aggLoaded = uploads.reduce((sum, u) => sum + u.loaded, 0);
    const aggTotal = uploads.reduce((sum, u) => sum + u.total, 0);
    const aggPercent = aggTotal > 0 ? Math.min(99, Math.round((aggLoaded / aggTotal) * 100)) : 0;
    const aggSpeed = uploads.reduce((sum, u) => sum + (u.speedBps ?? 0), 0);
    const aggEta = aggSpeed > 0 ? (aggTotal - aggLoaded) / aggSpeed : null;
    const anyComputable = uploads.some(u => u.lengthComputable);

    const dragHandlers = {
        onDrop: handleDrop,
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); },
        onDragLeave: () => setIsDragging(false),
    };

    return (
        <>
            <div className="space-y-2">
                {isEmpty ? (
                    <button
                        type="button"
                        onClick={openPicker}
                        disabled={disabled}
                        {...dragHandlers}
                        className={cn(
                            "group flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed transition-colors",
                            focusRing,
                            "disabled:pointer-events-none disabled:opacity-50",
                            isDragging
                                ? "border-primary bg-primary/5"
                                : "border-input hover:border-ring hover:bg-accent/50 dark:hover:bg-accent/20"
                        )}
                    >
                        <div className={cn(
                            "flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors",
                            isDragging ? "bg-primary/10 text-primary" : "group-hover:text-foreground"
                        )}>
                            <ImagePlus className="size-4" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                            {isDragging ? "Drop images here" : (
                                <>Click to upload <span className="font-normal text-muted-foreground">or drag & drop</span></>
                            )}
                        </p>
                        <p className="text-xs text-muted-foreground">PNG, JPG or WEBP · up to {max} images</p>
                    </button>
                ) : (
                    <div {...dragHandlers} className="grid grid-cols-3 gap-2">
                        {value.map((image, index) => (
                            <div
                                key={`${image.url}-${index}`}
                                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                            >
                                <button
                                    type="button"
                                    onClick={() => openLightbox(index)}
                                    aria-label={`View receipt ${index + 1}`}
                                    className={cn("absolute inset-0 cursor-zoom-in rounded-lg", focusRing)}
                                >
                                    <FadeImg
                                        src={image.url}
                                        preview={image.preview}
                                        alt={`Receipt ${index + 1}`}
                                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                                        <ZoomIn className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleRemove(index)}
                                    disabled={disabled}
                                    aria-label={`Remove receipt ${index + 1}`}
                                    className={cn(
                                        "absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-xs backdrop-blur-sm transition-colors hover:text-destructive",
                                        focusRing
                                    )}
                                >
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}

                        {uploads.map((item) => (
                            <div
                                key={item.id}
                                className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                            >
                                <img
                                    src={item.previewUrl}
                                    alt="Uploading receipt"
                                    className="size-full object-cover"
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                                    {item.lengthComputable && (
                                        <span className="text-xs font-medium text-white tabular-nums">{item.percent}%</span>
                                    )}
                                </div>
                                <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
                                    {item.lengthComputable ? (
                                        <div
                                            className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                                            style={{ width: `${item.percent}%` }}
                                        />
                                    ) : (
                                        <div className="h-full w-full animate-pulse rounded-full bg-white/60" />
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => item.abort()}
                                    aria-label="Cancel upload"
                                    className={cn(
                                        "absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-xs backdrop-blur-sm transition-colors hover:text-destructive",
                                        focusRing
                                    )}
                                >
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}

                        {hasSlots && !disabled && (
                            <button
                                type="button"
                                onClick={openPicker}
                                aria-label="Add image"
                                className={cn(
                                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors",
                                    focusRing,
                                    isDragging
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-input hover:border-ring hover:bg-accent/50 hover:text-foreground dark:hover:bg-accent/20"
                                )}
                            >
                                <Plus className="size-4" />
                                <span className="text-xs font-medium">Add</span>
                            </button>
                        )}
                    </div>
                )}

                {uploads.length > 0 && (
                    <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">
                                Uploading {uploads.length > 1 ? `${uploads.length} images` : "image"}…
                            </span>
                            {anyComputable && (
                                <span className="tabular-nums text-muted-foreground">
                                    <span className="font-semibold text-foreground">{aggPercent}%</span>
                                    {aggSpeed > 0 && <> · {formatSpeed(aggSpeed)}</>}
                                    {aggEta !== null && aggEta > 0 && <> · {formatEta(aggEta)}</>}
                                </span>
                            )}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15 dark:bg-primary/25">
                            {anyComputable ? (
                                <div
                                    className="relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-300 ease-out"
                                    style={{ width: `${aggPercent}%` }}
                                >
                                    <div className="absolute inset-0 animate-[progress-shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden" />
                                </div>
                            ) : (
                                <div className="h-full w-full animate-pulse rounded-full bg-primary/40" />
                            )}
                        </div>
                    </div>
                )}

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleInputChange}
                    disabled={disabled}
                />
            </div>

            {/* Gallery Lightbox — adapts to the active light/dark theme */}
            {lightboxIndex !== null && value[lightboxIndex] && (
                <div className="fixed inset-y-0 right-0 w-full sm:w-[449px] z-[9999] flex flex-col bg-white dark:bg-[#0d1122]">
                    {/* Header — matches sheet header style */}
                    <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-black/10 dark:border-white/10">
                        <span className="text-sm font-medium text-gray-900 dark:text-white/90 tabular-nums">
                            Receipt{value.length > 1 && ` ${lightboxIndex + 1} / ${value.length}`}
                        </span>
                        <button
                            type="button"
                            onClick={closeLightbox}
                            aria-label="Close viewer"
                            className="flex items-center justify-center size-7 rounded-full text-gray-400 hover:text-gray-900 hover:bg-black/5 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {/* Image canvas */}
                    <div
                        ref={canvasRef}
                        className="relative flex-1 overflow-hidden flex items-center justify-center select-none touch-none overscroll-contain"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ cursor: isPanning ? "grabbing" : scale > 1 ? "grab" : "default" }}
                    >
                        {!lightboxLoaded && (
                            value[lightboxIndex].preview ? (
                                <>
                                    <img
                                        src={value[lightboxIndex].preview}
                                        alt=""
                                        aria-hidden
                                        className="absolute inset-0 size-full object-contain blur-lg"
                                    />
                                    {/* WhatsApp-style loading chip over the blurred preview */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="flex size-11 items-center justify-center rounded-full bg-black/45">
                                            <Loader2 className="size-5 animate-spin text-white/90" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div
                                    aria-hidden
                                    className="absolute inset-x-6 inset-y-10 animate-pulse rounded-lg bg-black/5 dark:bg-white/[0.06] pointer-events-none"
                                />
                            )
                        )}
                        <img
                            src={value[lightboxIndex].url}
                            alt={`Receipt ${lightboxIndex + 1}`}
                            draggable={false}
                            onLoad={() => setLightboxLoaded(true)}
                            style={{
                                transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
                                transition: isPanning ? "none" : "transform 0.15s ease, opacity 0.3s ease",
                                opacity: lightboxLoaded ? 1 : 0,
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                userSelect: "none",
                                borderRadius: "6px",
                            }}
                        />

                        {value.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => goTo(lightboxIndex - 1)}
                                    disabled={lightboxIndex === 0}
                                    aria-label="Previous receipt"
                                    className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 rounded-full bg-black/5 border border-black/10 text-gray-500 hover:text-gray-900 hover:bg-black/10 dark:bg-white/[0.06] dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                >
                                    <ChevronLeft className="size-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goTo(lightboxIndex + 1)}
                                    disabled={lightboxIndex === value.length - 1}
                                    aria-label="Next receipt"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center size-9 rounded-full bg-black/5 border border-black/10 text-gray-500 hover:text-gray-900 hover:bg-black/10 dark:bg-white/[0.06] dark:border-white/10 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                >
                                    <ChevronRight className="size-5" />
                                </button>
                            </>
                        )}
                    </div>

                    {/* Bottom controls — pill style matching your UI */}
                    <div className="flex items-center justify-center gap-1 px-4 py-4 shrink-0 border-t border-black/10 dark:border-white/10">
                        {/* Controls group */}
                        <div className="flex items-center gap-1 rounded-full px-3 py-2 bg-black/5 border border-black/10 dark:bg-white/[0.06] dark:border-white/10">
                            <button
                                type="button"
                                onClick={() => zoom(0.75)}
                                aria-label="Zoom out"
                                className="flex items-center justify-center size-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                            >
                                <ZoomOut className="size-4" />
                            </button>

                            <span className="text-gray-500 dark:text-white/50 text-xs min-w-[42px] text-center tabular-nums">
                                {Math.round(scale * 100)}%
                            </span>

                            <button
                                type="button"
                                onClick={() => zoom(1.33)}
                                aria-label="Zoom in"
                                className="flex items-center justify-center size-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                            >
                                <ZoomIn className="size-4" />
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-5 mx-2 bg-black/10 dark:bg-white/10" />

                        {/* Fit & Reset group */}
                        <div className="flex items-center gap-1 rounded-full px-3 py-2 bg-black/5 border border-black/10 dark:bg-white/[0.06] dark:border-white/10">
                            <button
                                type="button"
                                onClick={() => { setScale(2); setTranslate({ x: 0, y: 0 }); lastTranslate.current = { x: 0, y: 0 }; }}
                                className="flex items-center justify-center size-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                                title="Zoom to 2×"
                            >
                                <Maximize2 className="size-4" />
                            </button>
                            <button
                                type="button"
                                onClick={resetView}
                                className="flex items-center justify-center size-8 rounded-full text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                                title="Reset"
                            >
                                <RotateCcw className="size-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
