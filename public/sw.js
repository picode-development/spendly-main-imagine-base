/**
 * Spendly service worker.
 *
 * fetch handling, in priority order:
 *   1. Web Share Target intercept — unchanged from the original, always wins.
 *   2. Static asset cache-first (icons, Next's hashed _next/static bundles).
 *   3. Network-first for a small allowlist of read-only API GETs — cache is
 *      only ever a fallback for offline reads, never served ahead of a live
 *      fetch (mutations need to see their own writes immediately).
 *   4. Navigations — network-first with a timeout, offline page on failure.
 *
 * Also: push notifications, an offline-write outbox drained via Background
 * Sync (with a client-driven `online`-event fallback for browsers without
 * it), and a versioned-cache update lifecycle gated behind an explicit
 * SKIP_WAITING message so open tabs are never surprised by new caching
 * logic mid-session.
 */

const SW_VERSION = "v3";
const CACHE_STATIC = `spendly-static-${SW_VERSION}`;
const CACHE_API = `spendly-api-${SW_VERSION}`;
const CACHE_SHELL = `spendly-shell-${SW_VERSION}`;
const KNOWN_CACHES = [CACHE_STATIC, CACHE_API, CACHE_SHELL];

// "spendly-share-stash" is intentionally unversioned and excluded from the
// cleanup below — it holds in-flight share uploads and must survive deploys.
const PRESERVED_CACHES = ["spendly-share-stash"];

const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
];

// Read-only, low-risk-to-cache API GETs. Anything not on this list (writes,
// /api/widget/*, everything else) is never touched by the cache layer.
const CACHEABLE_API_PATHS = [
  "/api/summary",
  "/api/accounts",
  "/api/categories",
  "/api/transactions",
  "/api/pending-transactions",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("spendly-") &&
              !PRESERVED_CACHES.includes(name) &&
              !KNOWN_CACHES.includes(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const { type } = event.data || {};
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(CACHE_API));
  } else if (type === "CLEAR_CACHES") {
    event.waitUntil(Promise.all(KNOWN_CACHES.map((name) => caches.delete(name))));
  } else if (type === "DRAIN_OUTBOX") {
    event.waitUntil(drainOutbox());
  } else if (type === "GET_CACHE_INFO") {
    const port = event.ports && event.ports[0];
    if (!port) return;
    event.waitUntil(
      (async () => {
        const [staticKeys, apiKeys, outboxCount] = await Promise.all([
          caches.open(CACHE_STATIC).then((c) => c.keys()),
          caches.open(CACHE_API).then((c) => c.keys()),
          countOutbox(),
        ]);
        port.postMessage({
          staticCount: staticKeys.length,
          apiCount: apiKeys.length,
          outboxCount,
        });
      })(),
    );
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "spendly-outbox") {
    event.waitUntil(drainOutbox());
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Share Target — always wins, unchanged behavior.
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // 2. Static assets — cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Allowlisted API reads — network-first, cache only as an offline fallback.
  if (CACHEABLE_API_PATHS.includes(url.pathname)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // 4. Navigations — network-first, offline page on total failure. Auth
  // pages and RSC/authenticated HTML are always fetched live; only a dead
  // network falls back to the static, unauthenticated offline page.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    /\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf)$/.test(url.pathname)
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached || Response.error();
  }
}

