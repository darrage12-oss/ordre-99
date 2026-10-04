const CACHE_NAME = 'ordre-mission-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/font-awesome.min.css',
  './assets/logo.png',
  './js/logo_data.js',
  './js/demo_data.js',
  './js/html2pdf.bundle.min.js',
  './js/users.js',
  './js/missions.js',
  './js/pdf.js',
  './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Fallback to cache if network fails
        return caches.match('./index.html');
      });
    })
  );
});
