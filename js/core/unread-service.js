(function () {
    'use strict';

    if (window.NILTASK_UnreadService) return;

    const VERSION = 'v3';
    const STATE = {
        perRoom: {},
        roomTotal: 0,
        attention: 0,
        total: 0,
        userId: null,
        tenantId: null,
        refreshedAt: null,
        inFlight: null,
        pending: false,
        refreshTimer: null,
        installTimer: null,
        sidebarObserver: null,
        sidebarTarget: null,
        sidebarRenderTimer: null,
        listenersInstalled: false,
        disposed: false,
    };

    const clean = value => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    };
    const normalize = value => {
        const out = {};
        Object.entries(value || {}).forEach(([room, count]) => {
            const n = clean(count);
            if (room && n) out[room] = n;
        });
        return out;
    };
    const sumRooms = value => Object.values(value || {}).reduce((sum, count) => sum + clean(count), 0);
    const identity = () => ({
        userId: window.currentUser?.id || null,
        tenantId: window.currentTenantId || null,
    });

    function isMobileRuntime() {
        try {
            if (typeof window.isMobileView === 'function') return Boolean(window.isMobileView());
        } catch (e) {}
        return Boolean(document.getElementById('mobileApp')) || Boolean(window.__mobThemeLock) || window.innerWidth <= 768;
    }

    const snapshot = () => ({
        version: VERSION,
        userId: STATE.userId,
        tenantId: STATE.tenantId,
        perRoom: { ...STATE.perRoom },
        roomTotal: STATE.roomTotal,
        attention: STATE.attention,
        total: STATE.total,
        refreshedAt: STATE.refreshedAt,
        inFlight: Boolean(STATE.inFlight),
        pending: STATE.pending,
        installed: STATE.listenersInstalled,
        passiveMobile: isMobileRuntime(),
    });

    function installStyles() {
        if (isMobileRuntime() || document.getElementById('niltask-unread-service-style')) return;
        const style = document.createElement('style');
        style.id = 'niltask-unread-service-style';
        style.textContent = `
            html.nfa-unread-owned .channel-item > .relative > span:not(.presence-dot):not(.nfa-room-unread-line):not(.nfa-room-unread-badge) { display:none !important; }
            .nfa-room-unread-line { position:absolute;left:0;right:0;bottom:-2px;height:2px;border-radius:999px;background:#22c55e;pointer-events:none; }
            .nfa-room-unread-badge { position:absolute;top:-4px;right:-4px;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#22c55e;color:#fff;font-size:9px;line-height:1;font-weight:800;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.18);z-index:4; }
        `;
        document.head.appendChild(style);
        document.documentElement.classList.add('nfa-unread-owned');
    }

    function renderBell(total) {
        if (isMobileRuntime()) return;
        const count = clean(total);
        window._bellCount = count;
        const button = document.querySelector('.topbar-icon-btn [class*="ti-bell"]')?.closest('.topbar-icon-btn');
        if (!button) return;
        let host = button.querySelector('.bell-host');
        if (!host) {
            const icon = button.querySelector('[class*="ti-bell"]');
            if (!icon) return;
            host = document.createElement('span');
            host.className = 'bell-host';
            icon.parentNode.insertBefore(host, icon);
            host.appendChild(icon);
        }
        host.querySelector('.notif-badge')?.remove();
        if (!count) return;
        const badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.setAttribute('aria-label', count + ' unread items');
        host.appendChild(badge);
    }

    async function renderAppBadge(total) {
        // Mobile currently owns its badge inside mobile.js. Stay passive until the
        // dedicated mobile handoff so two renderers never race the OS badge.
        if (isMobileRuntime() || window.IS_NATIVE) return;
        try {
            const count = clean(total);
            if (count && typeof navigator.setAppBadge === 'function') await navigator.setAppBadge(count);
            else if (typeof navigator.clearAppBadge === 'function') await navigator.clearAppBadge();
        } catch (e) {}
    }

    function renderRoomBadges() {
        if (isMobileRuntime()) return;
        const list = document.getElementById('chatsList');
        if (!list) return;
        list.querySelectorAll('.channel-item[data-room]').forEach(row => {
            const count = clean(STATE.perRoom[row.dataset.room || '']);
            const host = row.querySelector(':scope > .relative');
            if (!host) return;
            host.querySelector('.nfa-room-unread-line')?.remove();
            host.querySelector('.nfa-room-unread-badge')?.remove();
            if (!count) return;
            const line = document.createElement('span');
            line.className = 'nfa-room-unread-line';
            line.setAttribute('aria-hidden', 'true');
            const badge = document.createElement('span');
            badge.className = 'nfa-room-unread-badge';
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.setAttribute('aria-label', count + ' unread messages');
            host.append(line, badge);
        });
    }

    function scheduleRoomRender() {
        if (isMobileRuntime()) return;
        clearTimeout(STATE.sidebarRenderTimer);
        STATE.sidebarRenderTimer = setTimeout(renderRoomBadges, 0);
    }

    function ensureSidebarObserver() {
        if (isMobileRuntime()) return false;
        const target = document.getElementById('chatsList');
        if (!target) return false;
        if (STATE.sidebarTarget === target && STATE.sidebarObserver) return true;
        try { STATE.sidebarObserver?.disconnect(); } catch (e) {}
        STATE.sidebarObserver = new MutationObserver(scheduleRoomRender);
        STATE.sidebarObserver.observe(target, { childList:true });
        STATE.sidebarTarget = target;
        scheduleRoomRender();
        return true;
    }

    function publish(reason) {
        STATE.roomTotal = sumRooms(STATE.perRoom);
        STATE.total = STATE.roomTotal + clean(STATE.attention);
        if (!isMobileRuntime()) {
            window.unreadCounts = { ...STATE.perRoom };
            renderBell(STATE.total);
            renderAppBadge(STATE.total);
            ensureSidebarObserver();
            scheduleRoomRender();
        }
        try {
            window.dispatchEvent(new CustomEvent('niltask:unread-updated', {
                detail: { ...snapshot(), reason: reason || 'update' }
            }));
        } catch (e) {}
        return snapshot();
    }

    function reset(reason) {
        STATE.perRoom = {};
        STATE.roomTotal = 0;
        STATE.attention = 0;
        STATE.total = 0;
        STATE.userId = null;
        STATE.tenantId = null;
        STATE.refreshedAt = null;
        STATE.pending = false;
        return publish(reason || 'reset');
    }

    async function refresh(reason) {
        if (STATE.disposed) return snapshot();
        if (STATE.inFlight) {
            STATE.pending = true;
            return STATE.inFlight;
        }
        const sb = window.sb;
        const current = identity();
        if (!sb || !current.userId || !current.tenantId ||
            typeof window.NFA_computeRoomUnread !== 'function' ||
            typeof window.NFA_unreadCount !== 'function') return snapshot();

        STATE.inFlight = (async () => {
            const [rooms, attention] = await Promise.all([
                window.NFA_computeRoomUnread(sb, { uid:current.userId, tid:current.tenantId, window:500 }),
                window.NFA_unreadCount(sb, current.userId),
            ]);
            const latest = identity();
            if (latest.userId !== current.userId || latest.tenantId !== current.tenantId) return snapshot();
            STATE.userId = current.userId;
            STATE.tenantId = current.tenantId;
            STATE.perRoom = normalize(rooms?.perRoom);
            STATE.attention = clean(attention);
            STATE.refreshedAt = new Date().toISOString();
            return publish(reason || 'refresh');
        })().catch(error => {
            try { window.logger?.logError?.(error, { feature:'unread-service', reason }); } catch (e) {}
            return snapshot();
        }).finally(() => {
            STATE.inFlight = null;
            if (STATE.pending) {
                STATE.pending = false;
                refreshSoon('pending-refresh', 120);
            }
        });
        return STATE.inFlight;
    }

    function refreshSoon(reason, delay) {
        clearTimeout(STATE.refreshTimer);
        STATE.refreshTimer = setTimeout(() => refresh(reason || 'scheduled'), delay == null ? 250 : delay);
    }

    function adoptWindow(reason) {
        STATE.perRoom = normalize(window.unreadCounts || STATE.perRoom);
        publish(reason || 'adopt-window');
        return snapshot();
    }

    function markRoomRead(roomId, reason) {
        if (!roomId) return snapshot();
        const next = { ...STATE.perRoom };
        delete next[roomId];
        STATE.perRoom = next;
        publish(reason || 'room-opened');
        refreshSoon('room-read-reconcile', 1200);
        return snapshot();
    }

    function ownCompatibilityFunctions() {
        if (isMobileRuntime()) return;
        window._setBellBadge = function () {
            refreshSoon('legacy-set-badge', 80);
            return STATE.total;
        };
        window._setBellBadge.__nfaUnreadService = true;

        window._incrementBellBadge = function () {
            adoptWindow('legacy-increment');
            refreshSoon('legacy-increment-reconcile', 500);
            return STATE.total;
        };
        window._incrementBellBadge.__nfaUnreadService = true;

        window._clearBellBadge = function () {
            STATE.attention = 0;
            publish('clear-attention');
            refreshSoon('clear-attention-reconcile', 700);
            return STATE.total;
        };
        window._clearBellBadge.__nfaUnreadService = true;

        window.refreshNotificationBadge = function () {
            return refresh('legacy-refresh');
        };
        window.refreshNotificationBadge.__nfaUnreadService = true;
    }

    function installListenersOnce() {
        if (STATE.listenersInstalled) return;
        window.addEventListener('niltask:session-cleaned', () => reset('session-cleaned'));
        if (!isMobileRuntime()) {
            installStyles();
            document.addEventListener('click', event => {
                const row = event.target?.closest?.('.channel-item[data-room]');
                if (row?.dataset?.room) markRoomRead(row.dataset.room, 'desktop-room-click');
            }, true);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') refreshSoon('visibility', 150);
            });
            window.addEventListener('online', () => refreshSoon('online', 150));
            window.addEventListener('niltask:subscriptions-started', () => refreshSoon('subscriptions-started', 300));
        }
        STATE.listenersInstalled = true;
        window.NILTASK_UNREAD_SERVICE_VERSION = VERSION;
    }

    function boot() {
        if (STATE.disposed) return true;
        installListenersOnce();
        if (isMobileRuntime()) {
            // No automatic query, compatibility override, DOM observer or OS badge
            // on mobile until mobile.js is migrated to consume this service directly.
            return document.readyState === 'complete';
        }
        ownCompatibilityFunctions();
        ensureSidebarObserver();
        const current = identity();
        if (current.userId && current.tenantId && window.sb) refreshSoon('boot', 100);
        return document.readyState === 'complete' &&
            window._setBellBadge?.__nfaUnreadService === true &&
            window.refreshNotificationBadge?.__nfaUnreadService === true;
    }

    function dispose() {
        STATE.disposed = true;
        clearTimeout(STATE.refreshTimer);
        clearTimeout(STATE.sidebarRenderTimer);
        clearInterval(STATE.installTimer);
        try { STATE.sidebarObserver?.disconnect(); } catch (e) {}
        STATE.sidebarObserver = null;
        STATE.sidebarTarget = null;
    }

    window.NILTASK_UnreadService = Object.freeze({
        version: VERSION,
        refresh,
        refreshSoon,
        markRoomRead,
        adoptWindow,
        reset,
        render: () => publish('manual-render'),
        snapshot,
        dispose,
    });

    boot();
    let attempts = 0;
    STATE.installTimer = setInterval(() => {
        attempts += 1;
        const ready = boot();
        if (ready || attempts >= 300) {
            clearInterval(STATE.installTimer);
            STATE.installTimer = null;
        }
    }, 100);
})();