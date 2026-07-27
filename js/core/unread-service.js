(function () {
    'use strict';

    if (window.NILTASK_UnreadService) return;

    const VERSION = 'v4';
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
        mobileHandoff: false,
        mobileAdaptersInstalled: false,
        mobileEventConsumedAt: null,
        mobileRefreshCount: 0,
        mobileCoalescedCalls: 0,
        mobileRoomObservations: 0,
        mobileAttentionObservations: 0,
        mobileLastReason: null,
    };
    const QUERY = {
        computeRoomUnread: null,
        unreadCount: null,
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

    function captureQueries() {
        const compute = window.NFA_computeRoomUnread;
        const attention = window.NFA_unreadCount;
        if (!QUERY.computeRoomUnread && typeof compute === 'function' && !compute.__nfaUnreadServiceMobileAdapter) {
            QUERY.computeRoomUnread = compute;
        }
        if (!QUERY.unreadCount && typeof attention === 'function' && !attention.__nfaUnreadServiceMobileAdapter) {
            QUERY.unreadCount = attention;
        }
        return Boolean(QUERY.computeRoomUnread && QUERY.unreadCount);
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
        passiveMobile: isMobileRuntime() && !STATE.mobileHandoff,
        mobileHandoff: STATE.mobileHandoff,
        mobileHandoffInstalled: STATE.mobileAdaptersInstalled,
        mobileAdaptersInstalled: STATE.mobileAdaptersInstalled,
        mobileRenderPassive: isMobileRuntime(),
        mobileEventConsumedAt: STATE.mobileEventConsumedAt,
        mobileRefreshCount: STATE.mobileRefreshCount,
        mobileCoalescedCalls: STATE.mobileCoalescedCalls,
        mobileRoomObservations: STATE.mobileRoomObservations,
        mobileAttentionObservations: STATE.mobileAttentionObservations,
        mobileLastReason: STATE.mobileLastReason,
        mobileUsesExistingQueries: false,
        mobileUsesSharedRefresh: STATE.mobileHandoff,
        mobileOwnPoll: false,
        mobileOwnsPolling: false,
        mobileOwnsRendering: false,
        mobileOwnsAppBadge: false,
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
        // Mobile keeps its existing OS-badge renderer during this handoff. The shared
        // service owns the query result only, so there is still exactly one writer.
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
            if (STATE.mobileHandoff) STATE.mobileCoalescedCalls += 1;
            else STATE.pending = true;
            return STATE.inFlight;
        }
        const sb = window.sb;
        const current = identity();
        if (!sb || !current.userId || !current.tenantId || !captureQueries()) return snapshot();

        STATE.inFlight = (async () => {
            const [rooms, attention] = await Promise.all([
                QUERY.computeRoomUnread(sb, { uid:current.userId, tid:current.tenantId, window:500 }),
                QUERY.unreadCount(sb, current.userId),
            ]);
            const latest = identity();
            if (latest.userId !== current.userId || latest.tenantId !== current.tenantId) return snapshot();
            STATE.userId = current.userId;
            STATE.tenantId = current.tenantId;
            STATE.perRoom = normalize(rooms?.perRoom);
            STATE.attention = clean(attention);
            STATE.refreshedAt = new Date().toISOString();
            if (STATE.mobileHandoff) STATE.mobileRefreshCount += 1;
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

    async function mobileComputeAdapter() {
        STATE.mobileRoomObservations += 1;
        STATE.mobileLastReason = 'mobile-room-adapter';
        const result = await refresh(STATE.mobileLastReason);
        return { perRoom:{ ...result.perRoom }, total:result.roomTotal };
    }

    async function mobileAttentionAdapter() {
        STATE.mobileAttentionObservations += 1;
        STATE.mobileLastReason = 'mobile-attention-adapter';
        const result = await refresh(STATE.mobileLastReason);
        return result.attention;
    }

    mobileComputeAdapter.__nfaUnreadServiceMobileAdapter = true;
    mobileAttentionAdapter.__nfaUnreadServiceMobileAdapter = true;

    function consumeMobileUpdate(event) {
        if (!STATE.mobileHandoff || !event?.detail) return;
        STATE.mobileEventConsumedAt = new Date().toISOString();
        // The module-local mobile renderer receives the same snapshot through the two
        // compatibility adapters. Keep a public read-only copy for diagnostics and
        // future direct rendering without writing window.unreadCounts prematurely.
        window.NILTASK_MobileUnreadState = Object.freeze({ ...event.detail, perRoom:{ ...(event.detail.perRoom || {}) } });
    }

    function activateMobileHandoff() {
        if (!isMobileRuntime() || STATE.disposed || !captureQueries()) return false;
        if (!STATE.mobileAdaptersInstalled) {
            window.NFA_computeRoomUnread = mobileComputeAdapter;
            window.NFA_unreadCount = mobileAttentionAdapter;
            STATE.mobileAdaptersInstalled = true;
        }
        STATE.mobileHandoff = true;
        STATE.mobileLastReason = 'mobile-handoff-ready';
        try {
            window.dispatchEvent(new CustomEvent('niltask:mobile-unread-handoff-ready', {
                detail: { version:VERSION, pollingOwner:'mobile-fallback', renderingOwner:'mobile.js' }
            }));
        } catch (e) {}
        return true;
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
        window.addEventListener('niltask:unread-updated', consumeMobileUpdate);
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
            // Query ownership transfers to UnreadService, but cadence, DOM rendering,
            // open-room zeroing, live provisional increments and OS badge writes stay
            // in mobile.js. Therefore no automatic query or second poll is introduced.
            return activateMobileHandoff() && document.readyState === 'complete';
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
        if (STATE.mobileAdaptersInstalled) {
            if (QUERY.computeRoomUnread) window.NFA_computeRoomUnread = QUERY.computeRoomUnread;
            if (QUERY.unreadCount) window.NFA_unreadCount = QUERY.unreadCount;
        }
        STATE.mobileAdaptersInstalled = false;
        STATE.mobileHandoff = false;
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
        activateMobileHandoff,
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
