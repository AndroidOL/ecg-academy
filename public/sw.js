const CACHE_VERSION = 'ecg-20261109ae';
const SHELL = [
  '/', '/offline.html', '/static/manifest.webmanifest',
  '/static/css/tokens.css', '/static/css/base.css', '/static/css/components.css',
  '/static/css/pages.css', '/static/css/ecg.css',
  '/static/img/icon-192.png', '/static/img/icon-512.png', '/static/img/apple-touch-icon.png',
  '/static/js/app.js', '/static/js/theme-init.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('ecg-') && key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallback) return cache.match(fallback);
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((response) => { if (response.ok) cache.put(request, response.clone()); }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API 直接走网络：避免 SW 缓存/网络优先策略让会话 API 请求挂起。
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/offline.html'));
    return;
  }
  if (url.pathname.startsWith('/static/') || url.pathname === '/static/manifest.webmanifest') {
    event.respondWith(cacheFirst(request));
  }
});
