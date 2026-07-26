(function () {
    'use strict';

    const VERSION = 'v7';
    const STATE = {
        installed: false,
        installTimer: null,
        inFlight: null,
        legacyRetireTimer: null,
        legacyRetireAttempts: 0,
        legacyRetiredTopic: null,
        legacyRetireState: 'idle'
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

    function clearLegacyRetireTimer() {
        if (STATE.legacyRetireTimer) clearTimeout(STATE.legacyRetireTimer);
        STATE.legacyRetireTimer = null;
    }

    function channelJoined(channel) {
        return Boolean(channel && channel.state === 'joined');
    }

    function replacementChannelsReady(tenantId) {
        const sb = window.sb;
        const manager = window.NILTASK_RealtimeManager;
        const channels = manager?.listChannels
            ? manager.listChannels()
            : (typeof sb?.getChannels === 'function' ? Array.from(sb.getChannels() || []) : []);
        const matches = manager?.topicMatches || fallbackTopicMatches;
        const messageTopic = 'public:messages-' + tenantId;
        const sharedTopic = 'taskflow-bc-' + tenantId;
        const messageChannel = channels.find(channel => matches(channel, messageTopic));
        const sharedChannel = channels.find(channel => matches(channel, sharedTopic));
        return channelJoined(messageChannel) && channelJoined(sharedChannel);
    }

    async function removeLegacyReactionChannel(tenantId) {
        const sb = window.sb;
        if (!sb || !tenantId) return false;
        const legacyTopic = 'mpgs-reactions-v1-' + tenantId;
        const manager = window.NILTASK_RealtimeManager;

        if (manager?.removeTopics) {
            await manager.removeTopics([legacyTopic], { channel: window._reactionsBroadcast });
        } else {
            const channels = typeof sb.getChannels === 'function'
                ? Array.from(sb.getChannels() || [])
                : [];
            const removed = new Set();
            for (const channel of channels) {
                if (fallbackTopicMatches(channel, legacyTopic)) {
                    removed.add(channel);
                    await fallbackRemoveChannel(sb, channel);
                }
            }
            if (
                window._reactionsBroadcast &&
                fallbackTopicMatches(window._reactionsBroadcast, legacyTopic) &&
                !removed.has(window._reactionsBroadcast)
            ) {
                await fallbackRemoveChannel(sb, window._reactionsBroadcast);
            }
        }

        window._reactionsBroadcast = null;
        STATE.legacyRetiredTopic = legacyTopic;
        STATE.legacyRetireState = 'retired';
        try {
            window.dispatchEvent(new CustomEvent('niltask:legacy-reaction-channel-retired', {
                detail: { tenantId, topic: legacyTopic }
            }));
        } catch (e) {}
        return true;
    }

    function scheduleLegacyReactionRetirement(options = {}) {
        const tenantId = window.currentTenantId;
        const desktop = !window.isMobileView?.();
        if (!tenantId || !desktop || !window.sb) return false;

        if (options.reset !== false) {
            clearLegacyRetireTimer();
            STATE.legacyRetireAttempts = 0;
            STATE.legacyRetireState = 'waiting-for-managed-replacements';
        }

        const attempt = async () => {
            STATE.legacyRetireTimer = null;
            const currentTenant = window.currentTenantId;
            if (!currentTenant || currentTenant !== tenantId || window.isMobileView?.()) {
                STATE.legacyRetireState = 'cancelled';
                return;
            }
            STATE.legacyRetireAttempts += 1;
            if (replacementChannelsReady(tenantId)) {
                await removeLegacyReactionChannel(tenantId);
                return;
            }
            if (STATE.legacyRetireAttempts >= 40) {
                STATE.legacyRetireState = 'replacement-timeout';
                return;
            }
            STATE.legacyRetireTimer = setTimeout(attempt, 250);
        };

        STATE.legacyRetireTimer = setTimeout(attempt, 0);
        return true;
    }

    async function disposeKnownDuplicates() {
        const sb = window.sb;
        if (!sb) return;

        clearLegacyRetireTimer();
        STATE.legacyRetireAttempts = 0;
        STATE.legacyRetireState = 'subscription-restart';

        const tenantId = window.currentTenantId;
        const desktop = !window.isMobileView?.();
        if (!desktop) return;
        const names = ['scheduled-changes', 'notifications-changes'];
        if (tenantId) {
            names.push('taskflow-bc-' + tenantId);
            names.push('mpgs-reactions-v1-' + tenantId);
        }

        const manager = window.NILTASK_RealtimeManager;
        if (manager?.removeTopics) {
            await manager.removeTopics(names, { channel: window._sharedBroadcast });
            if (tenantId && window._reactionsBroadcast) {
                await manager.removeTopics(['mpgs-reactions-v1-' + tenantId], { channel: window._reactionsBroadcast });
            }
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
                fallbackTopicMatches(window._sharedBroadcast, 'taskflow-bc-' + tenantId) &&
                !removed.has(window._sharedBroadcast)
            ) {
                await fallbackRemoveChannel(sb, window._sharedBroadcast);
            }
            if (
                window._reactionsBroadcast &&
                tenantId &&
                fallbackTopicMatches(window._reactionsBroadcast, 'mpgs-reactions-v1-' + tenantId) &&
                !removed.has(window._reactionsBroadcast)
            ) {
                await fallbackRemoveChannel(sb, window._reactionsBroadcast);
            }
        }

        if (tenantId) {
            window._sharedBroadcast = null;
            window._reactionsBroadcast = null;
        }
    }

    async function migrateManagedOwners() {
        let managedReady = false;
        try {
            managedReady = Boolean(await window.NILTASK_RealtimeFeatureOwners?.reconcile?.());
        } catch (e) {}
        const retirementScheduled = managedReady ? scheduleLegacyReactionRetirement() : false;
        try {
            window.dispatchEvent(new CustomEvent('niltask:subscriptions-started', {
                detail: {
                    userId: window.currentUser?.id || null,
                    tenantId: window.currentTenantId || null,
                    legacyReactionRetirementScheduled: retirementScheduled
                }
            }));
        } catch (e) {}
    }

    function runOnce(original, context, args) {
        if (window.isMobileView?.()) return original.apply(context, args);

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

    function snapshot() {
        return {
            version: VERSION,
            installed: STATE.installed,
            inFlight: Boolean(STATE.inFlight),
            legacyReaction: {
                state: STATE.legacyRetireState,
                attempts: STATE.legacyRetireAttempts,
                retiredTopic: STATE.legacyRetiredTopic,
                timerPending: Boolean(STATE.legacyRetireTimer),
                channelPresent: Boolean(window._reactionsBroadcast)
            }
        };
    }

    function boot() {
        if (install()) return;
        let attempts = 0;
        STATE.installTimer = setInterval(() => {
            attempts += 1;
            if (install() || attempts >= 300) clearInterval(STATE.installTimer);
        }, 100);
    }

    window.addEventListener('niltask:session-cleaned', () => {
        clearLegacyRetireTimer();
        STATE.legacyRetireAttempts = 0;
        STATE.legacyRetiredTopic = null;
        STATE.legacyRetireState = 'session-cleaned';
        window._reactionsBroadcast = null;
    });

    window.NILTASK_SubscriptionGuard = Object.freeze({
        version: VERSION,
        snapshot,
        retireLegacyReactionChannel: () => scheduleLegacyReactionRetirement()
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();