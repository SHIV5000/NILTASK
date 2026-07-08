/**
 * TaskFlow Service Worker — enables PWA install prompt on Android/Chrome
 * Caches core app shell for offline-capable experience
 */
const CACHE   = 'taskflow-v127';
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
  '/js/utils/text.js',
  '/js/core/feed.js',
  '/js/core/reactions.js',
  '/js/core/unread.js',
  '/js/db.js',
  '/manifest.json',
  '/version.json',
  '/favicon.svg',
  '/icons/notif.png',
  '/icons/badge-96.png',
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
          g.onerror   = () => res(null);
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
          g.onsuccess = () => res(g.result); g.onerror = () => res(null);
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
    // Do Not Disturb — suppress background notifications entirely.
    try { if (await _swGetKV('dnd')) return; } catch (e) {}
    // If the app is open AND visible, let the in-app handler show it (avoids a
    // duplicate with the page's own notification). Only show from here otherwise.
    try {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some(c => c.visibilityState === 'visible')) return;
    } catch (e) {}
    // Stack per chat: fold repeats into one notification with a running count.
    let count = 1;
    try {
      const existing = await self.registration.getNotifications({ tag });
      if (existing.length) count = (existing[0].data?.count || 1) + 1;
    } catch(e) {}
    const body = count > 1 ? (count + ' new messages') : (data.body || 'New message');
    try { if (self.navigator?.setAppBadge) await self.navigator.setAppBadge(); } catch(e) {}
    await self.registration.showNotification(data.title || 'Noted For Action', {
      body,
      icon:    '/icons/notif.png',
      badge:   '/icons/badge-96.png',
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
  // Web Share Target (POST): the OS share sheet posts shared text + files here.
  // Stash them in a Cache the page can read, then redirect into the app so it can
  // let the user pick a chat to send them into.
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const form  = await e.request.formData();
        const title = form.get('share_title') || '';
        const text  = form.get('share_text')  || '';
        const url   = form.get('share_url')   || '';
        const files = form.getAll('share_files') || [];
        const cache = await caches.open('share-inbox');
        for (const k of await cache.keys()) await cache.delete(k);   // clear any prior share
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
      } catch (err) { /* fall through to the app anyway */ }
      return Response.redirect('/?sharetarget=1', 303);
    })());
    return;
  }

  // Only handle GET, skip Supabase API calls and external CDNs
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('googleapis.com')) return;

  // Navigation requests: always go to network (bypass HTTP cache) so a fresh
  // build is never masked by a stale disk-cached HTML; fall back to cache offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request))
        .then(r => r || caches.match('/index.html'))
        .then(r => r || caches.match('/offline.html'))
    );
    return;
  }

  // JS/CSS: stale-while-revalidate — serve the cached copy INSTANTLY (fast repeat
  // loads, the "use cache" win) while fetching a fresh copy in the background to
  // update the cache for next time. A version bump of CACHE + the SW activate step
  // still guarantees a full refresh on each release, so this never masks a deploy:
  // the whole file set updates together in the background and is served fresh next load.
  const isCode = e.request.url.includes('/css/') || e.request.url.includes('/js/');
  if (isCode) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Other GETs: network-first, cache fallback.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
