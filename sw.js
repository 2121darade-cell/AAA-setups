// Service Worker for Unified Trading Terminal
const CACHE_NAME = 'trading-terminal-v18';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './assets/style.css',
  './assets/app.js',
  './assets/i18n.js',
  './assets/trade_setup.js',
  './assets/aaa_screener.js',
  './assets/echarts.min.js',
  './manifest.json',
  './assets/cubeplus_feed.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
