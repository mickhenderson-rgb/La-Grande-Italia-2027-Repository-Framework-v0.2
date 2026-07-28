/*
=========================================================

COMPASS-TOS

Service Worker

Version 1.0.0

Build 23

Caching rules, deliberately conservative:

- App shell (HTML/CSS/JS/icons): cache-first, so the app
  itself can open offline. Falls back to network if not
  yet cached.

- Trip data (data/projects/.../*.json): network-first,
  falling back to the last cached copy only if the network
  is unavailable. This keeps data fresh whenever there's a
  connection, and still shows something useful offline.

- API writes (/api/data/...): NEVER cached, NEVER served
  from cache, network-only. A save must genuinely succeed
  or genuinely fail - silently "succeeding" from a cache
  would be worse than no offline support at all.

=========================================================
*/

const CACHE_NAME = "compass-tos-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/css/core.css",
  "/assets/css/layout.css",
  "/assets/css/components.css",
  "/assets/css/typography.css",
  "/assets/css/utilities.css",
  "/assets/css/themes/light.css",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {
      // Non-fatal - some app shell files may not exist in every deployment.
      // The service worker still activates; missing files just won't be pre-cached.
    }),
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );

  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname.includes("/data/projects/")) {
    event.respondWith(networkFirst(event.request));

    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);

      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);

      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    throw error;
  }
}
