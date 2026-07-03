/**
 * notifications.js — TaskFlow Push & In-App Notifications  VER 1.1
 * ─────────────────────────────────────────────────────────────
 * Handles:
 *   1. Notification permission request (on login)
 *   2. System notification when message received (wakes screen)
 *   3. Notification sound (in-app + background via SW)
 *   4. Vibration pattern on mobile
 * v1.1: FIXED silent chime — mobile (and many desktop) browsers start a
 *   freshly-created AudioContext "suspended" unless it's created inside a
 *   direct user-gesture call stack. _makeChime() created a brand new one on
 *   every call from a realtime DB callback (never a gesture), so it almost
 *   certainly never produced sound. Now a single shared context is created
 *   once and resumed on the user's first tap anywhere on the page, then
 *   reused — same pattern used for mobile in mobile.js, now centralized
 *   here so it covers desktop too.
 * ─────────────────────────────────────────────────────────────
 */

import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from './shared.js';

// ── SW AUTH BRIDGE — lets the service worker post quick-replies ───
// Persist the current session (access token + ids) to IndexedDB so sw.js can
// insert a message on the user's behalf from the notification shade.
function _idbPutAuth(obj) {
    return new Promise(res => {
        try {
            const r = indexedDB.open('taskflow', 1);
            r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
            r.onsuccess = () => {
                try {
                    const tx = r.result.transaction('kv', 'readwrite');
                    tx.objectStore('kv').put(obj, 'auth');
                    tx.oncomplete = () => res();
                    tx.onerror = () => res();
                } catch (e) { res(); }
            };
            r.onerror = () => res();
        } catch (e) { res(); }
    });
}
// Do Not Disturb — persisted to localStorage AND IndexedDB so the service
// worker can also suppress background push while DND is on.
window._setDND = async function(on) {
    try { localStorage.setItem('mpgs_dnd', on ? '1' : '0'); } catch (e) {}
    try {
        const r = indexedDB.open('taskflow', 1);
        r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
        r.onsuccess = () => { try { r.result.transaction('kv', 'readwrite').objectStore('kv').put(on ? 1 : 0, 'dnd'); } catch (e) {} };
    } catch (e) {}
};

window._persistAuthForSW = async function() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) return;
        await _idbPutAuth({
            url:    SUPABASE_URL,
            anon:   SUPABASE_ANON_KEY,
            token:  session.access_token,
            uid:    window.currentUser?.id,
            tenant: window.currentTenantId
        });
    } catch (e) { /* non-fatal */ }
};
// Keep the stored token fresh across refreshes.
try { sb.auth.onAuthStateChange((_e, session) => { if (session) window._persistAuthForSW(); }); } catch (e) {}

// ── WEB PUSH (background notifications) ───────────────────────────
// Public VAPID key — safe to ship. The matching private key lives only as a
// Supabase secret used by the send-push edge function.
const VAPID_PUBLIC = 'BC1e4iEc-QRWZB2pugDZCElyEFWTja-XS_L0Ij_1gq1Ox2zs6s1gMOSF-k7Leu70yJw81jHChVIvltxOuDGlQEM';

function _urlB64ToUint8(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Subscribe this device for background push and store the subscription so the
// edge function can reach it. Safe to call repeatedly (idempotent upsert).
window.subscribeToPush = async function(opts = {}) {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        if (!window.currentUser?.id) return false;
        if (Notification.permission === 'denied') return false;
        // Ask for permission if not yet decided (so resumed sessions also register).
        // opts.prompt=true means this came from a user tap — always safe to prompt.
        if (Notification.permission !== 'granted') {
            const p = await Notification.requestPermission();
            if (p !== 'granted') return false;
        }
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: _urlB64ToUint8(VAPID_PUBLIC)
            });
        }
        const { error } = await sb.from('push_subscriptions').upsert({
            user_id:      window.currentUser.id,
            tenant_id:    window.currentTenantId,
            endpoint:     sub.endpoint,
            subscription: sub.toJSON()
        }, { onConflict: 'endpoint' });
        window._persistAuthForSW?.();
        return !error;
    } catch (e) { return false; /* non-fatal, in-app notifications still work */ }
};

// ── SHARED AUDIO CONTEXT — unlocked once on first user gesture ────
let _sharedCtx = null;
let _audioUnlocked = false;

function _unlockSharedAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;

    // 1. Unlock Web Audio API
    try {
        _sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_sharedCtx.state === 'suspended') _sharedCtx.resume();

        // Play a zero-duration silent buffer — this satisfies the <audio> element
        // autoplay gate in the same gesture, because Web Audio and HTMLAudioElement
        // share the same "user has interacted with media" flag in Chromium
        const buf = _sharedCtx.createBuffer(1, 1, 22050);
        const src = _sharedCtx.createBufferSource();
        src.buffer = buf;
        src.connect(_sharedCtx.destination);
        src.start(0);
    } catch(e) { /* Web Audio unsupported */ }
}
document.addEventListener('touchstart', _unlockSharedAudio, { once:true, passive:true });
document.addEventListener('click',      _unlockSharedAudio, { once:true });
document.addEventListener('keydown',    _unlockSharedAudio, { once:true });

