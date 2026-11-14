// Service worker: makes the app installable and playable offline.
// Online every request goes to the network first, so a deploy shows up on the next launch; the cache is the
// offline fallback. On install it precaches every file listed in precache.json (written by the deploy workflow;
// absent locally, then only visited files are cached). BUILD is stamped by the deploy, so each deploy installs
// a fresh worker and drops the old cache.
const BUILD = 'c1f5ca4bf01d';
const CACHE = `brain-evolution-${BUILD}`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch('precache.json', {cache: 'no-store'});
      if (resp.ok) await cache.addAll(await resp.json());
    } catch (e) { /* offline or local run: cache as we go */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || req.headers.has('range')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(req);
      if (resp.status === 200) cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      // precached files are stored without ?v=, so match ignoring the query
      const hit = await cache.match(req) || await cache.match(req, {ignoreSearch: true})
        || (req.mode === 'navigate' ? await cache.match('./', {ignoreSearch: true}) : undefined);
      if (hit) return hit;
      throw e;
    }
  })());
});
