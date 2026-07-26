(function () {
    'use strict';

    if (window.NILTASK_runtimeSnapshot) return;

    const VERSION = 'v4';

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
                activityController: fn.__nfaActivityController === true,
                legacyActivityDecorator: fn.__nfa207 === true,
                legacyActivityStability: fn.__nfaStable === true,
                subscriptionGuard: fn.__nfaSubscriptionGuard === true,
                notificationPresentation: fn.__nfaPresentationService === true,
                notificationToast: fn.__nfaNotificationToastBoundary === true,
                notificationSound: fn.__nfaNotificationSoundBoundary === true,
                sessionLifecycle: fn.__nfaSessionLifecycle === true
            } : {}
        };
    }

    function countTopics(topics) {
        const counts = {};
        for (const topic of topics || []) counts[topic] = (counts[topic] || 0) + 1;
        return Object.entries(counts)
            .map(([topic, count]) => ({ topic, count }))
            .sort((a, b) => a.topic.localeCompare(b.topic));
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
        realtime.topicCounts = countTopics(realtime.browserChannels);

        const lifecycle = window.NILTASK_SessionLifecycle?.snapshot?.() || null;
        const featureOwners = window.NILTASK_RealtimeFeatureOwners?.snapshot?.() || null;
        const activityUiVersion = window.NILTASK_ACTIVITY_UI_VERSION || null;

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
                roomId: window.currentRoom || null,
                lifecycle
            },
            activity: {
                open: Boolean(window._activityFeedOpen),
                panelPresent: Boolean(document.getElementById('activityFeedPanel')),
                listPresent: Boolean(document.getElementById('activityFeedList')),
                controllerVersion: window.NILTASK_ACTIVITY_CONTROLLER_VERSION || null,
                legacyStabilityLoaded: Boolean(window.NILTASK_ACTIVITY_STABILITY_VERSION),
                legacyUiVersion: activityUiVersion,
                legacyUiRetired: typeof activityUiVersion === 'string' && activityUiVersion.startsWith('retired-'),
                compactTaskFiltersVersion: window.NILTASK_COMPACT_PANEL_FILTERS_VERSION || null
            },
            versions: {
                realtimeManager: window.NILTASK_REALTIME_MANAGER_VERSION || null,
                realtimeFeatureOwners: window.NILTASK_REALTIME_FEATURE_OWNERS_VERSION || null,
                sessionLifecycle: window.NILTASK_SESSION_LIFECYCLE_VERSION || null,
                subscriptionGuard: window.NILTASK_SUBSCRIPTION_GUARD_VERSION || null,
                notificationPresentation: window.NILTASK_NOTIFICATION_PRESENTATION_VERSION || null,
                activityController: window.NILTASK_ACTIVITY_CONTROLLER_VERSION || null,
                activityUi: activityUiVersion,
                mobile: window.NILTASK_MOBILE_VERSION || null
            },
            realtime: {
                ...realtime,
                featureOwners
            },
            functions: [
                'startSubscriptions',
                'logout',
                'loadTenantContext',
                'NILTASK_cleanupSessionRuntime',
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
                documentWideActivityObserver: false,
                documentWideCompactFilterObserver: false,
                taskFilterObserverScope: window.NILTASK_CompactTaskFilters ? '#rightSidebar' : null,
                note: 'Activity renders its final DOM directly. The remaining Task filter observer is feature-scoped to #rightSidebar.'
            }
        };
    }

    function print() {
        const data = snapshot();
        try { console.table(data.realtime.topicCounts); } catch (e) {}
        try { console.table(data.realtime.owners); } catch (e) {}
        try { console.log('[NILTASK runtime snapshot]', data); } catch (e) {}
        return data;
    }

    window.NILTASK_runtimeSnapshot = snapshot;
    window.NILTASK_printRuntimeSnapshot = print;
    window.NILTASK_RUNTIME_DIAGNOSTICS_VERSION = VERSION;
})();
