(function () {
    'use strict';

    const VERSION = 'v4';
    const STATE = {
        installed: false,
        installTimer: null,
        inFlight: null
    };

    function fallbackTopic(channel) {
        return String(channel?.topic || channel?.subTopic || '');
    }

    function fallbackTopicMatches(channel, name) {
        const topic = fallbackTopic(channel);
        return topic === name || topic.endsWith(':' + name);
    }

    async function fallbackRemoveChannel(sb, channel) {
        if (!channel) return false;
        try {
            if (typeof sb?.removeChannel === 'function') {
                await sb.removeChannel(channel);
                return true;
            }
        } catch (e) {}
        try {
            await channel.unsubscribe?.();
            return true;
        } catch (e) {
            return false;
        }
    }

    async function disposeKnownDuplicates() {
        const sb = window.sb;
        if (!sb) return;

        const tenantId = window.currentTenantId;
        const desktop = !window.isMobileView?.();
        const names = ['scheduled-changes', 'notifications-changes'];
        if (tenantId && desktop) names.push('taskflow-bc-' + tenantId);

        const manager = window.NILTASK_RealtimeManager;
        if (manager?.removeTopics) {
            await manager.removeTopics(names, { channel: window._sharedBroadcast });
        } else {
            const channels = typeof sb.getChannels === 'function'
                ? Array.from(sb.getChannels() || [])
                : [];
            const removed = new Set();

            for (const channel of channels) {
                if (names.some(name => fallbackTopicMatches(channel, name))) {
                    removed.add(channel);
                    await fallbackRemoveChannel(sb, channel);
                }
            }

            if (
                window._sharedBroadcast &&
                tenantId &&
                desktop &&
                fallbackTopicMatches(window._sharedBroadcast, 'taskflow-bc-' + tenantId) &&
                !removed.has(window._sharedBroadcast)
            ) {
                await fallbackRemoveChannel(sb, window._sharedBroadcast);
            }
        }

        if (tenantId && desktop) window._sharedBroadcast = null;
    }

    async function migrateManagedOwners() {
        try {
            await window.NILTASK_RealtimeFeatureOwners?.reconcile?.();
        } catch (e) {}
        try {
            window.dispatchEvent(new CustomEvent('niltask:subscriptions-started', {
                detail: {
                    userId: window.currentUser?.id || null,
                    tenantId: window.currentTenantId || null
                }
            }));
        } catch (e) {}
    }

    function runOnce(original, context, args) {
        const operation = async () => {
            await disposeKnownDuplicates();
            const result = await original.apply(context, args);
            await migrateManagedOwners();
            return result;
        };

        const manager = window.NILTASK_RealtimeManager;
        if (manager?.coalesce) {
            return manager.coalesce('desktop-subscription-start', operation);
        }

        if (STATE.inFlight) return STATE.inFlight;
        STATE.inFlight = operation().finally(() => {
            STATE.inFlight = null;
        });
        return STATE.inFlight;
    }

    function install() {
        const original = window.startSubscriptions;
        if (typeof original !== 'function') return false;
        if (original.__nfaSubscriptionGuard === true) {
            STATE.installed = true;
            return true;
        }

        const wrapped = function (...args) {
            return runOnce(original, this, args);
        };
        wrapped.__nfaSubscriptionGuard = true;
        wrapped.__nfaOriginal = original;
        window.startSubscriptions = wrapped;

        STATE.installed = true;
        window.NILTASK_SUBSCRIPTION_GUARD_VERSION = VERSION;
        return true;
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