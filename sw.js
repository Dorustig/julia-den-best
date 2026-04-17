// Julia Besten — service worker
// Simpele strategie: cache-first voor static assets, network-first voor alle /api
// en HTML pagina's. Wijzig de CACHE_VERSION om users geforceerd te updaten.

const CACHE_VERSION = 'jb-v1';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/img/icon-192.svg',
  '/img/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {}) // negeer als assets nog niet gedeployd zijn
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Alleen GET requests cachen
  if (req.method !== 'GET') return;

  // Voor cross-origin (bv. Supabase, Google Fonts) — gewoon network doen
  if (url.origin !== self.location.origin) return;

  // API en pagina-routes: network-first, niet cachen
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/klant/') ||
      url.pathname.startsWith('/coach') || url.pathname.startsWith('/portal-')) {
    return; // default browser behaviour
  }

  // Static assets: cache-first met network fallback
  if (url.pathname.match(/\.(svg|png|jpg|jpeg|webp|ico|woff2?|css|js|webmanifest)$/)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        });
      })
    );
  }
});

// Push notification handler — vaste format: { title, body, url, icon, tag }
self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Julia Besten';
    const opts = {
      body: data.body || '',
      icon: data.icon || '/img/icon-192.svg',
      badge: '/img/icon-192.svg',
      tag: data.tag || 'jb-push',
      data: { url: data.url || '/klant/start' },
    };
    event.waitUntil(self.registration.showNotification(title, opts));
  } catch (e) {
    // niet falen op malformed push
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/klant/start';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
