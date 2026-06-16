/**
 * notifications.js — TaskFlow Push & In-App Notifications  VER 1.0
 * ─────────────────────────────────────────────────────────────
 * Handles:
 *   1. Notification permission request (on login)
 *   2. System notification when message received (wakes screen)
 *   3. Notification sound (in-app + background via SW)
 *   4. Vibration pattern on mobile
 * ─────────────────────────────────────────────────────────────
 */

// ── NOTIFICATION SOUND ─────────────────────────────────────────
// Generates a gentle chime via Web Audio API — no file needed
function _makeChime(vol = 0.4) {
    try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
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
        // Silent fail — AudioContext blocked before user interaction
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
    const preview= text.length > 80 ? text.substring(0, 80) + '…' : text;

    // 1. Play chime sound
    _makeChime(0.35);

    // 2. Vibrate (mobile)
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);

    // 3. System notification (wakes screen if off)
    window.showSystemNotification(
        `${name} — ${room.charAt(0).toUpperCase() + room.slice(1)}`,
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
