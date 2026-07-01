/**
 * TaskFlow Service Worker — enables PWA install prompt on Android/Chrome
 * Caches core app shell for offline-capable experience
 */
const CACHE   = 'taskflow-v31';
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/theme.css',
  '/css/mobile.css',
  '/js/shared.js',
  '/js/auth.js',
  '/js/rbac.js',
  '/js/ui-core.js',
  '/js/ui-panels.js',
  '/js/ui-feed.js',
  '/js/ui-settings.js',
  '/js/messages.js',
  '/js/tasks.js',
  '/js/notifications.js',
  '/js/mobile.js',
  '/js/main.js',
  '/js/utils/logger.js',
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

// ── Push event (from future push server) ─────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'TaskFlow', {
      body:    data.body || 'New message',
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      vibrate: [200, 100, 200],
      tag:     data.tag || 'taskflow',
      data:    { url: data.url || '/' }
    })
  );
});

// ── Notification click ─────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(clientList => {
        const url = e.notification.data?.url || '/';
        const existing = clientList.find(c => c.url.includes(url) && 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  // Only handle GET, skip Supabase API calls and external CDNs
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googleapis.com')) return;

  // Navigation requests: network first, then cached index.html (full app), then offline.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match('/index.html'))
        .then(r => r || caches.match('/offline.html'))
    );
    return;
  }

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
