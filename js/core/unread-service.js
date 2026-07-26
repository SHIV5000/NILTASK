(function () {
    'use strict';

    if (window.NILTASK_UnreadService) return;

    const VERSION = 'v1';
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
        installed: false,
        disposed: false,
    };

    function client() {
        return window.sb || null;
    }

    function identity() {
        return {
            userId: window.currentUser?.id || null,
            tenantId: window.currentTenantId || null,
        };
    }

    function cleanCount(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }

    function normalizePerRoom(value) {
        const result = {};
        Object.entries(value || {}).forEach(([room, count]) => {
            const safe = cleanCount(count);
            if (room && safe > 0) result[room] = safe;
        });
        return result;
    }

    function sumPerRoom(value) {
        return Object.values(value || {}).reduce((sum, count) => sum + cleanCount(count), 0);
    }

    function samePerRoom(left, right) {
        const a = Object.keys(left || {}).sort();
        const b = Object.keys(right || {}).sort();
        if (a.length !== b.length) return false;
        return a.every((key, index) => key === b[index] && cleanCount(left[key]) === cleanCount(right[key]));
    }

    function installStyles() {
        if (document.getElementById('niltask-unread-service-style')) return;
        const style = document.createElement('style');
        style.id = 'niltask-unread-service-style';
        style.textContent = `
            html.nfa-unread-owned .channel-item > .relative > span:not(.presence-dot):not(.nfa-room-unread-line):not(.nfa-room-unread-badge) {
                display:none !important;
            }
            .nfa-room-unread-line {
                position:absolute;
                left:0;
                right:0;
                bottom:-2px;
                height:2px;
                border-radius:999px;
                background:#22c55e;
                pointer-events:none;
            }
            .nfa-room-unread-badge {
                position:absolute;
                top:-4px;
                right:-4px;
                width:17px;
                height:17px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:50%;
                background:#22c55e;
                color:#fff;
                font-size:9px;
                line-height:1;
                font-weight:800;
                pointer-events:none;
                box-shadow:0 1px 4px rgba(0,0,0,.18);
                z-index:4;
            }
        `;
        document.head.appendChild(style);
        document.documentElement.classList.add('nfa-unread-owned');
    }

    function renderBell(total) {
        const safeTotal = cleanCount(total);
        window._bellCount = safeTotal;

        const bellButton = document.querySelector('.topbar-icon-btn [class*="ti-bell"]')?.closest('.topbar-icon-btn');
        if (!bellButton) return;

        let host = bellButton.querySelector('.bell-host');
        if (!host) {
            const icon = bellButton.querySelector('[class*="ti-bell"]');
            if (!icon) return;
            host = document.createElement('span');
            host.className = 'bell-host';
            icon.parentNode.insertBefore(host, icon);
            host.appendChild(icon);
        }

        host.querySelector('.notif-badge')?.remove();
        if (safeTotal > 0) {
            const badge = document.createElement('span');
            badge.className = 'notif-badge';
            badge.textContent = safeTotal > 99 ? '99+' : String(safeTotal);
            badge.setAttribute('aria-label', safeTotal + ' unread items');
            host.appendChild(badge);
        }
    }

    async function renderAppBadge(total) {
        if (window.IS_NATIVE) return;
        try {
            if (cleanCount(total) > 0 && typeof navigator.setAppBadge === 'function') {
                await navigator.setAppBadge(cleanCount(total));
            } else if (typeof navigator.clearAppBadge === 'function') {
                await navigator.clearAppBadge();
            }
        } catch (e) {}
    }

    function renderRoomBadges() {
        const list = document.getElementById('chatsList');
        if (!list) return;

        list.querySelectorAll('.channel-item[data-room]').forEach(row => {
            const room = row.dataset.room || '';
            const count = cleanCount(STATE.perRoom[room]);
            const avatarHost = row.querySelector(':scope > .relative');
            if (!avatarHost) return;

            avatarHost.querySelector('.nfa-room-unread-line')?.remove();
            avatarHost.querySelector('.nfa-room-unread-badge')?.remove();
            if (!count) return;

            const line = document.createElement('span');
            line.className = 'nfa-room-unread-line';
            line.setAttribute('aria-hidden', 'true');

            const badge = document.createElement('span');
            badge.className = 'nfa-room-unread-badge';
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.setAttribute('aria-label', count + ' unread messages');

            avatarHost.appendChild(line);
            avatarHost.appendChild(badge);
        });
    }

    function scheduleRoomRender() {
        clearTimeout(STATE.sidebarRenderTimer);
        STATE.sidebarRenderTimer = setTimeout(renderRoomBadges, 0);
    }

    function ensureSidebarObserver() {
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

    function publicState() {
        return {
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
            installed: STATE.installed,
        };
    }

    function publish(reason) {
        STATE.roomTotal = sumPerRoom(STATE.perRoom);
        STATE.total = STATE.roomTotal + cleanCount(STATE.attention);
        window.unreadCounts = { ...STATE.perRoom };
        renderBell(STATE.total);
        renderAppBadge(STATE.total);
        ensureSidebarObserver();
        scheduleRoomRender();

        try {
            window.dispatchEvent(new CustomEvent('niltask:unread-updated', {
                detail: { ...publicState(), reason: reason || 'update' }
            }));
        } catch (e) {}
        return publicState();
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
        window.unreadCounts = {};
        renderBell(0);
        renderAppBadge(0);
        scheduleRoomRender();
        return publish(reason || 'reset');
    }

    async function refresh(reason) {
        if (STATE.disposed) return publicState();
        if (STATE.inFlight) {
            STATE.pending = true;
            return STATE.inFlight;
        }

        const sb = client();
        const current = identity();
        if (!sb || !current.userId || !current.tenantId ||
            typeof window.NFA_computeRoomUnread !== 'function' ||
            typeof window.NFA_unreadCount !== 'function') {
            return publicState();
        }

        STATE.inFlight = (async () => {
            const [rooms, attention] = await Promise.all([
                window.NFA_computeRoomUnread(sb, {
                    uid: current.userId,
                    tid: current.tenantId,
                    window: 500,
                }),
                window.NFA_unreadCount(sb, current.userId),
            ]);

            const latest = identity();
            if (latest.userId !== current.userId || latest.tenantId !== current.tenantId) {
                return publicState();
            }

            STATE.userId = current.userId;
            STATE.tenantId = current.tenantId;
            STATE.perRoom = normalizePerRoom(rooms?.perRoom || {});
            STATE.attention = cleanCount(attention);
            STATE.refreshedAt = new Date().toISOString();
            return publish(reason || 'refresh');
        })().catch(error => {
            try { window.logger?.logError?.(error, { feature:'unread-service', reason }); } catch (e) {}
            return publicState();
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
        const next = normalizePerRoom(window.unreadCounts || {});
        if (!samePerRoom(next, STATE.perRoom)) STATE.perRoom = next;
        return publish(reason || 'adopt-window');
    }

    function markRoomRead(roomId, reason) {
        if (!roomId) return publicState();
        if (STATE.perRoom[roomId]) {
            const next = { ...STATE.perRoom };
            delete next[roomId];
            STATE.perRoom = next;
        }
        publish(reason || 'room-opened');
        refreshSoon('room-read-reconcile', 1200);
        return publicState();
    }

    function installCompatibility() {
        if (STATE.installed) return true;
        installStyles();

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

        document.addEventListener('click', event => {
            const row = event.target?.closest?.('.channel-item[data-room]');
            if (row?.dataset?.room) markRoomRead(row.dataset.room, 'desktop-room-click');
        }, true);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') refreshSoon('visibility', 150);
        });
        window.addEventListener('online', () => refreshSoon('online', 150));
        window.addEventListener('niltask:subscriptions-started', () => refreshSoon('subscriptions-started', 300));
        window.addEventListener('niltask:session-cleaned', () => reset('session-cleaned'));

        STATE.installed = true;
        window.NILTASK_UNREAD_SERVICE_VERSION = VERSION;
        return true;
    }

    function boot() {
        installCompatibility();
        ensureSidebarObserver();
        const current = identity();
        if (current.userId && current.tenantId && client()) {
            refreshSoon('boot', 100);
            return true;
        }
        return false;
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
        snapshot: publicState,
        dispose,
    });

    boot();
    let attempts = 0;
    STATE.installTimer = setInterval(() => {
        attempts += 1;
        ensureSidebarObserver();
        const ready = boot();
        if (ready || attempts >= 300) {
            clearInterval(STATE.installTimer);
            STATE.installTimer = null;
        }
    }, 100);
})();