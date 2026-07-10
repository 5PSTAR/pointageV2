const CACHE = '5pstar-salarie-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copie = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copie));
      return res;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html')))
  );
});
