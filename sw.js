/**
 * TaskFlow Service Worker — enables PWA install prompt on Android/Chrome
 * Caches core app shell for offline-capable experience
 */
const CACHE   = 'taskflow-v38';
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

// ── IndexedDB auth (written by the client) so the SW can post quick-replies ──
function _swGetAuth() {
  return new Promise(res => {
    try {
      const r = indexedDB.open('taskflow', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch(e){} };
      r.onsuccess = () => {
        try {
          const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('auth');
          g.onsuccess = () => res(g.result || null);
          g.onerror   = () => res(null);
        } catch(e) { res(null); }
      };
      r.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}

async function _swSendReply(room, text) {
  const auth = await _swGetAuth();
  if (!auth?.token || !auth?.url || !room || !text) return false;
  try {
    const res = await fetch(auth.url + '/rest/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': auth.anon,
        'Authorization': 'Bearer ' + auth.token,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        room_id: room,
        sender_id: auth.uid,
        tenant_id: auth.tenant,
        text: '<p>' + String(text).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</p>',
        created_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch(e) { return false; }
}

// ── Push event ───────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const tag = data.tag || 'taskflow';
  e.waitUntil((async () => {
    // Stack per chat: fold repeats into one notification with a running count.
    let count = 1;
    try {
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length) count = (existing[0].data?.count || 1) + 1;
    } catch(e) {}
    const body = count > 1 ? (count + ' new messages') : (data.body || 'New message');
    try { if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(); } catch(e) {}
    await self.registration.showNotification(data.title || 'TaskFlow', {
      body,
      icon:    '/favicon.svg',
      badge:   '/favicon.svg',
      vibrate: [200, 100, 200],
      tag,
      renotify: true,
      data:    { url: data.url || '/', room: data.room, count },
      actions: [{ action: 'reply', type: 'text', title: 'Reply', placeholder: 'Message…' }]
    });
  })());
});

// ── Notification click / quick-reply ───────────────────────
self.addEventListener('notificationclick', e => {
  const room = e.notification.data?.room;
  const url  = e.notification.data?.url || '/';

  // Inline reply from the notification shade (Android).
  if (e.action === 'reply' && e.reply) {
    e.notification.close();
    e.waitUntil((async () => {
      const ok = await _swSendReply(room, e.reply);
      if (!ok) {
        // Couldn't post (e.g. token expired) — open the chat so the user can send.
        const list = await clients.matchAll({ type:'window', includeUncontrolled:true });
        if (list[0]) { list[0].postMessage({ type:'open-room', room }); list[0].focus(); }
        else await clients.openWindow(url);
      }
    })());
    return;
  }

  e.notification.close();
  e.waitUntil((async () => {
    try { if (self.navigator?.clearAppBadge) await self.navigator.clearAppBadge(); } catch(e) {}
    const list = await clients.matchAll({ type:'window', includeUncontrolled:true });
    const existing = list.find(c => 'focus' in c);
    if (existing) { existing.postMessage({ type:'open-room', room }); return existing.focus(); }
    return clients.openWindow(url);
  })());
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
