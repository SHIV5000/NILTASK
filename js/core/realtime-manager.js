(function () {
    'use strict';

    if (window.NILTASK_RealtimeManager) return;

    const VERSION = 'v1';
    const owners = new Map();
    const inFlight = new Map();

    function client() {
        return window.sb || null;
    }

    function topicOf(channel) {
        return String(channel?.topic || channel?.subTopic || '');
    }

    function topicMatches(channel, expected) {
        const topic = topicOf(channel);
        return topic === expected || topic.endsWith(':' + expected);
    }

    function listChannels() {
        const sb = client();
        if (!sb || typeof sb.getChannels !== 'function') return [];
        try { return Array.from(sb.getChannels() || []); } catch (e) { return []; }
    }

    async function removeChannel(channel) {
        if (!channel) return false;
        const sb = client();
        try {
            if (sb && typeof sb.removeChannel === 'function') {
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

    function register(owner, channel) {
        if (!owner || !channel) return channel;
        let set = owners.get(owner);
        if (!set) {
            set = new Set();
            owners.set(owner, set);
        }
        set.add(channel);
        return channel;
    }

    function unregister(owner, channel) {
        const set = owners.get(owner);
        if (!set) return;
        set.delete(channel);
        if (!set.size) owners.delete(owner);
    }

    async function stopOwner(owner) {
        const set = owners.get(owner);
        if (!set) return 0;
        owners.delete(owner);
        let removed = 0;
        for (const channel of Array.from(set)) {
            if (await removeChannel(channel)) removed += 1;
        }
        return removed;
    }

    async function removeTopics(topicNames, options = {}) {
        const names = Array.from(new Set((topicNames || []).filter(Boolean)));
        if (!names.length) return 0;

        const channels = listChannels();
        const removed = new Set();
        for (const channel of channels) {
            if (names.some(name => topicMatches(channel, name))) {
                removed.add(channel);
                await removeChannel(channel);
            }
        }

        if (options.channel && !removed.has(options.channel)) {
            if (names.some(name => topicMatches(options.channel, name))) {
                await removeChannel(options.channel);
                removed.add(options.channel);
            }
        }

        for (const [owner, set] of owners) {
            for (const channel of removed) set.delete(channel);
            if (!set.size) owners.delete(owner);
        }
        return removed.size;
    }

    function coalesce(key, operation) {
        if (!key || typeof operation !== 'function') return Promise.resolve().then(operation);
        if (inFlight.has(key)) return inFlight.get(key);
        const promise = Promise.resolve()
            .then(operation)
            .finally(() => {
                if (inFlight.get(key) === promise) inFlight.delete(key);
            });
        inFlight.set(key, promise);
        return promise;
    }

    function snapshot() {
        return {
            version: VERSION,
            browserChannels: listChannels().map(topicOf),
            owners: Array.from(owners.entries()).map(([owner, set]) => ({
                owner,
                topics: Array.from(set).map(topicOf)
            })),
            inFlight: Array.from(inFlight.keys())
        };
    }

    async function destroyAll() {
        const channels = new Set(listChannels());
        for (const set of owners.values()) {
            for (const channel of set) channels.add(channel);
        }
        owners.clear();
        inFlight.clear();
        let removed = 0;
        for (const channel of channels) {
            if (await removeChannel(channel)) removed += 1;
        }
        return removed;
    }

    window.NILTASK_RealtimeManager = Object.freeze({
        version: VERSION,
        topicOf,
        topicMatches,
        listChannels,
        register,
        unregister,
        stopOwner,
        removeChannel,
        removeTopics,
        coalesce,
        snapshot,
        destroyAll
    });
    window.NILTASK_REALTIME_MANAGER_VERSION = VERSION;
})();