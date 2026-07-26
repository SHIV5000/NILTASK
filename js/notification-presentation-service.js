(function () {
    'use strict';

    const VERSION = 'v3';
    const DEFAULT_TTL_MS = 10000;
    const NOTIFICATION_TOAST_TTL_MS = 5000;
    const NOTIFICATION_ICON_RE = /fa-(?:stopwatch|clipboard-check|comment|reply|heart|clock|bell)\b/;
    const recent = new Map();
    const STATE = {
        installTimer: null,
        messageInstalled: false,
        toastInstalled: false,
        soundInstalled: false,
        suppressedSoundCount: 0,
        suppressSoundUntil: 0
    };

    const TOAST_CONFIG = {
        reminder:  { icon:'fa-solid fa-stopwatch',       color:'text-purple-400', sound:'reminder' },
        task:      { icon:'fa-solid fa-clipboard-check', color:'text-blue-400',   sound:'task' },
        message:   { icon:'fa-solid fa-comment',         color:'text-green-400',  sound:'message' },
        reply:     { icon:'fa-solid fa-reply',           color:'text-indigo-400', sound:'message' },
        reaction:  { icon:'fa-solid fa-heart',           color:'text-pink-400',   sound:'message' },
        scheduled: { icon:'fa-solid fa-clock',           color:'text-yellow-400', sound:'message' },
        general:   { icon:'fa-solid fa-bell',            color:'text-yellow-400', sound:'task' }
    };

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

    function notificationKey(notification) {
        if (notification?.id) return 'notification:' + notification.id;
        return [
            'notification',
            notification?.type || 'general',
            notification?.user_id || '',
            notification?.created_at || '',
            String(notification?.message || '').slice(0, 120)
        ].join(':');
    }

    function strip(value) {
        if (typeof window.stripHtml === 'function') return window.stripHtml(String(value || ''));
        const node = document.createElement('div');
        node.innerHTML = String(value || '');
        return (node.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function toastKey(message, icon, color) {
        return [
            'notification-toast',
            String(icon || '').trim(),
            String(color || '').trim(),
            strip(message).slice(0, 160)
        ].join(':');
    }

    function isNotificationToast(icon) {
        return NOTIFICATION_ICON_RE.test(String(icon || ''));
    }

    function installSoundBoundary() {
        const original = window.playSound;
        if (typeof original !== 'function') return false;
        if (original.__nfaNotificationSoundBoundary === true) {
            STATE.soundInstalled = true;
            return true;
        }

        const wrapped = function (...args) {
            const now = Date.now();
            if (STATE.suppressedSoundCount > 0 && now <= STATE.suppressSoundUntil) {
                STATE.suppressedSoundCount -= 1;
                return;
            }
            if (now > STATE.suppressSoundUntil) STATE.suppressedSoundCount = 0;
            return original.apply(this, args);
        };
        wrapped.__nfaNotificationSoundBoundary = true;
        wrapped.__nfaOriginal = original;
        window.playSound = wrapped;
        STATE.soundInstalled = true;
        return true;
    }

    function installToastBoundary() {
        const original = window.showCenterToast;
        if (typeof original !== 'function') return false;
        if (original.__nfaNotificationToastBoundary === true) {
            STATE.toastInstalled = true;
            return true;
        }

        const wrapped = function (message, icon, color, ...rest) {
            if (isNotificationToast(icon)) {
                const allowed = claim(toastKey(message, icon, color), NOTIFICATION_TOAST_TTL_MS);
                if (!allowed) {
                    // The legacy notification callback calls playSound immediately after
                    // showCenterToast. Suppress exactly that paired duplicate sound without
                    // muting later, distinct events of the same category.
                    STATE.suppressedSoundCount += 1;
                    STATE.suppressSoundUntil = Date.now() + 250;
                    return;
                }
            }
            return original.call(this, message, icon, color, ...rest);
        };
        wrapped.__nfaNotificationToastBoundary = true;
        wrapped.__nfaOriginal = original;
        window.showCenterToast = wrapped;
        STATE.toastInstalled = true;
        return true;
    }

    function installMessageBoundary() {
        const original = window.triggerMessageNotification;
        if (typeof original !== 'function') return false;
        if (original.__nfaPresentationService === true) {
            STATE.messageInstalled = true;
            return true;
        }

        const replacement = function (msg) {
            if (!msg || msg.sender_id === window.currentUser?.id) return;
            if (window._isDND?.()) return;
            if (!claim(messageKey(msg))) return;

            const sender = window.globalUsersCache?.find(user => user.id === msg.sender_id);
            const name = sender?.full_name || sender?.email?.split('@')[0] || 'Someone';
            const room = msg.room_id || window.currentRoom || 'General';
            const text = strip(msg.text || '📎 File shared');
            const preview = text.length > 80 ? text.substring(0, 80) + '…' : text;

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
                { tag: 'msg-' + (msg.room_id || 'event'), room: msg.room_id }
            );
        };

        replacement.__nfaPresentationService = true;
        replacement.__nfaOriginal = original;
        window.triggerMessageNotification = replacement;
        STATE.messageInstalled = true;
        return true;
    }

    function presentNotificationRow(notification) {
        if (!notification || !claim(notificationKey(notification))) return false;
        const type = notification.type || 'general';
        const cfg = TOAST_CONFIG[type] || TOAST_CONFIG.general;
        const message = strip(notification.message || '').substring(0, 100);

        window.prependFeedItem?.(notification);
        window.showCenterToast?.(message, cfg.icon, cfg.color);
        window.playSound?.(cfg.sound);
        window.refreshNotificationBadge?.();
        window.animateBell?.();
        if (window._activityFeedOpen) window.refreshActivityFeed?.();
        return true;
    }

    function install() {
        installSoundBoundary();
        installToastBoundary();
        installMessageBoundary();

        window.NILTASK_shouldPresentEvent = claim;
        window.NILTASK_presentNotificationRow = presentNotificationRow;
        window.NILTASK_NOTIFICATION_PRESENTATION_VERSION = VERSION;

        return STATE.messageInstalled && STATE.toastInstalled && STATE.soundInstalled;
    }

    function boot() {
        if (install()) return;
        let attempts = 0;
        STATE.installTimer = setInterval(() => {
            attempts += 1;
            if (install() || attempts >= 300) clearInterval(STATE.installTimer);
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();