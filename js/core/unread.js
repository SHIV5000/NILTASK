/**
 * SHARED unread engine — the ONE source of truth for message-unread (Phase 8).
 *
 * The app previously had three disagreeing unread systems: ephemeral
 * window.unreadCounts (realtime-only, wrong after reload/flap), the notifications
 * table (which send-push wrote per message, conflating messages with activity),
 * and room_reads (the CORRECT durable read-marker — written on every chat open
 * but never read back). This engine derives per-room unread from room_reads +
 * the messages table, so it survives reloads, realtime flaps and reconnects.
 *
 * Standard model (WhatsApp/Slack):
 *   • per-room message unread   = messages after your room_reads.last_read_at
 *   • bell / activity unread    = notifications.is_read=false (attention stream
 *                                 ONLY: mentions, reactions, replies, tasks) —
 *                                 computed by NFA_unreadCount (js/core/feed.js)
 *
 * Loaded as a classic script exposing window.NFA_*.
 */
(function () {
    'use strict';

    /**
     * Compute per-room message unread from room_reads + recent messages.
     * @param {object} opts { uid, tid, rooms?:Set<string>, window?:number }
     *   rooms  — optional allow-list of room ids to count (others ignored so
     *            non-member groups don't inflate the total). If omitted, all.
     *   window — how many recent messages to scan (default 500).
     * @returns {Promise<{perRoom:Object, total:number}>}
     */
    async function computeRoomUnread(sb, opts) {
        const { uid, tid, rooms = null, window: win = 1000 } = opts || {};
        const perRoom = {};
        if (!uid || !tid) return { perRoom, total: 0 };
        try {
            const [reads, msgs] = await Promise.all([
                sb.from('room_reads').select('room_id,last_read_at').eq('user_id', uid),
                sb.from('messages')
                    .select('id,room_id,created_at,sender_id')
                    .eq('tenant_id', tid).is('deleted_at', null)
                    .order('created_at', { ascending: false }).limit(win),
            ]);
            const marker = {};
            (reads.data || []).forEach(r => { marker[r.room_id] = new Date(r.last_read_at).getTime(); });
            (msgs.data || []).forEach(m => {
                if (m.sender_id === uid) return;                       // my own messages aren't unread
                if (rooms && !rooms.has(m.room_id)) return;            // outside the caller's room set
                const t = new Date(m.created_at).getTime();
                const seen = marker[m.room_id] || 0;                  // no marker → never opened → all unread
                if (t > seen) perRoom[m.room_id] = (perRoom[m.room_id] || 0) + 1;
            });
        } catch (e) { /* offline / RLS — return what we have */ }
        const total = Object.values(perRoom).reduce((a, b) => a + b, 0);
        return { perRoom, total };
    }

    window.NFA_computeRoomUnread = computeRoomUnread;
})();
