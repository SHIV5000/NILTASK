(function () {
    'use strict';

    const VERSION = 'v2';
    const STATE = {
        installed: false,
        installTimer: null,
        inFlight: null
    };

    function channelTopic(channel) {
        return String(channel?.topic || channel?.subTopic || '');
    }

    function topicMatches(channel, name) {
        const topic = channelTopic(channel);
        return topic === name || topic.endsWith(':' + name);
    }

    async function removeChannelSafe(sb, channel) {
        if (!channel) return;
        try {
            if (typeof sb?.removeChannel === 'function') {
                await sb.removeChannel(channel);
                return;
            }
        } catch (e) {}
        try { await channel.unsubscribe?.(); } catch (e) {}
    }

    async function disposeKnownDuplicates() {
        const sb = window.sb;
        if (!sb) return;

        const tenantId = window.currentTenantId;
        const desktop = !window.isMobileView?.();
        const names = ['scheduled-changes'];
        if (tenantId && desktop) names.push('taskflow-bc-' + tenantId);

        const channels = typeof sb.getChannels === 'function'
            ? Array.from(sb.getChannels() || [])
            : [];
        const removed = new Set();

        for (const channel of channels) {
            if (names.some(name => topicMatches(channel, name))) {
                removed.add(channel);
                await removeChannelSafe(sb, channel);
            }
        }

        // The legacy desktop module stores this channel on window. Clear the stale
        // reference after removing it so the next subscription startup owns a fresh one.
        if (
            window._sharedBroadcast &&
            tenantId &&
            desktop &&
            topicMatches(window._sharedBroadcast, 'taskflow-bc-' + tenantId)
        ) {
            if (!removed.has(window._sharedBroadcast)) {
                await removeChannelSafe(sb, window._sharedBroadcast);
            }
            window._sharedBroadcast = null;
        }
    }

    function install() {
        const original = window.startSubscriptions;
        if (typeof original !== 'function') return false;
        if (original.__nfaSubscriptionGuard === true) {
            STATE.installed = true;
            return true;
        }

        const wrapped = function (...args) {
            // Re-auth/bootstrap code can request startup twice within the same tick.
            // One shared promise prevents both calls from constructing parallel channels.
            if (STATE.inFlight) return STATE.inFlight;
            STATE.inFlight = (async () => {
                await disposeKnownDuplicates();
                return original.apply(this, args);
            })().finally(() => {
                STATE.inFlight = null;
            });
            return STATE.inFlight;
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