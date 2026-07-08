/**
 * SHARED activity-feed core (Phase 7 pilot).
 *
 * The web shell (ui-feed.js) and the mobile shell (mobile.js) each had their own
 * copy of "fetch messages + task_trails + notifications, dedup, merge, sort".
 * That divergence is exactly what caused the class of "works on web, broken on
 * mobile" feed bugs (e.g. the mobile-only tenant_id filter that starved the feed,
 * and mobile reading notifications ONLY). This module owns that logic ONCE.
 *
 * Rendering stays per-shell (the two UIs differ); only the data pipeline is
 * shared. The shell injects its own name/room resolvers + snippet helper so the
 * core needs no knowledge of either shell's caches.
 *
 * Loaded as a classic script (like js/utils/text.js) exposing window.NFA_*.
 */
(function () {
    'use strict';

    // Notification type → card metadata. Single source of truth for both shells.
    function kindOf(n) {
        const t = (n && n.type) || 'message';
        const msgAct = n && n.message_id ? { k: 'msg', id: n.message_id } : null;
        switch (t) {
            case 'task':     return { cat: 'tasks',     cls: 'orange', badge: '📋 Task',     emoji: '📋', act: n.task_id ? { k: 'task', id: n.task_id } : null };
            case 'reminder': return { cat: 'reminders', cls: 'green',  badge: '⏰ Reminder', emoji: '⏰', act: msgAct };
            case 'reply':    return { cat: 'chats',     cls: 'blue',   badge: '↩ Reply',    emoji: '↩',  act: msgAct };
            case 'reaction': return { cat: 'chats',     cls: 'blue',   badge: '❤️ Reaction', emoji: '❤️', act: msgAct };
            case 'mention':  return { cat: 'chats',     cls: 'purple', badge: '📣 Mention',  emoji: '📣', act: msgAct };
            default:         return { cat: 'chats',     cls: 'blue',   badge: '💬 Message',  emoji: '💬', act: msgAct };
        }
    }

    const _TRAIL_ACTION = { created:'assigned', accepted:'completed', submitted:'submitted', update:'updated', delegate:'delegated', transfer:'transferred', review:'reviewed' };

    /**
     * Fetch + merge + normalize the activity feed.
     * @returns {Promise<{items:Array, unread:number}>} items are sorted newest-first,
     *   each shaped { n:{id,message,message_id?,task_id?,created_at,is_read}, sender, cat, cls, badge, emoji, act }.
     */
    async function buildActivity(sb, opts) {
        const {
            uid, tid,
            resolveName = (id) => id || '',           // (userId) => display name
            resolveRoom = (rid) => rid || '',          // (roomId) => human label
            snippet = (h) => String(h || ''),          // (html, n) => plain text
            limitNotif = 80, limitMsg = 60, limitTrail = 30,
            markRead = true, logError = null,
        } = opts || {};

        const [rNotif, rMsg, rTrail] = await Promise.all([
            sb.from('notifications')
                .select('id,type,message,message_id,task_id,created_at,is_read')
                .eq('user_id', uid)
                .order('created_at', { ascending: false }).limit(limitNotif),
            sb.from('messages')
                .select('id,created_at,room_id,sender_id,text,parent_message_id')
                .eq('tenant_id', tid).is('deleted_at', null)
                .order('created_at', { ascending: false }).limit(limitMsg),
            sb.from('task_trails')
                .select('id,created_at,action,task_id,comment,tasks(title),profiles(full_name,email)')
                .eq('tenant_id', tid)
                .order('created_at', { ascending: false }).limit(limitTrail),
        ]);

        const notifs = rNotif.data || [];
        if (rNotif.error && logError) logError('notifications.select[feed]', { error: rNotif.error });

        // Persist "read" so the badge poll doesn't resurrect a seen count.
        const unreadIds = notifs.filter(n => !n.is_read).map(n => n.id);
        if (markRead && unreadIds.length) {
            sb.from('notifications').update({ is_read: true }).in('id', unreadIds).then(() => {});
        }

        // Resolve message-notification senders from the messages we already have,
        // filling gaps with one follow-up query.
        const senderById = {};
        (rMsg.data || []).forEach(m => { senderById[m.id] = m.sender_id; });
        try {
            const need = notifs.filter(n => n.message_id && !(n.message_id in senderById)).map(n => n.message_id);
            if (need.length) {
                const { data: msgs } = await sb.from('messages').select('id,sender_id').in('id', need);
                (msgs || []).forEach(m => { senderById[m.id] = m.sender_id; });
            }
        } catch (e) {}
        const senderOf = (n) => {
            const sid = n.message_id ? senderById[n.message_id] : null;
            return sid ? (resolveName(sid) || '') : '';
        };

        const notifMsgIds = new Set(notifs.map(n => n.message_id).filter(Boolean));
        const items = [];

        notifs.forEach(n => items.push({ n, sender: senderOf(n), ...kindOf(n) }));

        (rMsg.data || []).forEach(m => {
            if (notifMsgIds.has(m.id)) return;               // already covered by a notification
            const mine  = m.sender_id === uid;
            const label = resolveRoom(m.room_id);
            const tx    = snippet(m.text, 60) || 'Attachment';
            const title = (m.parent_message_id ? 'Reply' : 'Message') + (label ? (' in ' + label) : '') + ' — ' + tx;
            items.push({
                n: { id: 'msg:' + m.id, message: title, message_id: m.id, created_at: m.created_at, is_read: true },
                sender: mine ? '' : resolveName(m.sender_id), cat: 'chats', cls: 'blue',
                badge: m.parent_message_id ? '↩ Reply' : '💬 Message', emoji: '💬', act: { k: 'msg', id: m.id },
            });
        });

        (rTrail.data || []).forEach(tr => {
            const nm  = tr.profiles ? (tr.profiles.full_name || (tr.profiles.email ? tr.profiles.email.split('@')[0] : '') || 'Staff') : 'Staff';
            const ttl = (tr.tasks && tr.tasks.title) || 'Task';
            const actLabel = _TRAIL_ACTION[tr.action || 'update'] || (tr.action || 'update');
            items.push({
                n: { id: 'trail:' + tr.id, message: 'Task ' + actLabel + ': ' + ttl, task_id: tr.task_id, created_at: tr.created_at, is_read: true },
                sender: nm, cat: 'tasks', cls: 'orange', badge: '📋 Task', emoji: '📋',
                act: tr.task_id ? { k: 'task', id: tr.task_id } : null,
            });
        });

        items.sort((a, b) => new Date(b.n.created_at) - new Date(a.n.created_at));
        return { items, unread: unreadIds.length };
    }

    // Unread notification count — the ONE canonical query for the bell badge on
    // both shells (Phase 7.4). user_id only (Phase 4.1): notifications are
    // per-user, and a stray tenant_id filter previously made web/mobile disagree.
    async function unreadCount(sb, uid) {
        try {
            const { count } = await sb.from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', uid).eq('is_read', false);
            return count || 0;
        } catch (e) { return 0; }
    }

    window.NFA_buildActivity = buildActivity;
    window.NFA_feedKind = kindOf;
    window.NFA_unreadCount = unreadCount;
})();
