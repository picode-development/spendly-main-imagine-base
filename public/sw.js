/**
 * Spendly service worker — single job: intercept Web Share Target POSTs on
 * the device so shared screenshots never travel as one oversized request
 * (Vercel rejects bodies > ~4.5MB). Files are parked in the Cache API and
 * the share-claim page compresses + uploads them one by one.
 *
 * Deliberately NO offline/page caching: the app stays always-fresh.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith((async () => {
    // Keep the untouched original for the server-side fallback path
    const fallbackRequest = event.request.clone();
    try {
      const formData = await event.request.formData();
      // Bounded to 3: Groq offers a single vision model (qwen3.6-27b) whose
      // free-tier token budget fits ~3 screenshots per minute
      const allImages = formData
        .getAll("media")
        .filter((f) => f && typeof f === "object" && f.type && f.type.startsWith("image/"));
      const files = allImages.slice(0, 3);
      const dropped = allImages.length - files.length;
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
        await cache.put(
          `/__share/${id}/file/${i}`,
          new Response(files[i], { headers: { "Content-Type": files[i].type } }),
        );
      }

      return Response.redirect(`/share-claim?local=${id}`, 303);
    } catch (e) {
      // Anything unexpected: let the server-side stash path handle it
      return fetch(fallbackRequest);
    }
  })());
});
