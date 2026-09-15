// Minimal service worker for Nodosol.
//
// Goal: pass the "installable PWA" Lighthouse check + provide a tiny
// offline shell. We deliberately do NOT cache app routes (Next 15
// has its own cache machinery + RSC streaming, and stale RSC payloads
// are nasty to debug). The SW only caches a hand-curated shell that
// the install prompt + standalone launcher need on a cold reopen.
//
// Anything not in `SHELL_URLS` falls through to the network with a
// graceful offline fallback to the home page (cached at install).

const VERSION = "v1";
const SHELL_CACHE = `nodosol-shell-${VERSION}`;
const SHELL_URLS = ["/", "/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
  );
  // New SW takes over without waiting for old tabs.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("nodosol-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin shell asset → cache-first.
  if (
    url.origin === self.location.origin &&
    SHELL_URLS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req)),
    );
    return;
  }

  // Everything else → network, fall back to cached `/` shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/")),
    );
  }
});
