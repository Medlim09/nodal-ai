/* ══════════════════════════════════════════════════════════════
   NODAL AI — Service Worker
   Caches the app shell for offline use.
   Live data API calls always go through the network.
══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'nodal-ai-v1';
const APP_SHELL  = ['./nodal-ai-economy-analysis.html', './manifest.json'];

// API hostnames that should NEVER be cached (always live)
const LIVE_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'api.coingecko.com',
  'api.frankfurter.app',
  'api.alternative.me',
  'api.bls.gov',
  'fred.stlouisfed.org',
  'corsproxy.io',
  'api.allorigins.win',
  'api.codetabs.com',
  'api.anthropic.com',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// ── Activate: clear old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for live APIs, cache-first for shell ─
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network for live data APIs
  if (LIVE_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Cache-first for app shell (HTML, fonts, static assets)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses for the app shell
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: serve the main HTML for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./nodal-ai-economy-analysis.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});

// ── Background sync: refresh live data when back online ───────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
