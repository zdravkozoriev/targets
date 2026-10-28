// Офлайн кеш за двата сайта: при интернет винаги зарежда най-новата версия,
// а без интернет показва последната запазена. Данните пази Firestore отделно.
const CACHE = 'targets-v4';
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/icon-maskable-512.png',
  'manager/',
  'manager/index.html',
  'manager/app.js',
  'manager/manifest.webmanifest',
  'manager/icons/icon-192.png',
  'manager/icons/icon-512.png',
  'manager/icons/apple-touch-icon.png',
  'manager/icons/icon-maskable-512.png',
  'shared/base.css',
  'shared/firebase-config.js',
  'shared/logic.js',
  'shared/store.js',
  'shared/ui.js',
  'shared/util.js',
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // „no-cache“ пита сървъра дали има промяна, без да тегли наново непроменените файлове.
      const res = await Promise.race([
        fetch(req.url, { cache: 'no-cache' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const page = new URL(req.url).pathname.includes('/manager/') ? 'manager/' : './';
        return (await cache.match(page)) || Response.error();
      }
      return Response.error();
    }
  })());
});
