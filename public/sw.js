/* KAVYA GUPTA — service worker.
 * Hashed build assets: cache-first (they never change).
 * Pages: network-first, falling back to the last cached copy offline.
 * /api/*: never cached.
 */
const ASSETS = 'kg-assets-v1';
const PAGES = 'kg-pages-v1';
const MAX_ASSETS = 90;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== ASSETS && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // only the page itself is kept for offline: never an error page or a stray file
          if (res.ok && url.pathname === '/' && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          trim(cache);
        }
        return res;
      }),
    );
    return;
  }

  // icons, manifest, og image: stale-while-revalidate
  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
