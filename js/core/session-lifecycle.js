(function () {
    'use strict';

    if (window.NILTASK_SessionLifecycle) return;

    const VERSION = 'v4';
    const STATE = {
        cleanupPromise: null,
        installTimer: null,
        authSubscription: null,
        logoutInstalled: false,
        tenantLoaderInstalled: false,
        identity: {
            userId: window.currentUser?.id || null,
            tenantId: window.currentTenantId || null
        },
        reloadingForIdentityChange: false
    };

    const GLOBAL_TIMERS = [
        '_afPollTimer',
        '_webHeartbeat',
        '_presenceTimer',
        '_webTypingTimer'
    ];

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function withTimeout(operation, timeoutMs = 1500) {
        try {
            await Promise.race([
                Promise.resolve(operation),
                delay(timeoutMs)
            ]);
        } catch (e) {}
    }

    function clearGlobalTimer(name) {
        const value = window[name];
        if (value === null || value === undefined) return false;
        try { clearInterval(value); } catch (e) {}
        try { clearTimeout(value); } catch (e) {}
        try { window[name] = null; } catch (e) {}
        return true;
    }

    function closeActivityRuntime() {
        try { window.closeActivityFeed?.(); } catch (e) {}
        GLOBAL_TIMERS.forEach(clearGlobalTimer);
        try { window._activityFeedOpen = false; } catch (e) {}
        try { document.getElementById('activityFeedPanel')?.remove(); } catch (e) {}
        try { document.querySelectorAll('.nfa-af-snapshot').forEach(node => node.remove()); } catch (e) {}
    }

    async function stopMobileRuntime(reason) {
        const runtime = window.NILTASK_MobileRuntime;
        if (!runtime?.stop) return false;
        try { return await runtime.stop(reason); } catch (e) { return false; }
    }

    function requestRuntimeReload(reason) {
        if (STATE.reloadingForIdentityChange) return false;
        STATE.reloadingForIdentityChange = true;
        setTimeout(() => {
            try {
                const runtime = window.NILTASK_MobileRuntime;
                if (runtime?.snapshot?.().stopped && runtime?.start) {
                    runtime.start(reason);
                    return;
                }
            } catch (e) {}
            window.location.reload();
        }, 0);
        return true;
    }

    async function stopRealtimeRuntime() {
        const manager = window.NILTASK_RealtimeManager;
        if (manager?.destroyAll) {
            try { await manager.destroyAll(); } catch (e) {}
        } else {
            const sb = window.sb;
            try {
                if (typeof sb?.removeAllChannels === 'function') {
                    await sb.removeAllChannels();
                } else if (typeof sb?.getChannels === 'function') {
                    for (const channel of Array.from(sb.getChannels() || [])) {
                        try { await sb.removeChannel(channel); } catch (e) {
                            try { await channel.unsubscribe?.(); } catch (e2) {}
                        }
                    }
                }
            } catch (e) {}
        }

        try { window._reactionsBroadcast = null; } catch (e) {}
        try { window._sharedBroadcast = null; } catch (e) {}
    }

    async function detachPushIdentity() {
        const sb = window.sb;
        const uid = window.currentUser?.id;
        if (!sb || !uid) return;

        if (window.IS_NATIVE && window.__lastPushToken) {
            try {
                await sb.from('push_tokens')
                    .delete()
                    .eq('token', window.__lastPushToken)
                    .eq('user_id', uid);
            } catch (e) {}
            return;
        }

        try {
            if (!('serviceWorker' in navigator)) return;
            const registration = await navigator.serviceWorker.getRegistration?.();
            const subscription = await registration?.pushManager?.getSubscription?.();
            if (!subscription) return;
            try {
                await sb.from('push_subscriptions')
                    .delete()
                    .eq('endpoint', subscription.endpoint)
                    .eq('user_id', uid);
            } catch (e) {}
            try { await subscription.unsubscribe(); } catch (e) {}
        } catch (e) {}
    }

    function clearServiceWorkerAuth() {
        return new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            const timeout = setTimeout(finish, 1200);

            try {
                const request = indexedDB.open('taskflow', 1);
                request.onblocked = finish;
                request.onupgradeneeded = () => {
                    try { request.result.createObjectStore('kv'); } catch (e) {}
                };
                request.onsuccess = () => {
                    try {
                        const db = request.result;
                        const tx = db.transaction('kv', 'readwrite');
                        tx.objectStore('kv').delete('auth');
                        tx.oncomplete = () => {
                            clearTimeout(timeout);
                            try { db.close(); } catch (e) {}
                            finish();
                        };
                        tx.onerror = () => {
                            clearTimeout(timeout);
                            try { db.close(); } catch (e) {}
                            finish();
                        };
                    } catch (e) {
                        clearTimeout(timeout);
                        finish();
                    }
                };
                request.onerror = () => {
                    clearTimeout(timeout);
                    finish();
                };
            } catch (e) {
                clearTimeout(timeout);
                finish();
            }
        });
    }

    async function stopLoggerRuntime() {
        const logger = window.logger;
        if (!logger) return;
        try { await logger.flush?.(); } catch (e) {}
        try {
            if (logger._timer) clearInterval(logger._timer);
            logger._timer = null;
            logger._authToken = null;
        } catch (e) {}
    }

    function resetSessionContext() {
        try { window.currentUser = null; } catch (e) {}
        try { window.currentTenantId = null; } catch (e) {}
        try { window.currentSchoolName = null; } catch (e) {}
        try { window.currentRole = null; } catch (e) {}
        try { window.currentRoleName = null; } catch (e) {}
        try { window.currentDesignation = null; } catch (e) {}
        try { window.currentPermissions = {}; } catch (e) {}
        try { window.featureFlags = {}; } catch (e) {}
        try { window.currentSubscription = null; } catch (e) {}
        try { window.currentRoom = 'general'; } catch (e) {}
        try { window.globalUsersCache = []; } catch (e) {}
        try { window.unreadCounts = {}; } catch (e) {}
        try { window.reactionsCache = {}; } catch (e) {}
        try { window._groupsCache = []; } catch (e) {}
        try { window._roomMsgs = []; } catch (e) {}
        try { navigator.clearAppBadge?.(); } catch (e) {}
        STATE.identity = { userId: null, tenantId: null };
    }

    async function cleanup(reason = 'manual', options = {}) {
        if (STATE.cleanupPromise) return STATE.cleanupPromise;

        const settings = {
            resetContext: options.resetContext !== false,
            detachPush: options.detachPush !== false,
            clearSwAuth: options.clearSwAuth !== false,
            stopLogger: options.stopLogger !== false
        };

        STATE.cleanupPromise = (async () => {
            try {
                closeActivityRuntime();
                // Stop mobile-owned timers/listeners/observers before removing channels.
                // This blocks the mobile CLOSED callback from scheduling a reconnect
                // while logout, account change or tenant change is already underway.
                await withTimeout(stopMobileRuntime(reason), 1500);
                if (settings.detachPush) await withTimeout(detachPushIdentity(), 1500);
                await withTimeout(stopRealtimeRuntime(), 1800);
                if (settings.clearSwAuth) await withTimeout(clearServiceWorkerAuth(), 1300);
                if (settings.stopLogger) await withTimeout(stopLoggerRuntime(), 1300);
                if (settings.resetContext) resetSessionContext();

                try {
                    window.dispatchEvent(new CustomEvent('niltask:session-cleaned', {
                        detail: { reason, resetContext: settings.resetContext }
                    }));
                } catch (e) {}

                return true;
            } finally {
                STATE.cleanupPromise = null;
            }
        })();

        return STATE.cleanupPromise;
    }

    function installLogoutBoundary() {
        const original = window.logout;
        if (typeof original !== 'function') return false;
        if (original.__nfaSessionLifecycle === true) {
            STATE.logoutInstalled = true;
            return true;
        }

        const wrapped = async function (...args) {
            // Preserve current identity until the legacy logout has removed tenant-scoped
            // storage. The final reset runs even when SIGNED_OUT coalesces with cleanup.
            await cleanup('logout', { resetContext: false });
            try {
                return await original.apply(this, args);
            } finally {
                resetSessionContext();
            }
        };
        wrapped.__nfaSessionLifecycle = true;
        wrapped.__nfaOriginal = original;
        window.logout = wrapped;
        STATE.logoutInstalled = true;
        return true;
    }

    function installTenantBoundary() {
        const original = window.loadTenantContext;
        if (typeof original !== 'function') return false;
        if (original.__nfaSessionLifecycle === true) {
            STATE.tenantLoaderInstalled = true;
            return true;
        }

        const wrapped = async function (...args) {
            const previousTenant = STATE.identity.tenantId || window.currentTenantId || null;
            const result = await original.apply(this, args);
            const nextUser = window.currentUser?.id || null;
            const nextTenant = window.currentTenantId || null;

            if (previousTenant && nextTenant && previousTenant !== nextTenant) {
                await cleanup('tenant-change', { resetContext: false });
                requestRuntimeReload('tenant-change');
            }

            STATE.identity = { userId: nextUser, tenantId: nextTenant };
            return result;
        };
        wrapped.__nfaSessionLifecycle = true;
        wrapped.__nfaOriginal = original;
        window.loadTenantContext = wrapped;
        STATE.tenantLoaderInstalled = true;
        return true;
    }

    function installAuthBoundary() {
        if (STATE.authSubscription || !window.sb?.auth?.onAuthStateChange) return Boolean(STATE.authSubscription);
        try {
            const response = window.sb.auth.onAuthStateChange((event, session) => {
                const nextUser = session?.user?.id || null;

                if (event === 'SIGNED_OUT') {
                    cleanup('auth-signed-out', { resetContext: true, detachPush: false });
                    return;
                }

                if (event === 'SIGNED_IN') {
                    const previousUser = STATE.identity.userId;
                    if (previousUser && nextUser && previousUser !== nextUser) {
                        cleanup('user-change', { resetContext: true })
                            .finally(() => requestRuntimeReload('user-change'));
                        return;
                    }
                    try {
                        if (window.NILTASK_MobileRuntime?.snapshot?.().stopped) {
                            requestRuntimeReload('signed-in-after-cleanup');
                            return;
                        }
                    } catch (e) {}
                }

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    STATE.identity.userId = nextUser;
                    if (window.currentTenantId) STATE.identity.tenantId = window.currentTenantId;
                }
            });
            STATE.authSubscription = response?.data?.subscription || response?.subscription || true;
            return true;
        } catch (e) {
            return false;
        }
    }

    function install() {
        installAuthBoundary();
        installLogoutBoundary();
        installTenantBoundary();
        return STATE.logoutInstalled && STATE.tenantLoaderInstalled;
    }

    function boot() {
        if (install()) return;
        let attempts = 0;
        STATE.installTimer = setInterval(() => {
            attempts += 1;
            if (install() || attempts >= 300) clearInterval(STATE.installTimer);
        }, 100);
    }

    window.NILTASK_SessionLifecycle = Object.freeze({
        version: VERSION,
        cleanup,
        clearGlobalTimer,
        snapshot() {
            return {
                version: VERSION,
                identity: { ...STATE.identity },
                cleanupInFlight: Boolean(STATE.cleanupPromise),
                logoutInstalled: STATE.logoutInstalled,
                tenantLoaderInstalled: STATE.tenantLoaderInstalled,
                authBoundaryInstalled: Boolean(STATE.authSubscription),
                reloadingForIdentityChange: STATE.reloadingForIdentityChange,
                mobileRuntime: window.NILTASK_MobileRuntime?.snapshot?.() || null
            };
        }
    });
    window.NILTASK_cleanupSessionRuntime = cleanup;
    window.NILTASK_SESSION_LIFECYCLE_VERSION = VERSION;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();