// Network-first: these endpoints back live UI state (a mutation's own
// invalidate-and-refetch must see its own write immediately), so a cached
// response is only ever a fallback for genuinely offline reads, never
// served ahead of a live network attempt.
async function networkFirstApi(request) {
  const cache = await caches.open(CACHE_API);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function networkFirstNavigation(request) {
  const controller = new AbortController();
  // Generous — this only needs to catch a truly hung request. A slow-but-
  // succeeding fetch (e.g. a cold serverless start) must win, not get
  // bumped to the offline page.
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    const shell = await caches.open(CACHE_SHELL);
    const offline = await shell.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

async function detectMimeFromBytes(file) {
  try {
    if (!file || typeof file.slice !== "function") return null;
    const slice = file.slice(0, 16);
    const buf = new Uint8Array(await slice.arrayBuffer());
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "image/jpeg";
    }
    if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      return "image/png";
    }
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) {
      return "image/webp";
    }
    if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return "image/gif";
    }
    if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
      return "image/bmp";
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function handleShareTarget(event) {
  let fallbackRequest = null;
  try {
    fallbackRequest = event.request.clone();
  } catch (e) {
    // clone may fail on some streaming bodies
  }
  try {
    const formData = await event.request.formData();

    // Extract all file/blob parts from form regardless of parameter name
    const rawFiles = [];
    for (const [, val] of formData.entries()) {
      if (val && typeof val === "object" && (typeof val.slice === "function" || typeof val.arrayBuffer === "function")) {
        rawFiles.push(val);
      }
    }
    for (const f of formData.getAll("media")) {
      if (f && typeof f === "object" && !rawFiles.includes(f)) {
        rawFiles.push(f);
      }
    }

    // Inspect files and detect image content across all UPI apps (Paytm, GPay, PhonePe, Cred, etc.)
    const inspectedFiles = [];
    for (const f of rawFiles) {
      if (!f || typeof f !== "object") continue;
      const size = f.size ?? 0;
      if (size <= 0 || size > 25 * 1024 * 1024) continue;

      const detectedMime = await detectMimeFromBytes(f);
      const type = (f.type || "").toLowerCase();
      const name = (f.name || "").toLowerCase();

      let isImage = false;
      let contentType = detectedMime || type;

      if (detectedMime) {
        isImage = true;
      } else if (type.startsWith("image/")) {
        isImage = true;
      } else if (/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name)) {
        isImage = true;
        if (name.endsWith(".png")) contentType = "image/png";
        else if (name.endsWith(".webp")) contentType = "image/webp";
        else contentType = "image/jpeg";
      } else if (size > 100) {
        // Any binary attachment from an Android share intent (Paytm/GPay/PhonePe share button)
        isImage = true;
        contentType = "image/jpeg";
      }

      if (isImage) {
        inspectedFiles.push({ file: f, contentType: contentType || "image/jpeg" });
      }
    }

    const files = inspectedFiles.slice(0, 25);
    const dropped = inspectedFiles.length - files.length;
    const text = ["title", "text", "url"]
      .map((k) => formData.get(k))
      .filter((v) => typeof v === "string" && v.trim().length > 0)
      .join(" ")
      .trim()
      .slice(0, 2000);

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const cache = await caches.open("spendly-share-stash");

    await cache.put(
      `/__share/${id}/meta`,
      new Response(JSON.stringify({ text, count: files.length, dropped }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    for (let i = 0; i < files.length; i++) {
      const { file, contentType } = files[i];
      await cache.put(
        `/__share/${id}/file/${i}`,
        new Response(file, { headers: { "Content-Type": contentType } }),
      );
    }

    // Response.redirect requires an absolute URL in Chromium / Service Workers
    const redirectUrl = new URL(`/share-claim?local=${id}`, event.request.url).href;
    return Response.redirect(redirectUrl, 303);
  } catch (e) {
    if (fallbackRequest) {
      return fetch(fallbackRequest);
    }
    return Response.redirect(new URL("/transactions", event.request.url).href, 303);
  }
}

// --- Offline write outbox ------------------------------------------------
// Queued client-side (see lib/offline-outbox.ts) when a transaction
// create/edit fails while offline. Drained here — via Background Sync where
// supported, or a client-posted DRAIN_OUTBOX message (sent on the browser's
// `online` event) everywhere else — so both paths share one replay path.

const OUTBOX_DB = "spendly-outbox";
const OUTBOX_STORE = "mutations";

function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(OUTBOX_STORE)) {
        req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAllOutboxItems(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteOutboxItem(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function countOutbox() {
  try {
    const db = await openOutboxDb();
    const items = await readAllOutboxItems(db);
    return items.length;
  } catch {
    return 0;
  }
}

let draining = false;
async function drainOutbox() {
  if (draining) return; // single-flight guard: sync + online-fallback can both fire
  draining = true;
  try {
    const db = await openOutboxDb();
    const items = await readAllOutboxItems(db);
    const results = [];
    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(item.body),
        });
        if (response.ok || response.status === 409) {
          // 409 = server-side idempotency conflict, i.e. already applied
          await deleteOutboxItem(db, item.id);
          results.push({ id: item.id, ok: true });
        } else if (response.status === 401) {
          // Session expired while offline — leave queued for manual retry
          results.push({ id: item.id, ok: false, status: 401 });
        } else {
          await deleteOutboxItem(db, item.id);
          results.push({ id: item.id, ok: false, status: response.status });
        }
      } catch {
        // Still offline — stop this pass, remaining items stay queued
        break;
      }
    }

    if (results.length > 0) {
      const clientsList = await self.clients.matchAll({ type: "window" });
      for (const client of clientsList) {
        client.postMessage({ type: "OUTBOX_DRAINED", results });
      }
    }
  } finally {
    draining = false;
  }
}

// --- Push notifications ----------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Spendly", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window" });
      const existing = clientsList.find((c) => c.url.includes(targetUrl));
      if (existing) {
        existing.focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
