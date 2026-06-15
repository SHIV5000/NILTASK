/**
 * TaskFlow Service Worker — enables PWA install prompt on Android/Chrome
 * Caches core app shell for offline-capable experience
 */
const CACHE   = 'taskflow-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/css/theme.css',
  '/css/mobile.css',
  '/js/shared.js',
  '/js/auth.js',
  '/js/ui-core.js',
  '/manifest.json',
  '/favicon.svg',
];

// Install — cache core files
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  // Only handle GET, skip Supabase API calls
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googleapis.com')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses for static assets
        if (res.ok && (e.request.url.includes('/css/') || e.request.url.includes('/js/'))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
