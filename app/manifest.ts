import type { MetadataRoute } from "next";

// Installable PWA manifest. share_target lets Android's share sheet offer
// "Spendly" for an image-backed UPI payment confirmation or receipt.
const manifestVersion = "2026-09-19-v2";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Spendly",
        short_name: "Spendly",
        description: "Track spending, receipts, and transfers.",
        // Force Android to treat this as a fresh install identity when the
        // share target or payload handling changes. Reusing the same ID causes the
        // old installed WebAPK to keep the stale share registration.
        id: `spendly-pwa-${manifestVersion}`,
        start_url: `/?source=pwa&v=${manifestVersion}`,
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "any",
        lang: "en",
        dir: "ltr",
        prefer_related_applications: false,
        background_color: "#0d1122",
        theme_color: "#0d1122",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        share_target: {
            action: "/share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
                title: "title",
                text: "text",
                url: "url",
                files: [{
                    name: "file",
                    accept: [
                        "image/*",
                        "image/jpeg",
                        "image/png",
                        "image/webp",
                        "image/heic",
                        "image/heif",
                        ".jpg",
                        ".jpeg",
                        ".png",
                        ".webp",
                        ".heic",
                        ".heif",
                    ],
                }],
            },
        },
        categories: ["finance", "productivity"],
        shortcuts: [
            {
                name: "Add Transaction",
                url: "/?new=true",
                icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
            {
                name: "Dashboard",
                url: "/",
                icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
            {
                name: "Transactions",
                url: "/transactions",
                icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
            },
        ],
    } as MetadataRoute.Manifest;
}