// ── NOTIFICATION SOUND ─────────────────────────────────────────
// Generates a gentle chime via Web Audio API — no file needed
function _makeChime(vol = 0.4) {
    try {
        // Don't call _unlockSharedAudio() here — if this fires before the
        // user has tapped anything (e.g. a message arrives from a realtime
        // callback on first load), creating/resuming an AudioContext outside
        // a real user gesture is exactly what produced the "AudioContext was
        // not allowed to start" warning. The document-level gesture
        // listeners above are the only place this should be unlocked; if
        // that hasn't happened yet, just skip the chime this one time.
        const ctx = _sharedCtx;
        if (!ctx) return; // not unlocked by a real gesture yet — skip silently
        if (ctx.state === 'suspended') ctx.resume(); // safe: resuming an
            // already-gesture-created context isn't the same restriction
            // as creating a brand new one outside a gesture
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        gain.connect(ctx.destination);

        // Two-tone gentle chime (ding-dong)
        [880, 660].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
            osc.connect(gain);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.6);
        });
    } catch(e) {
        // Silent fail — Web Audio unsupported in this browser
    }
}

// ── REQUEST NOTIFICATION PERMISSION ───────────────────────────
window.requestNotificationPermission = async function() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied')  return false;

    const perm = await Notification.requestPermission();
    return perm === 'granted';
};

// ── SHOW SYSTEM NOTIFICATION (wakes screen on Android) ────────
window.showSystemNotification = async function(title, body, options = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (window._isDND?.()) return;   // Do Not Disturb

    // When the app is NOT visible (backgrounded/closed), Web Push delivers the
    // system notification — so don't also raise one here, or it shows twice.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    // Only suppress if the user is already looking at the exact room this message came from
    if (options.room && options.room === window.currentRoom && document.visibilityState === 'visible') return;

    const opts = {
        body,
        icon:     '/icons/notif.png',
        badge:    '/icons/notif.png',
        tag:      options.tag || 'taskflow-msg',
        renotify: true,
        silent:   false,
        ...options
    };

    // Mobile (Android/Chrome) forbids `new Notification()` — it throws
    // "Illegal constructor". Use the service worker registration there.
    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && typeof reg.showNotification === 'function') {
                await reg.showNotification(title, opts);
                return;
            }
        }
    } catch (e) { /* fall through to desktop Notification */ }

    // Desktop fallback — direct Notification with click-to-open.
    try {
        const n = new Notification(title, opts);
        n.onclick = () => {
            window.focus();
            n.close();
            if (options.room && typeof window.setMobileView === 'function') {
                window.currentRoom = options.room;
                window.loadMessages?.();
                window.setMobileView('chat');
            }
        };
        setTimeout(() => n.close(), 8000);
    } catch (e) { /* environment blocks direct Notification — non-fatal */ }
};

// ── MAIN NOTIFICATION TRIGGER ─────────────────────────────────
// Called whenever a new message arrives via Supabase Realtime
window.triggerMessageNotification = function(msg) {
    // Skip own messages
    if (msg.sender_id === window.currentUser?.id) return;
    // Do Not Disturb — no chime, no vibration, no notification.
    if (window._isDND?.()) return;

    // Find sender name from cache
    const sender = window.globalUsersCache?.find(u => u.id === msg.sender_id);
    const name   = sender?.full_name || sender?.email?.split('@')[0] || 'Someone';
    const room   = msg.room_id || window.currentRoom || 'General';
    const text   = _stripHtml(msg.text || '📎 File shared');
    const preview= text.length > 80 ? text.substring(0, 80) + '\u2026' : text;

    // 1. Play chime sound (respects the sound setting)
    if (!window._isSoundOff?.()) _makeChime(0.35);

    // 2. Vibrate (mobile)
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);

    // 3. System notification (wakes screen if off) — friendly title (no raw room id).
    const isDM = String(room).startsWith('dm_');
    const roomLabel = window.getRoomDisplayName?.(room) || (isDM ? '' : room);
    const title = isDM ? name : (name + (roomLabel ? ' · ' + roomLabel : ''));
    window.showSystemNotification(
        title,
        preview,
        { tag: 'msg-' + msg.room_id, room: msg.room_id }
    );
};

// ── TASK NOTIFICATION ─────────────────────────────────────────
window.triggerTaskNotification = function(taskTitle, fromName) {
    _makeChime(0.45);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    window.showSystemNotification(
        '📋 New Task Assigned',
        `${fromName || 'Principal'}: ${taskTitle}`,
        { tag: 'task-notification' }
    );
};

// ── AUTO-INIT ON LOAD ─────────────────────────────────────────
// Request permission after user logs in (called by auth.js)
window.initNotifications = async function() {
    const granted = await window.requestNotificationPermission();
    if (granted) {
        // Register this device for background push (when the app is closed).
        window.subscribeToPush?.();
    }
    return granted;
};

// ── HELPER ───────────────────────────────────────────────────
function _stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&')
               .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}
