/*
=========================================================

COMPASS-TOS

Service Worker

Version 1.0.0

Build 23

Caching rules, deliberately conservative:

- App shell (HTML/CSS/JS/icons): stale-while-revalidate -
  serves the cached copy immediately (fast, works offline),
  but always fetches a fresh copy in the background and
  updates the cache for next time. A pure cache-first
  strategy was tried first but meant updates were NEVER
  seen by a returning visitor until the cache name changed -
  this fixes that while keeping offline support.

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

const CACHE_NAME = "compass-tos-v32";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/css/core.css",
  "assets/css/layout.css",
  "assets/css/components.css",
  "assets/css/typography.css",
  "assets/css/utilities.css",
  "assets/css/themes/light.css",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/vendor/leaflet/leaflet.css",
  "assets/vendor/leaflet/leaflet.js",
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

  // Only ever handle same-origin requests. Cross-origin calls - such as the
  // Frankfurter currency API (api.frankfurter.app) - must pass straight through
  // to the network. Intercepting them here breaks the CORS fetch and the browser
  // reports it as net::ERR_FAILED.
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.includes("/api/") || url.pathname.includes("/auth/")) {
    return;
  }

  if (url.pathname.includes("/data/projects/")) {
    event.respondWith(networkFirst(event.request));

    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);

        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
    // Don't block on the network response, but let it update the cache
    // in the background for next time.
    networkFetch;

    return cached;
  }

  const fresh = await networkFetch;

  return fresh || Response.error();
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
