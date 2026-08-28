import type { MetadataRoute } from "next";

// Installable PWA manifest. share_target lets Android's share sheet offer
// "Spendly" for a selected SMS/notification text — it opens /share which
// parses the message into a pending transaction.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Spendly",
        short_name: "Spendly",
        description: "Track spending, receipts, and transfers.",
        start_url: "/",
        display: "standalone",
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
                files: [{ name: "media", accept: ["image/*"] }],
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
