(function () {
    'use strict';

    if (window.NILTASK_mobileRuntimeSnapshot) return;

    const VERSION = 'v2';

    function topicOf(channel) {
        const raw = String(channel?.topic || channel?.subTopic || '');
        return raw.startsWith('realtime:') ? raw.slice('realtime:'.length) : raw;
    }

    function channelState(channel) {
        const rawState = channel?.state || null;
        return {
            topic: topicOf(channel),
            state: rawState,
            joined: rawState === 'joined',
        };
    }

    function channels() {
        try {
            return Array.from(window.sb?.getChannels?.() || []).map(channelState);
        } catch (e) {
            return [];
        }
    }

    function findTopic(list, prefix) {
        return list.filter(item => item.topic === prefix || item.topic.startsWith(prefix));
    }

    function lifecycleSnapshot() {
        try { return window.NILTASK_MobileRuntime?.snapshot?.() || null; } catch (e) { return null; }
    }

    function snapshot() {
        const list = channels();
        const tenantId = window.currentTenantId || null;
        const mobileTopics = findTopic(list, 'mobile-rt-');
        const presenceTopics = findTopic(list, 'presence-');
        const desktopOwners = window.NILTASK_RealtimeManager?.snapshot?.().owners || [];
        const desktopFeatureOwners = desktopOwners.filter(owner =>
            String(owner?.owner || '').startsWith('desktop-')
        );
        const unread = window.NILTASK_UnreadService?.snapshot?.() || null;
        const lifecycle = lifecycleSnapshot();
        const mobile = Boolean(window.isMobileView?.() || document.getElementById('mobileApp'));

        return {
            version: VERSION,
            capturedAt: new Date().toISOString(),
            mobile,
            userId: window.currentUser?.id || null,
            tenantId,
            mobileAppPresent: Boolean(document.getElementById('mobileApp')),
            rootHidden: document.getElementById('root')?.style?.display === 'none',
            mainChannels: mobileTopics,
            mainChannelCount: mobileTopics.length,
            mainChannelHealthy: mobileTopics.length === 1 && mobileTopics[0].joined,
            presenceChannels: presenceTopics,
            presenceChannelCount: presenceTopics.length,
            presenceChannelHealthy: presenceTopics.length === 1 && presenceTopics[0].joined,
            desktopFeatureOwners,
            desktopOwnersAbsent: desktopFeatureOwners.length === 0,
            unread: unread ? {
                version: unread.version,
                passiveMobile: unread.passiveMobile,
                automaticOwnerExpected: false,
            } : null,
            lifecycle: lifecycle ? {
                version: lifecycle.version,
                stopped: lifecycle.stopped,
                stopReason: lifecycle.stopReason,
                cleanupInFlight: lifecycle.cleanupInFlight,
                tracked: lifecycle.tracked,
                channels: lifecycle.channels,
                channelsRemoved: lifecycle.channelsRemoved,
                lastStop: lifecycle.lastStop,
                restartMode: lifecycle.restartMode,
            } : null,
            lifecycleAvailable: Boolean(lifecycle),
            acceptance: {
                oneMainChannel: mobileTopics.length === 1,
                onePresenceChannel: presenceTopics.length === 1,
                desktopOwnersAbsent: desktopFeatureOwners.length === 0,
                sharedUnreadPassive: Boolean(unread?.passiveMobile),
                stoppedRuntimeHasNoTrackedResources: lifecycle?.stopped
                    ? Object.values(lifecycle.tracked || {}).every(value => Number(value || 0) === 0)
                    : null,
                stoppedRuntimeHasNoMobileChannels: lifecycle?.stopped
                    ? mobileTopics.length === 0 && presenceTopics.length === 0
                    : null,
            },
            limitations: [
                'Resource counts include mobile.js/mobile-tasks.js callsites tracked after the early bootstrap installed.',
                'A lifecycle stop is destructive for the current page; restart intentionally uses a page reload.',
                'Channel health reflects current Supabase client state; database fallback behaviour still requires authenticated smoke testing.',
            ],
        };
    }

    function print() {
        const data = snapshot();
        try { console.table(data.mainChannels); } catch (e) {}
        try { console.table(data.presenceChannels); } catch (e) {}
        try { console.table(data.desktopFeatureOwners); } catch (e) {}
        try { if (data.lifecycle?.tracked) console.table([data.lifecycle.tracked]); } catch (e) {}
        try { console.log('[NILTASK mobile runtime snapshot]', data); } catch (e) {}
        return data;
    }

    window.NILTASK_mobileRuntimeSnapshot = snapshot;
    window.NILTASK_printMobileRuntimeSnapshot = print;
    window.NILTASK_MOBILE_RUNTIME_DIAGNOSTICS_VERSION = VERSION;
})();