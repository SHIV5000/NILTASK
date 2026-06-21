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

// ── SHARED AUDIO CONTEXT — unlocked once on first user gesture ────
let _sharedCtx = null;
function _unlockSharedAudio() {
    if (_sharedCtx) return;
    try {
        _sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_sharedCtx.state === 'suspended') _sharedCtx.resume();
    } catch(e) { /* Web Audio unsupported */ }
    // Separately, main.js's playSound() plays real MP3 files via plain
    // <audio> elements (new Audio(url).play()) — a totally different browser
    // autoplay gate from the Web Audio API context above. It was never
    // unlocked, so every playSound() call triggered from a realtime
    // callback (not a direct tap) was silently rejected by the browser —
    // this is the actual reason message/reminder/task/scheduled sounds were
    // missing, separate from the chime fix. A muted, near-silent play+pause
    // during this same first gesture satisfies the browser's "user has
    // engaged with media" requirement for the rest of the page session.
    try {
        const warm = new Audio();
        warm.muted = true;
        warm.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA//8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA';
        warm.play().catch(()=>{}).finally(() => { warm.pause(); });
    } catch(e) {}
}
document.addEventListener('touchstart', _unlockSharedAudio, { once:true, passive:true });
document.addEventListener('click', _unlockSharedAudio, { once:true });
document.addEventListener('keydown', _unlockSharedAudio, { once:true });

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
window.showSystemNotification = function(title, body, options = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // don't disturb when app is open

    const n = new Notification(title, {
        body,
        icon:    '/favicon.svg',
        badge:   '/favicon.svg',
        tag:     options.tag || 'taskflow-msg',
        renotify: true,
        vibrate: [200, 100, 200],
        silent:  false,
        ...options
    });

    n.onclick = () => {
        window.focus();
        n.close();
        // Switch to the relevant chat if we know the room
        if (options.room && typeof window.setMobileView === 'function') {
            window.currentRoom = options.room;
            window.loadMessages?.();
            window.setMobileView('chat');
        }
    };

    // Auto-close after 8 seconds
    setTimeout(() => n.close(), 8000);
};

// ── MAIN NOTIFICATION TRIGGER ─────────────────────────────────
// Called whenever a new message arrives via Supabase Realtime
window.triggerMessageNotification = function(msg) {
    // Skip own messages
    if (msg.sender_id === window.currentUser?.id) return;

    // Find sender name from cache
    const sender = window.globalUsersCache?.find(u => u.id === msg.sender_id);
    const name   = sender?.full_name || sender?.email?.split('@')[0] || 'Someone';
    const room   = msg.room_id || window.currentRoom || 'General';
    const text   = _stripHtml(msg.text || '📎 File shared');
    const preview= text.length > 80 ? text.substring(0, 80) + '\u2026' : text;

    // 1. Play chime sound
    _makeChime(0.35);

    // 2. Vibrate (mobile)
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);

    // 3. System notification (wakes screen if off)
    window.showSystemNotification(
        name + ' — ' + room.charAt(0).toUpperCase() + room.slice(1),
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
    if (!granted) {
        console.log('[Notifications] Permission not granted — system notifications disabled');
    }
    return granted;
};

// ── HELPER ───────────────────────────────────────────────────
function _stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&')
               .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}
