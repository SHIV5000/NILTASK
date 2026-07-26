(function () {
    'use strict';

    if (window.NILTASK_RealtimeFeatureOwners) return;

    const VERSION = 'v2';
    const OWNERS = Object.freeze({
        shared: 'desktop-shared-broadcast',
        scheduled: 'desktop-scheduled-messages',
        notifications: 'desktop-notification-rows'
    });
    const STATE = {
        inFlight: null,
        lastIdentity: null,
        bootTimer: null
    };

    function manager() {
        return window.NILTASK_RealtimeManager || null;
    }

    function client() {
        return window.sb || null;
    }

    function identity() {
        return {
            userId: window.currentUser?.id || null,
            tenantId: window.currentTenantId || null,
            desktop: !window.isMobileView?.()
        };
    }

    function logStatus(topic, status) {
        try { window.logger?.logRt?.(topic, status); } catch (e) {}
    }

    async function stopAndRemove(owner, topics) {
        const rt = manager();
        if (!rt) return;
        try { await rt.stopOwner(owner); } catch (e) {}
        try { await rt.removeTopics(topics); } catch (e) {}
    }

    function createSharedChannel(sb, rt, tenantId) {
        if (!tenantId || window.isMobileView?.()) {
            window._sharedBroadcast = null;
            return null;
        }

        const topic = 'taskflow-bc-' + tenantId;
        const channel = sb.channel(topic, { config: { broadcast: { self: false } } });
        channel
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'profiles',
                filter: `tenant_id=eq.${tenantId}`
            }, payload => window._onProfileRealtime?.(payload.new))
            .on('broadcast', { event: 'reaction' }, ({ payload }) => {
                if (!payload || payload.src === 'w') return;
                if (payload.isDelete) window._onBcReactionRemove?.(payload);
                else window._onBcReactionAdd?.(payload);
            })
            .on('broadcast', { event: 'group_photo' }, ({ payload }) => {
                if (!payload || payload.src === 'w') return;
                window._onBcGroupPhoto?.(payload);
            })
            .on('broadcast', { event: 'profile_update' }, ({ payload }) => {
                if (!payload || payload.src === 'w') return;
                window._onProfileRealtime?.(payload);
            })
            .on('broadcast', { event: 'typing' }, ({ payload }) => {
                if (!payload || payload.src === 'w') return;
                window._onBcTyping?.(payload);
            });

        rt.register(OWNERS.shared, channel);
        window._sharedBroadcast = channel;
        channel.subscribe(status => logStatus(topic, status));
        return channel;
    }

    function createScheduledChannel(sb, rt, userId) {
        if (!userId) return null;
        const topic = 'scheduled-changes';
        const channel = sb.channel(topic)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'scheduled_messages'
            }, payload => {
                const row = payload.new;
                if (!row || row.status !== 'sent' || row.sender_id !== window.currentUser?.id) return;

                const eventKey = 'scheduled-status:' + (row.id || '') + ':sent';
                if (window.NILTASK_shouldPresentEvent && !window.NILTASK_shouldPresentEvent(eventKey, 10000)) return;

                const raw = window.stripHtml ? window.stripHtml(row.message_text) : String(row.message_text || '');
                const preview = raw.substring(0, 60);
                window.showCenterToast?.('📨 Scheduled: ' + preview, 'fa-solid fa-clock', 'text-blue-400');
                window.playSound?.('message');

                window.notifyGroupMembers?.(
                    row.room_id,
                    row.sender_id,
                    '📅 Scheduled message: ' + preview,
                    row.id,
                    'scheduled'
                );
                window.refreshNotificationBadge?.();
                if (row.room_id === window.currentRoom) window.loadMessages?.();
            });

        rt.register(OWNERS.scheduled, channel);
        channel.subscribe(status => logStatus(topic, status));
        return channel;
    }

    function fallbackPresentNotification(notification) {
        const type = notification?.type || 'general';
        const configs = {
            reminder:  { icon:'fa-solid fa-stopwatch',       color:'text-purple-400', sound:'reminder' },
            task:      { icon:'fa-solid fa-clipboard-check', color:'text-blue-400',   sound:'task' },
            message:   { icon:'fa-solid fa-comment',         color:'text-green-400',  sound:'message' },
            reply:     { icon:'fa-solid fa-reply',           color:'text-indigo-400', sound:'message' },
            reaction:  { icon:'fa-solid fa-heart',           color:'text-pink-400',   sound:'message' },
            scheduled: { icon:'fa-solid fa-clock',           color:'text-yellow-400', sound:'message' },
            general:   { icon:'fa-solid fa-bell',            color:'text-yellow-400', sound:'task' }
        };
        const cfg = configs[type] || configs.general;
        const raw = window.stripHtml ? window.stripHtml(notification?.message) : String(notification?.message || '');
        window.prependFeedItem?.(notification);
        window.showCenterToast?.(raw.substring(0, 100), cfg.icon, cfg.color);
        window.playSound?.(cfg.sound);
        window.refreshNotificationBadge?.();
        window.animateBell?.();
        if (window._activityFeedOpen) window.refreshActivityFeed?.();
    }

    function createNotificationChannel(sb, rt, userId, tenantId) {
        if (!userId) return null;
        const topic = 'notifications-changes';
        const channel = sb.channel(topic)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, payload => {
                const notification = payload.new;
                if (!notification) return;
                if (notification.user_id && notification.user_id !== window.currentUser?.id) return;
                if (notification.tenant_id && tenantId && notification.tenant_id !== tenantId) return;

                if (typeof window.NILTASK_presentNotificationRow === 'function') {
                    window.NILTASK_presentNotificationRow(notification);
                } else {
                    fallbackPresentNotification(notification);
                }
            });

        rt.register(OWNERS.notifications, channel);
        channel.subscribe(status => logStatus(topic, status));
        return channel;
    }

    async function reconcile() {
        if (STATE.inFlight) return STATE.inFlight;

        STATE.inFlight = (async () => {
            const sb = client();
            const rt = manager();
            const current = identity();
            if (!sb || !rt || !current.userId || !current.tenantId || !current.desktop) return false;

            const sharedTopic = 'taskflow-bc-' + current.tenantId;
            await stopAndRemove(OWNERS.shared, [sharedTopic]);
            await stopAndRemove(OWNERS.scheduled, ['scheduled-changes']);
            await stopAndRemove(OWNERS.notifications, ['notifications-changes']);
            window._sharedBroadcast = null;

            createSharedChannel(sb, rt, current.tenantId);
            createScheduledChannel(sb, rt, current.userId);
            createNotificationChannel(sb, rt, current.userId, current.tenantId);

            STATE.lastIdentity = current;
            window.NILTASK_REALTIME_FEATURE_OWNERS_VERSION = VERSION;
            return true;
        })().finally(() => {
            STATE.inFlight = null;
        });

        return STATE.inFlight;
    }

    async function stop() {
        const rt = manager();
        if (!rt) return;
        await Promise.all([
            rt.stopOwner(OWNERS.shared),
            rt.stopOwner(OWNERS.scheduled),
            rt.stopOwner(OWNERS.notifications)
        ]);
        window._sharedBroadcast = null;
        STATE.lastIdentity = null;
    }

    function boot() {
        const current = identity();
        const ready = Boolean(
            current.desktop && client() && manager() && current.userId && current.tenantId &&
            typeof window.startSubscriptions === 'function'
        );
        if (ready) {
            const channels = manager().listChannels();
            const hasLegacyTopics = channels.some(channel => {
                return manager().topicMatches(channel, 'scheduled-changes') ||
                    manager().topicMatches(channel, 'notifications-changes') ||
                    manager().topicMatches(channel, 'taskflow-bc-' + current.tenantId);
            });
            if (hasLegacyTopics) {
                reconcile();
                return true;
            }
            return false;
        }
        return false;
    }

    window.addEventListener('niltask:subscriptions-started', () => reconcile());
    window.addEventListener('niltask:session-cleaned', () => {
        STATE.lastIdentity = null;
        window._sharedBroadcast = null;
    });

    window.NILTASK_RealtimeFeatureOwners = Object.freeze({
        version: VERSION,
        owners: OWNERS,
        reconcile,
        stop,
        snapshot() {
            return {
                version: VERSION,
                inFlight: Boolean(STATE.inFlight),
                lastIdentity: STATE.lastIdentity ? { ...STATE.lastIdentity } : null
            };
        }
    });

    if (!boot()) {
        let attempts = 0;
        STATE.bootTimer = setInterval(() => {
            attempts += 1;
            if (boot() || attempts >= 300) clearInterval(STATE.bootTimer);
        }, 100);
    }
})();