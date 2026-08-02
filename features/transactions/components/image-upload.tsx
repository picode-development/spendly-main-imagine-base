"use client";

import { useRef, useState, useCallback } from "react";
import { ImageIcon, Loader2, X, ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    value?: string | null;
    onChange: (url: string | null) => void;
    disabled?: boolean;
};

export const ImageUpload = ({ value, onChange, disabled }: Props) => {
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [scale, setScale] = useState(1);
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const lastTranslate = useRef({ x: 0, y: 0 });
    const lastPinchDist = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const resetView = useCallback(() => {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        lastTranslate.current = { x: 0, y: 0 };
    }, []);

    const openLightbox = () => { resetView(); setIsLightboxOpen(true); };
    const closeLightbox = () => { setIsLightboxOpen(false); resetView(); };
    const zoom = (factor: number) =>
        setScale(prev => Math.min(Math.max(prev * factor, 0.5), 8));

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.15 : 0.87);
    };

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
        e.preventDefault();
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

    const uploadToImgBB = async (file: File) => {
        const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
        if (!apiKey) throw new Error("ImgBB API key not configured");
        const formData = new FormData();
        formData.append("image", file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: formData,
        });
        const data = await res.json();
        if (!data.success) throw new Error("ImgBB upload failed");
        return data.data.url as string;
    };

    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setIsUploading(true);
        try {
            const url = await uploadToImgBB(file);
            onChange(url);
        } catch (e) {
            console.error("Image upload error:", e);
        } finally {
            setIsUploading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const handleRemove = () => {
        onChange(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <>
            <div className="space-y-2">
                {value ? (
                    <div className="relative w-full rounded-md overflow-hidden border border-border group">
                        <img
                            src={value}
                            alt="Receipt"
                            className="w-full max-h-48 object-cover cursor-zoom-in"
                            onClick={openLightbox}
                        />
                        <div
                            className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center cursor-zoom-in"
                            onClick={openLightbox}
                        >
                            <ZoomIn className="size-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                            disabled={disabled}
                            className="absolute top-2 right-2 bg-black/50 hover:bg-black/75 text-white/80 hover:text-white rounded-full p-1 transition-colors z-10"
                        >
                            <X className="size-3" />
                        </button>
                    </div>
                ) : (
                    <div
                        onClick={() => !disabled && !isUploading && inputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-32 rounded-md border-2 border-dashed transition-colors",
                            "bg-muted dark:bg-[#0d1122] text-muted-foreground",
                            isDragging
                                ? "border-primary/60 dark:bg-[#0d1122]"
                                : "border-border hover:border-primary/40 hover:bg-accent dark:hover:bg-[#0d1122]/80",
                            disabled || isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                        )}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="size-6 animate-spin text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">Uploading...</p>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="size-6 text-muted-foreground mb-1" />
                                <p className="text-xs font-medium text-muted-foreground">Click or drag & drop</p>
                                <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP supported</p>
                            </>
                        )}
                    </div>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInputChange}
                    disabled={disabled || isUploading}
                />
            </div>

            {/* Gallery Lightbox — adapts to the active light/dark theme */}
            {isLightboxOpen && value && (
                <div className="fixed inset-y-0 right-0 w-full sm:w-[449px] z-[9999] flex flex-col bg-white dark:bg-[#0d1122]">
                    {/* Header — matches sheet header style */}
                    <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-black/10 dark:border-white/10">
                        <span className="text-sm font-medium text-gray-900 dark:text-white/90">Receipt</span>
                        <button
                            type="button"
                            onClick={closeLightbox}
                            className="flex items-center justify-center size-7 rounded-full text-gray-400 hover:text-gray-900 hover:bg-black/5 dark:text-white/50 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    {/* Image canvas */}
                    <div
                        className="flex-1 overflow-hidden flex items-center justify-center select-none"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ cursor: isPanning ? "grabbing" : scale > 1 ? "grab" : "default" }}
                    >
                        <img
                            src={value}
                            alt="Receipt"
                            draggable={false}
                            style={{
                                transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
                                transition: isPanning ? "none" : "transform 0.15s ease",
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                userSelect: "none",
                                borderRadius: "6px",
                            }}
                        />
                    </div>

                    {/* Bottom controls — pill style matching your UI */}
                    <div className="flex items-center justify-center gap-1 px-4 py-4 shrink-0 border-t border-black/10 dark:border-white/10">
                        {/* Controls group */}
                        <div className="flex items-center gap-1 rounded-full px-3 py-2 bg-black/5 border border-black/10 dark:bg-white/[0.06] dark:border-white/10">
                            <button
                                type="button"
                                onClick={() => zoom(0.75)}
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