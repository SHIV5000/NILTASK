(function () {
    'use strict';

    if (window.NILTASK_mobileRuntimeSnapshot) return;

    const VERSION = 'v1';

    function topicOf(channel) {
        const raw = String(channel?.topic || channel?.subTopic || '');
        return raw.startsWith('realtime:') ? raw.slice('realtime:'.length) : raw;
    }

    function channelState(channel) {
        return {
            topic: topicOf(channel),
            state: channel?.state || channel?.joinedOnce ? 'joined' : channel?.state || null,
            joined: channel?.state === 'joined',
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
            documentedLocalResources: {
                reconnectTimer: '_rtReconnectTimer (module-local; not introspectable externally)',
                outageTimer: '_rtOutageTimer (module-local; not introspectable externally)',
                fallbackTimer: '_fallbackTimer (module-local; not introspectable externally)',
                activityPoll: '_activityPoll (module-local; not introspectable externally)',
                typingTimers: '_typingTimers (module-local; not introspectable externally)',
                headsUpTimer: '_headsUpTimer (module-local; not introspectable externally)',
            },
            limitations: [
                'This diagnostic is read-only and does not wrap mobile functions.',
                'Module-local timers require a future native MobileRuntime snapshot exported from mobile.js.',
                'Channel health reports the current Supabase client state only; database fallback behaviour must still be smoke-tested.',
            ],
        };
    }

    function print() {
        const data = snapshot();
        try { console.table(data.mainChannels); } catch (e) {}
        try { console.table(data.presenceChannels); } catch (e) {}
        try { console.table(data.desktopFeatureOwners); } catch (e) {}
        try { console.log('[NILTASK mobile runtime snapshot]', data); } catch (e) {}
        return data;
    }

    window.NILTASK_mobileRuntimeSnapshot = snapshot;
    window.NILTASK_printMobileRuntimeSnapshot = print;
    window.NILTASK_MOBILE_RUNTIME_DIAGNOSTICS_VERSION = VERSION;
})();