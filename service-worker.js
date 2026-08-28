/*
=========================================================

COMPASS-TOS

Service Worker

Version 1.0.0

Build 23

Caching rules, deliberately conservative:

- App shell (HTML/CSS/JS/icons): CACHE-FIRST against a
  versioned cache. Within one CACHE_NAME, every file is
  fetched from the network exactly once and then served
  from cache forever - so a page is always built from ONE
  coherent version of the app, never a mix.

  History: stale-while-revalidate was used here before, and
  it caused a real production incident (v1.6.0 deploy) -
  SWR refreshes cached files one at a time in the
  background, so after a deploy a returning visitor got a
  MIX of old and new files (new components.css with old
  core.css = unreadable text; old JS with new markup =
  broken pages). Cache-first can't mix versions by
  construction. The reason cache-first "didn't work" the
  first time it was tried (updates never reached visitors)
  wasn't the strategy - it was two missing pieces that now
  exist: server.js sends no-cache headers on
  service-worker.js + index.html (so a new SW is detected
  promptly), and index.html reloads once on controllerchange
  (so the update actually lands without a manual refresh).
  Every deploy MUST bump CACHE_NAME - that's what makes the
  new version reach users at all.

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

const CACHE_NAME = "compass-tos-v71";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/css/core.css",
  "assets/css/layout.css",
  "assets/css/components.css",
  "assets/css/mobile.css",
  "assets/css/typography.css",
  "assets/css/utilities.css",
  "assets/css/themes/light.css",
  "assets/css/themes/dark.css",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/vendor/leaflet/leaflet.css",
  "assets/vendor/leaflet/leaflet.js",
];

// Every request this worker makes to FILL its own cache must bypass the
// browser's own HTTP cache. Static assets are served without cache headers,
// so Chrome applies heuristic caching and can hand back a months-old copy -
// which, under cache-first, would then be pinned in the versioned cache
// forever. This caused a real incident: a v48 cache was seeded with a
// pre-v1.5.0 components.css and the dashboard rendered unstyled until the
// cache was rebuilt. "reload" forces a real network trip and refreshes the
// HTTP cache entry too.
function freshRequest(url) {
  return new Request(url, { cache: "reload" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map(freshRequest)))
      .catch(() => {
        // Non-fatal - some app shell files may not exist in every deployment.
        // The service worker still activates; missing files just won't be
        // pre-cached (cacheFirst fetches them on demand, also bypassing the
        // HTTP cache).
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

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  // First time this file is requested under this CACHE_NAME: fetch it
  // once and keep it. It will never be re-fetched until a deploy bumps
  // CACHE_NAME and a fresh worker starts a fresh cache - which is exactly
  // what keeps every page load on one coherent app version.
  //
  // Fetched via freshRequest() so a stale entry in the browser's own HTTP
  // cache can never be baked into this versioned cache (see the note on
  // freshRequest above). The response is stored against the ORIGINAL
  // request so ordinary lookups still hit it.
  try {
    const response = await fetch(freshRequest(request.url));

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);

      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    return Response.error();
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
