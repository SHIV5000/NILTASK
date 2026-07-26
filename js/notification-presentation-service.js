(function () {
    'use strict';

    const VERSION = 'v1';
    const DEFAULT_TTL_MS = 10000;
    const recent = new Map();
    let installTimer = null;

    function prune(now) {
        if (recent.size <= 250) return;
        for (const [key, expiresAt] of recent) {
            if (expiresAt <= now) recent.delete(key);
        }
        while (recent.size > 250) recent.delete(recent.keys().next().value);
    }

    function claim(key, ttlMs = DEFAULT_TTL_MS) {
        if (!key) return true;
        const now = Date.now();
        const expiresAt = recent.get(key) || 0;
        if (expiresAt > now) return false;
        recent.set(key, now + ttlMs);
        prune(now);
        return true;
    }

    function messageKey(msg) {
        if (msg?.id) return 'message:' + msg.id;
        return [
            'message',
            msg?.room_id || '',
            msg?.sender_id || '',
            msg?.created_at || '',
            String(msg?.text || '').slice(0, 80)
        ].join(':');
    }

    function strip(value) {
        if (typeof window.stripHtml === 'function') return window.stripHtml(String(value || ''));
        const node = document.createElement('div');
        node.innerHTML = String(value || '');
        return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function install() {
        const original = window.triggerMessageNotification;
        if (typeof original !== 'function') return false;
        if (original.__nfaPresentationService === true) return true;

        const replacement = function (msg) {
            if (!msg || msg.sender_id === window.currentUser?.id) return;
            if (window._isDND?.()) return;
            if (!claim(messageKey(msg))) return;

            const sender = window.globalUsersCache?.find(user => user.id === msg.sender_id);
            const name = sender?.full_name || sender?.email?.split('@')[0] || 'Someone';
            const room = msg.room_id || window.currentRoom || 'General';
            const text = strip(msg.text || '📎 File shared');
            const preview = text.length > 80 ? text.substring(0, 80) + '…' : text;

            // One sound authority. main.js and notification-row callbacks may also
            // request this sound, but playSound() already coalesces the same type.
            window.playSound?.('message');

            try {
                if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
            } catch (e) {}

            const isDM = String(room).startsWith('dm_');
            const roomLabel = window.getRoomDisplayName?.(room) || (isDM ? '' : room);
            const title = isDM ? name : (name + (roomLabel ? ' · ' + roomLabel : ''));
            window.showSystemNotification?.(
                title,
                preview,
                { tag: 'msg-' + (msg.id || msg.room_id || 'event'), room: msg.room_id }
            );
        };

        replacement.__nfaPresentationService = true;
        replacement.__nfaOriginal = original;
        window.triggerMessageNotification = replacement;
        window.NILTASK_shouldPresentEvent = claim;
        window.NILTASK_NOTIFICATION_PRESENTATION_VERSION = VERSION;
        return true;
    }

    function boot() {
        if (install()) return;
        let attempts = 0;
        installTimer = setInterval(() => {
            attempts += 1;
            if (install() || attempts >= 300) clearInterval(installTimer);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();