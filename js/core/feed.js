/**
 * SHARED activity-feed core (Phase 7 pilot).
 *
 * The web shell (ui-feed.js) and the mobile shell (mobile.js) each had their own
 * copy of "fetch messages + task_trails + notifications, dedup, merge, sort".
 * That divergence is exactly what caused the class of "works on web, broken on
 * mobile" feed bugs. This module owns that logic once.
 *
 * Rendering stays per-shell; only the data pipeline is shared. The shell injects
 * its own name/room resolvers + snippet helper so the core needs no knowledge of
 * either shell's caches.
 *
 * Loaded as a classic script exposing window.NFA_*.
 */
(function () {
    'use strict';

    function kindOf(n) {
        const t = (n && n.type) || 'message';
        const msgAct = n && n.message_id ? { k: 'msg', id: n.message_id } : null;
        switch (t) {
            case 'task':     return { cat:'tasks', cls:'orange', badge:'📋 Task', emoji:'📋', act:n.task_id ? { k:'task', id:n.task_id } : null };
            case 'reminder': return { cat:'reminders', cls:'green', badge:'⏰ Reminder', emoji:'⏰', act:msgAct };
            case 'reply':    return { cat:'chats', cls:'blue', badge:'↩ Reply', emoji:'↩', act:msgAct };
            case 'reaction': return { cat:'chats', cls:'blue', badge:'❤️ Reaction', emoji:'❤️', act:msgAct };
            case 'mention':  return { cat:'chats', cls:'purple', badge:'📣 Mention', emoji:'📣', act:msgAct };
            default:         return { cat:'chats', cls:'blue', badge:'💬 Message', emoji:'💬', act:msgAct };
        }
    }

    const _TRAIL_ACTION = {
        created:'assigned', accepted:'completed', submitted:'submitted', update:'updated',
        delegate:'delegated', transfer:'transferred', review:'reviewed'
    };

    async function buildActivity(sb, opts) {
        const {
            uid, tid,
            resolveName = id => id || '',
            resolveRoom = rid => rid || '',
            snippet = h => String(h || ''),
            limitNotif = 80, limitMsg = 60, limitTrail = 30,
            markRead = true, logError = null,
        } = opts || {};

        const [rNotif, rMsg, rTrail] = await Promise.all([
            sb.from('notifications')
                .select('id,type,message,message_id,task_id,created_at,is_read')
                .eq('user_id', uid)
                .order('created_at', { ascending:false }).limit(limitNotif),
            sb.from('messages')
                .select('id,created_at,room_id,sender_id,text,parent_message_id')
                .eq('tenant_id', tid).is('deleted_at', null)
                .order('created_at', { ascending:false }).limit(limitMsg),
            sb.from('task_trails')
                .select('id,created_at,action,task_id,comment,tasks(title),profiles(full_name,email)')
                .eq('tenant_id', tid)
                .order('created_at', { ascending:false }).limit(limitTrail),
        ]);

        const notifs = rNotif.data || [];
        if (rNotif.error && logError) logError('notifications.select[feed]', { error:rNotif.error });

        const unreadIds = notifs.filter(n => !n.is_read).map(n => n.id);
        if (markRead && unreadIds.length) {
            sb.from('notifications').update({ is_read:true }).in('id', unreadIds).then(() => {});
        }

        const senderById = {};
        (rMsg.data || []).forEach(m => { senderById[m.id] = m.sender_id; });
        try {
            const need = notifs.filter(n => n.message_id && !(n.message_id in senderById)).map(n => n.message_id);
            if (need.length) {
                const { data:msgs } = await sb.from('messages').select('id,sender_id').in('id', need);
                (msgs || []).forEach(m => { senderById[m.id] = m.sender_id; });
            }
        } catch (e) {}
        const senderOf = n => {
            const sid = n.message_id ? senderById[n.message_id] : null;
            return sid ? (resolveName(sid) || '') : '';
        };

        const notifMsgIds = new Set(notifs.map(n => n.message_id).filter(Boolean));
        const items = [];
        notifs.forEach(n => items.push({ n, sender:senderOf(n), ...kindOf(n) }));

        (rMsg.data || []).forEach(m => {
            if (notifMsgIds.has(m.id)) return;
            const mine = m.sender_id === uid;
            const label = resolveRoom(m.room_id);
            const text = snippet(m.text, 60) || 'Attachment';
            const title = (m.parent_message_id ? 'Reply' : 'Message') +
                (label ? (' in ' + label) : '') + ' — ' + text;
            items.push({
                n:{ id:'msg:' + m.id, message:title, message_id:m.id, created_at:m.created_at, is_read:true },
                sender:mine ? '' : resolveName(m.sender_id), cat:'chats', cls:'blue',
                badge:m.parent_message_id ? '↩ Reply' : '💬 Message', emoji:'💬', act:{ k:'msg', id:m.id },
            });
        });

        (rTrail.data || []).forEach(tr => {
            const name = tr.profiles
                ? (tr.profiles.full_name || (tr.profiles.email ? tr.profiles.email.split('@')[0] : '') || 'Staff')
                : 'Staff';
            const title = (tr.tasks && tr.tasks.title) || 'Task';
            const actionLabel = _TRAIL_ACTION[tr.action || 'update'] || (tr.action || 'update');
            items.push({
                n:{ id:'trail:' + tr.id, message:'Task ' + actionLabel + ': ' + title, task_id:tr.task_id, created_at:tr.created_at, is_read:true },
                sender:name, cat:'tasks', cls:'orange', badge:'📋 Task', emoji:'📋',
                act:tr.task_id ? { k:'task', id:tr.task_id } : null,
            });
        });

        items.sort((a, b) => new Date(b.n.created_at) - new Date(a.n.created_at));
        return { items, unread:unreadIds.length };
    }

    // Keep the last successful attention count PER USER. A single global fallback
    // could briefly show the previous account's count after logout/login if the first
    // query for the new account failed. Per-user state preserves resilience without
    // allowing cross-account badge carry-over.
    const _lastUnreadByUser = new Map();
    async function unreadCount(sb, uid) {
        if (!uid) return 0;
        const previous = _lastUnreadByUser.get(uid) || 0;
        try {
            // Count only notification types not already represented by room unread.
            // message/reply/mention link to real chat messages and would otherwise be
            // counted twice; reaction/task/reminder remain attention-only.
            const { count, error } = await sb.from('notifications')
                .select('*', { count:'exact', head:true })
                .eq('user_id', uid).eq('is_read', false)
                .not('type', 'in', '(reply,mention,message)');
            if (error) return previous;
            const next = count || 0;
            _lastUnreadByUser.set(uid, next);
            return next;
        } catch (e) {
            return previous;
        }
    }

    window.NFA_buildActivity = buildActivity;
    window.NFA_feedKind = kindOf;
    window.NFA_unreadCount = unreadCount;
})();