import { createId } from "@paralleldrive/cuid2";

// Mirrors the object store public/sw.js reads from directly (service
// workers can access IndexedDB) — both sides agree on this shape so either
// can drain the queue.
const DB_NAME = "spendly-outbox";
const STORE_NAME = "mutations";

export type OutboxItem = {
    id: string;
    method: "POST" | "PATCH";
    url: string;
    body: unknown;
    label: string;
    createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Queues a mutation for replay once connectivity returns. */
export async function enqueueMutation(item: Omit<OutboxItem, "id" | "createdAt">): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ ...item, id: createId(), createdAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });

    // Best-effort: Background Sync wakes the SW as soon as the OS reports
    // connectivity, even if this tab isn't open. Unsupported (Safari/
    // Firefox) or denied registrations fall back to the `online`-event
    // listener in components/sw-register.tsx.
    if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const syncable = reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
        try {
            await syncable.sync?.register("spendly-outbox");
        } catch {
            // ignored — online-event fallback covers this
        }
    }
}

export async function peekOutbox(): Promise<OutboxItem[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export function requestOutboxDrain() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.controller?.postMessage({ type: "DRAIN_OUTBOX" });
    }
}
