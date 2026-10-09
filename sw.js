/**
 * sw.js - Service Worker PWA Ordre de Mission SRM TTA
 * - PrÃ©cache tolÃ©rant : un fichier manquant ne bloque plus l'installation
 * - Network-first : les mises Ã  jour GitHub sont visibles immÃ©diatement
 * - Hors-ligne : repli sur le cache
 * - Les requÃªtes externes (synchronisation Cloud) ne sont jamais interceptÃ©es
 */
const CACHE_NAME = 'ordre-mission-v10';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/font-awesome.min.css',
  './assets/logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-192.png',
  './assets/icons/maskable-512.png',
  './js/logo_data.js',
  './js/html2pdf.bundle.min.js',
  './js/demo_data.js',
  './js/users.js',
  './js/auth.js',
  './js/missions.js',
  './js/history.js',
  './js/dashboard.js',
  './js/pdf.js',
  './js/app.js',
  './js/paho-mqtt.min.js',
  './js/cloud_sync.js'
];

/* ---- Installation : mise en cache fichier par fichier ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[SW] Non mis en cache :', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

/* ---- Activation : suppression des anciens caches ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---- RequÃªtes : network-first, repli cache ---- */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Ignorer tout ce qui n'est pas GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignorer les requÃªtes externes (ntfy.sh, CDN, Firebase...) et les flux SSE
  if (url.origin !== self.location.origin) return;
  if (req.headers.get('accept') === 'text/event-stream') return;

  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(cached => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Hors ligne' });
        })
      )
  );
});
