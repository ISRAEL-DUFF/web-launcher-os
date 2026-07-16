const CACHE = 'webdock-v3'; // ← bump this string on every deploy to push an update
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
];

/* Cache shell on install */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

/* Clean up old caches on activate, then tell all open tabs there's an update */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
  );
});

/* Fetch strategy:
   - Shell assets  → cache-first (instant load)
   - Firebase/CDN  → network-first, fall back to cache
   - Everything else → network-first
*/
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const isShell = SHELL.some(p => url.pathname.endsWith(p.replace('./', '/'))) || url.pathname === '/';
  const isCDN   = url.hostname.includes('cdn.jsdelivr.net') ||
                  url.hostname.includes('fonts.googleapis.com') ||
                  url.hostname.includes('fonts.gstatic.com') ||
                  url.hostname.includes('cdn.tailwindcss.com');

  if (isShell) {
    // Cache-first for the app shell
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  if (isCDN) {
    // Stale-while-revalidate for CDN assets
    e.respondWith(
      caches.open(CACHE).then(async c => {
        const cached = await c.match(e.request);
        const fresh  = fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }).catch(() => null);
        return cached || fresh;
      })
    );
    return;
  }

  // Network-first for everything else (Firebase, favicons, app iframes)
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
