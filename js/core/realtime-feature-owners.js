(function () {
    'use strict';

    if (window.NILTASK_RealtimeFeatureOwners) return;

    const VERSION = 'v5';
    const OWNERS = Object.freeze({
        shared: 'desktop-shared-broadcast',
        messages: 'desktop-message-reactions',
        scheduled: 'desktop-scheduled-messages',
        notifications: 'desktop-notification-rows',
        tasks: 'desktop-tasks',
        assignees: 'desktop-task-assignees',
        trails: 'desktop-task-trails'
    });
    const STATE = {
        inFlight: null,
        lastIdentity: null,
        bootTimer: null
    };

    function manager() { return window.NILTASK_RealtimeManager || null; }
    function client() { return window.sb || null; }
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

    function refreshReactionAttention(reason) {
        if (window.NILTASK_UnreadService?.refreshSoon) {
            window.NILTASK_UnreadService.refreshSoon(reason || 'reaction-event', 900);
        } else if (window.NFA_unreadCount && window.currentUser?.id) {
            setTimeout(() => {
                try {
                    window.NFA_unreadCount(client(), window.currentUser.id)
                        .then(count => window._setBellBadge?.(count));
                } catch (e) {}
            }, 900);
        }
        if (window._activityFeedOpen) window.refreshActivityFeed?.();
    }

    function handleDesktopMessage(row, tenantId) {
        if (!row || (row.tenant_id && row.tenant_id !== tenantId)) return;
        try { window.logger?.logRealtime?.('msg:INSERT', { id:row.id, room:row.room_id }); } catch (e) {}

        const incomingRoom = row.room_id || '';
        const isMine = row.sender_id === window.currentUser?.id;
        const isMobile = Boolean(window.isMobileView?.());

        if (!isMine && row.text && row.text.includes('data-uid="' + window.currentUser?.id + '"')) {
            const sender = window.globalUsersCache?.find(user => user.id === row.sender_id);
            const senderName = window.toSentenceCase?.(
                sender?.full_name || sender?.email?.split('@')[0] || 'Someone'
            ) || 'Someone';
            window.playSound?.('message');
            window.showCenterToast?.(
                '📣 ' + window.escapeHtml(senderName) + ' mentioned you',
                'fa-solid fa-at',
                'text-indigo-400'
            );
        }

        if (incomingRoom === window.currentRoom) {
            if (!isMine) window.loadMessages?.();
            if (!isMine && !window.isRoomMuted?.(incomingRoom)) {
                window.playSound?.('message');
                window.triggerMessageNotification?.(row);
            }
        } else {
            const isDmForMe = !incomingRoom.startsWith('dm_') || window.isDmParticipant?.(incomingRoom);
            if (isDmForMe && !isMine && !isMobile) {
                window.unreadCounts = window.unreadCounts || {};
                window.unreadCounts[incomingRoom] = (window.unreadCounts[incomingRoom] || 0) + 1;
            }
            if (!isMine && isDmForMe && !isMobile && !window.isRoomMuted?.(incomingRoom)) {
                window.triggerMessageNotification?.(row);
                window._incrementBellBadge?.();
            }
            window.loadChatsList?.();
            if (window.isDmParticipant?.(incomingRoom) && !isMine) window.playSound?.('message');
        }
        if (window._activityFeedOpen) window.refreshActivityFeed?.();
    }

    function createMessageChannel(sb, rt, tenantId) {
        if (!tenantId) return null;
        const topic = 'public:messages-' + tenantId;
        const channel = sb.channel(topic)
            .on('postgres_changes', {
                event:'INSERT', schema:'public', table:'reactions',
                filter:`tenant_id=eq.${tenantId}`
            }, payload => {
                const row = payload.new;
                try {
                    window.logger?.logReact?.('pg-recv', {
                        et:'INSERT', hasMid:Boolean(row?.message_id),
                        rowFound:Boolean(row?.message_id && document.getElementById('row-' + row.message_id))
                    });
                } catch (e) {}
                window._onBcReactionAdd?.(row);
                if (row?.user_id && row.user_id !== window.currentUser?.id) refreshReactionAttention('reaction-insert');
            })
            .on('postgres_changes', {
                event:'DELETE', schema:'public', table:'reactions'
            }, payload => {
                const row = payload.old;
                try {
                    window.logger?.logReact?.('pg-recv', {
                        et:'DELETE', hasMid:Boolean(row?.message_id),
                        rowFound:Boolean(row?.message_id && document.getElementById('row-' + row.message_id))
                    });
                } catch (e) {}
                window._onBcReactionRemove?.(row);
            })
            .on('postgres_changes', {
                event:'INSERT', schema:'public', table:'messages',
                filter:`tenant_id=eq.${tenantId}`
            }, payload => handleDesktopMessage(payload.new, tenantId));

        rt.register(OWNERS.messages, channel);
        channel.subscribe(status => logStatus(topic, status));
        return channel;
    }

    function createScheduledChannel(sb, rt, userId, tenantId) {
        if (!userId) return null;
        const topic = 'scheduled-changes';
        const channel = sb.channel(topic)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'scheduled_messages'
            }, payload => {
                const row = payload.new;
                if (!row || row.status !== 'sent' || row.sender_id !== window.currentUser?.id) return;
                if (row.tenant_id && tenantId && row.tenant_id !== tenantId) return;
                const eventKey = 'scheduled-status:' + (row.id || '') + ':sent';
                if (window.NILTASK_shouldPresentEvent && !window.NILTASK_shouldPresentEvent(eventKey, 10000)) return;
                const raw = window.stripHtml ? window.stripHtml(row.message_text) : String(row.message_text || '');
                const preview = raw.substring(0, 60);
                window.showCenterToast?.('📨 Scheduled: ' + preview, 'fa-solid fa-clock', 'text-blue-400');
                window.playSound?.('message');
                window.notifyGroupMembers?.(
                    row.room_id, row.sender_id, '📅 Scheduled message: ' + preview,
                    row.id, 'scheduled'
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
            reminder:{icon:'fa-solid fa-stopwatch',color:'text-purple-400',sound:'reminder'},
            task:{icon:'fa-solid fa-clipboard-check',color:'text-blue-400',sound:'task'},
            message:{icon:'fa-solid fa-comment',color:'text-green-400',sound:'message'},
            reply:{icon:'fa-solid fa-reply',color:'text-indigo-400',sound:'message'},
            reaction:{icon:'fa-solid fa-heart',color:'text-pink-400',sound:'message'},
            scheduled:{icon:'fa-solid fa-clock',color:'text-yellow-400',sound:'message'},
            general:{icon:'fa-solid fa-bell',color:'text-yellow-400',sound:'task'}
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
                event:'INSERT', schema:'public', table:'notifications',
                filter:`user_id=eq.${userId}`
            }, payload => {
                const notification = payload.new;
                if (!notification) return;
                if (notification.user_id && notification.user_id !== window.currentUser?.id) return;
                if (notification.tenant_id && tenantId && notification.tenant_id !== tenantId) return;
                if (typeof window.NILTASK_presentNotificationRow === 'function') {
                    window.NILTASK_presentNotificationRow(notification);
                } else fallbackPresentNotification(notification);
            });
        rt.register(OWNERS.notifications, channel);
        channel.subscribe(status => logStatus(topic, status));
        return channel;
    }

    function createTaskTableChannel(sb, rt, options) {
        const { owner, topic, table, tenantId, refreshActivity } = options;
        if (!tenantId) return null;
        const handle = payload => {
            const row = payload?.new || payload?.old || null;
            if (row?.tenant_id && row.tenant_id !== window.currentTenantId) return;
            window.debouncedLoadTasks?.();
            if (refreshActivity && window._activityFeedOpen) window.refreshActivityFeed?.();
        };
        const channel = sb.channel(topic)
            .on('postgres_changes', {
                event:'INSERT', schema:'public', table,
                filter:`tenant_id=eq.${tenantId}`
            }, handle)
            .on('postgres_changes', {
                event:'UPDATE', schema:'public', table,
                filter:`tenant_id=eq.${tenantId}`
            }, handle)
            .on('postgres_changes', { event:'DELETE', schema:'public', table }, handle);
        rt.register(owner, channel);
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

            const topics = {
                shared:'taskflow-bc-' + current.tenantId,
                messages:'public:messages-' + current.tenantId,
                scheduled:'scheduled-changes',
                notifications:'notifications-changes',
                tasks:'tasks-changes',
                assignees:'assignees-changes',
                trails:'trails-changes'
            };
            await Promise.all(Object.keys(topics).map(key => stopAndRemove(OWNERS[key], [topics[key]])));
            window._sharedBroadcast = null;

            createSharedChannel(sb, rt, current.tenantId);
            createMessageChannel(sb, rt, current.tenantId);
            createScheduledChannel(sb, rt, current.userId, current.tenantId);
            createNotificationChannel(sb, rt, current.userId, current.tenantId);
            createTaskTableChannel(sb, rt, { owner:OWNERS.tasks, topic:topics.tasks, table:'tasks', tenantId:current.tenantId });
            createTaskTableChannel(sb, rt, { owner:OWNERS.assignees, topic:topics.assignees, table:'task_assignees', tenantId:current.tenantId });
            createTaskTableChannel(sb, rt, { owner:OWNERS.trails, topic:topics.trails, table:'task_trails', tenantId:current.tenantId, refreshActivity:true });

            STATE.lastIdentity = current;
            window.NILTASK_REALTIME_FEATURE_OWNERS_VERSION = VERSION;
            return true;
        })().finally(() => { STATE.inFlight = null; });
        return STATE.inFlight;
    }

    async function stop() {
        const rt = manager();
        if (!rt) return;
        await Promise.all(Object.values(OWNERS).map(owner => rt.stopOwner(owner)));
        window._sharedBroadcast = null;
        STATE.lastIdentity = null;
    }

    function boot() {
        const current = identity();
        if (!current.desktop) return true;
        const ready = Boolean(
            current.desktop && client() && manager() && current.userId && current.tenantId &&
            typeof window.startSubscriptions === 'function'
        );
        if (!ready) return false;
        const managedTopics = [
            'public:messages-' + current.tenantId,
            'scheduled-changes', 'notifications-changes', 'tasks-changes',
            'assignees-changes', 'trails-changes', 'taskflow-bc-' + current.tenantId
        ];
        const channels = manager().listChannels();
        const hasTopics = channels.some(channel =>
            managedTopics.some(topic => manager().topicMatches(channel, topic))
        );
        if (hasTopics) {
            reconcile();
            return true;
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
            if (boot() || attempts >= 300) {
                clearInterval(STATE.bootTimer);
                STATE.bootTimer = null;
            }
        }, 100);
    }
})();