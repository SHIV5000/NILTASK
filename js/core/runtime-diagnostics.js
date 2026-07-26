(function () {
    'use strict';

    if (window.NILTASK_runtimeSnapshot) return;

    const VERSION = 'v1';

    function timerState(name) {
        const value = window[name];
        return {
            name,
            active: value !== null && value !== undefined,
            type: value === null || value === undefined ? 'none' : typeof value
        };
    }

    function functionState(name) {
        const fn = window[name];
        return {
            name,
            available: typeof fn === 'function',
            markers: typeof fn === 'function' ? {
                nfa207: fn.__nfa207 === true,
                activityStable: fn.__nfaStable === true,
                subscriptionGuard: fn.__nfaSubscriptionGuard === true,
                notificationPresentation: fn.__nfaPresentationService === true,
                notificationToast: fn.__nfaNotificationToastBoundary === true,
                notificationSound: fn.__nfaNotificationSoundBoundary === true
            } : {}
        };
    }

    function snapshot() {
        const manager = window.NILTASK_RealtimeManager;
        const realtime = manager?.snapshot ? manager.snapshot() : {
            version: null,
            browserChannels: (() => {
                try {
                    return Array.from(window.sb?.getChannels?.() || []).map(channel =>
                        String(channel?.topic || channel?.subTopic || '')
                    );
                } catch (e) {
                    return [];
                }
            })(),
            owners: [],
            inFlight: []
        };

        return {
            capturedAt: new Date().toISOString(),
            appVersion: window.APP_VER || null,
            diagnosticsVersion: VERSION,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                mobile: Boolean(window.isMobileView?.())
            },
            session: {
                userId: window.currentUser?.id || null,
                tenantId: window.currentTenantId || null,
                roomId: window.currentRoom || null
            },
            activity: {
                open: Boolean(window._activityFeedOpen),
                panelPresent: Boolean(document.getElementById('activityFeedPanel')),
                listPresent: Boolean(document.getElementById('activityFeedList')),
                stabilityVersion: window.NILTASK_ACTIVITY_STABILITY_VERSION || null,
                compactFiltersVersion: window.NILTASK_COMPACT_PANEL_FILTERS_VERSION || null
            },
            versions: {
                realtimeManager: window.NILTASK_REALTIME_MANAGER_VERSION || null,
                subscriptionGuard: window.NILTASK_SUBSCRIPTION_GUARD_VERSION || null,
                notificationPresentation: window.NILTASK_NOTIFICATION_PRESENTATION_VERSION || null,
                activityUi: window.NILTASK_ACTIVITY_UI_VERSION || null,
                mobile: window.NILTASK_MOBILE_VERSION || null
            },
            realtime,
            functions: [
                'startSubscriptions',
                'openActivityFeed',
                '_loadActivityFeed',
                'refreshActivityFeed',
                'prependFeedItem',
                'triggerMessageNotification',
                'showCenterToast',
                'playSound'
            ].map(functionState),
            knownTimers: [
                '_afPollTimer',
                '_webHeartbeat',
                '_presenceTimer',
                '_webTypingTimer'
            ].map(timerState),
            observers: {
                activityDecoratorExpected: Boolean(window.NILTASK_ACTIVITY_UI_VERSION),
                compactFilterObserverExpected: Boolean(window.NILTASK_COMPACT_PANEL_FILTERS_VERSION)
            }
        };
    }

    function print() {
        const data = snapshot();
        try { console.table(data.realtime.browserChannels.map(topic => ({ topic }))); } catch (e) {}
        try { console.log('[NILTASK runtime snapshot]', data); } catch (e) {}
        return data;
    }

    window.NILTASK_runtimeSnapshot = snapshot;
    window.NILTASK_printRuntimeSnapshot = print;
    window.NILTASK_RUNTIME_DIAGNOSTICS_VERSION = VERSION;
})();