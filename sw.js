/**
 * TaskFlow Service Worker — enables PWA install prompt on Android/Chrome
 * Caches core app shell for offline-capable experience
 */
const CACHE = 'taskflow-v217';
const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/tailwind.generated.css?v=13',
  '/css/theme.css',
  '/css/mobile.css',
  '/js/shared.js',
  '/js/shared.js?v=208',
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
  '/js/activity-v208.js?v=213',
  '/js/main.js',
  '/js/native.js',
  '/js/utils/logger.js',
  '/js/utils/text.js',
  '/js/core/feed.js',
  '/js/core/reactions.js',
  '/js/core/unread.js',
  '/js/db.js',

  // Exact query-versioned URLs loaded dynamically by runtime bootstrap files.
  // Cache matching is query-sensitive, so the exact request URL is required.
  '/js/compact-panel-filters.js?v=5',
  '/js/core/realtime-manager.js?v=1',
  '/js/core/realtime-feature-owners.js?v=5',
  '/js/core/session-lifecycle.js?v=4',
  '/js/core/runtime-diagnostics.js?v=7',
  '/js/core/mobile-runtime-diagnostics.js?v=3',
  '/js/runtime-subscription-guard.js?v=7',
  '/js/notification-presentation-service.js?v=3',
  '/js/core/unread-service.js?v=4',
  '/js/core/chat-parity-service.js?v=2',
  '/js/desktop-web-v13.js?v=1',

  '/manifest.json',
  '/version.json',
  '/favicon.svg',
  '/icons/notif.png',
  '/icons/badge-96.png',
];

// Install — cache core files. Do not let one missing/temporarily unavailable
// optional asset make the entire service-worker install fail; on mobile that
// strands users on the previous cached build and prevents offline fallback updates.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async url => {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn('[sw] precache skipped', url, err && err.message ? err.message : err);
      }
    }));
    await self.skipWaiting();
  })());
});

// Activate — clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // Keep the share-inbox (holds files mid-share-hand-off); drop old app caches.
        keys.filter(k => k !== CACHE && k !== 'share-inbox').map(k => caches.delete(k))
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
          g.onerror = () => res(null);
        } catch(e) { res(null); }
      };
      r.onerror = () => res(null);
    } catch(e) { res(null); }
  });
}

function _swGetKV(key) {
  return new Promise(res => {
    try {
      const r = indexedDB.open('taskflow', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch(e){} };
      r.onsuccess = () => {
        try {
          const g = r.result.transaction('kv', 'readonly').objectStore('kv').get(key);
          g.onsuccess = () => res(g.result);
          g.onerror = () => res(null);
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
    try { if (await _swGetKV('dnd')) return; } catch (e) {}
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some(c => c.visibilityState === 'visible')) return;
    } catch (e) {}
    let count = 1;
    try {
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length) count = (existing[0].data?.count || 1) + 1;
    } catch(e) {}
    const body = count > 1 ? (count + ' new messages') : (data.body || 'New message');
    try { if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(); } catch(e) {}
    const important = tag.endsWith(':mention') || data.priority === 'high'
                   || String(data.room || '').startsWith('dm_');
    await self.registration.showNotification(data.title || 'Noted For Action', {
      body,
      icon: '/icons/notif.png',
      badge: '/icons/badge-96.png',
      vibrate: important ? [250, 120, 250, 120, 250] : [200, 100, 200],
      tag,
      renotify: true,
      requireInteraction: important,
      data: { url: data.url || '/', room: data.room, count },
      actions: [{ action: 'reply', type: 'text', title: 'Reply', placeholder: 'Message…' }]
    });
  })());
});

// ── Notification click / quick-reply ───────────────────────
self.addEventListener('notificationclick', e => {
  const room = e.notification.data?.room;
  const url = e.notification.data?.url || '/';

  if (e.action === 'reply' && e.reply) {
    e.notification.close();
    e.waitUntil((async () => {
      const ok = await _swSendReply(room, e.reply);
      if (!ok) {
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

function _swOfflineResponse(message = 'Noted For Action is temporarily offline.') {
  return new Response(message, {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function _swCachePut(request, response) {
  if (!response?.ok) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  } catch (_) {}
}

// Fetch — network first, cache fallback. Every respondWith branch is guaranteed
// to resolve to an actual Response; a cache miss can never resolve as undefined.
self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const title = form.get('share_title') || '';
        const text = form.get('share_text') || '';
        const url = form.get('share_url') || '';
        const files = form.getAll('share_files') || [];
        const cache = await caches.open('share-inbox');
        for (const k of await cache.keys()) await cache.delete(k);
        await cache.put('/__share-meta', new Response(
          JSON.stringify({ title, text, url, count: files.length }),
          { headers: { 'Content-Type': 'application/json' } }
        ));
        let i = 0;
        for (const f of files) {
          if (!f || typeof f === 'string') continue;
          await cache.put('/__share-file-' + i, new Response(f, {
            headers: {
              'Content-Type': f.type || 'application/octet-stream',
              'X-Name': encodeURIComponent(f.name || ('file-' + i))
            }
          }));
          i++;
        }
      } catch (err) {}
      return Response.redirect('/?sharetarget=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googleapis.com')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const network = await fetch(e.request, { cache: 'no-store' });
        if (network) return network;
      } catch (_) {}

      try {
        const exact = await caches.match(e.request);
        if (exact) return exact;
        const shell = await caches.match('/index.html');
        if (shell) return shell;
        const offline = await caches.match('/offline.html');
        if (offline) return offline;
      } catch (_) {}

      return _swOfflineResponse('Noted For Action cannot load this page while offline.');
    })());
    return;
  }

  const isCode = e.request.url.includes('/css/') || e.request.url.includes('/js/');
  if (isCode) {
    e.respondWith((async () => {
      try {
        const network = await fetch(e.request);
        if (network) {
          _swCachePut(e.request, network);
          return network;
        }
      } catch (_) {}

      try {
        const cached = await caches.match(e.request);
        if (cached) return cached;
      } catch (_) {}

      return _swOfflineResponse('Code asset unavailable while offline.');
    })());
    return;
  }

  e.respondWith((async () => {
    try {
      const network = await fetch(e.request);
      if (network) {
        _swCachePut(e.request, network);
        return network;
      }
    } catch (_) {}

    try {
      const cached = await caches.match(e.request);
      if (cached) return cached;
    } catch (_) {}

    return _swOfflineResponse('Resource unavailable while offline.');
  })());
});