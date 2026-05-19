// BuildPilot service worker.
//
// Intentionally minimal — the goal is to:
//   1. Make the app installable as a PWA (Chrome / Edge / iOS Safari require
//      a SW + manifest before showing the "Add to Home Screen" prompt).
//   2. Establish a Service Worker registration so Phase-3 Web Push can attach
//      a push handler later without bootstrap-time changes.
//
// We deliberately do NOT cache API responses, SSE streams, or anything under
// `/api` / `/events` — BuildPilot is a live tool and stale data would be
// actively misleading. The shell-asset cache below only catches static
// build output (HTML / JS / CSS / icons) and falls through to the network
// on every request so the latest build is always preferred when online.

const VERSION = 'buildpilot-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Drop any caches from previous SW versions so stale shells don't linger.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GETs. Everything else (POST /api, SSE, etc.)
  // hits the network unmodified.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/events')) return;

  // Network-first for the app shell so users always get the latest build when
  // online. Falls back to the SW cache when offline (e.g. spotty Wi-Fi or
  // when the server is restarting). Failed network + cache miss simply
  // surfaces the original network error — we don't generate fake responses.
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Only cache successful basic responses to avoid persisting opaque
        // CORS or partial-content responses we can't reuse safely.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy).catch(() => undefined));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? Promise.reject('offline'))),
  );
});
