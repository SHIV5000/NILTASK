/**
 * SHARED reactions query core (Phase 7.3).
 *
 * Both shells fetched reactions with the same
 *   select('*').in('message_id', ids).eq('tenant_id', tid)
 * then grouped by message_id. Centralising the fetch keeps the tenant scoping
 * and grouping identical across web + mobile (the tenant filter is exactly the
 * kind of detail that drifted between shells before). Display grouping (counts,
 * "mine", chip order) stays per-shell — the two UIs differ.
 *
 * Loaded as a classic script exposing window.NFA_*.
 */
(function () {
    'use strict';

    /**
     * Fetch reactions for a set of message ids, grouped by message_id.
     * @returns {Promise<Object>} { [messageId]: Array<reactionRow> }
     */
    async function fetchReactions(sb, msgIds, tid, onError) {
        if (!Array.isArray(msgIds) || !msgIds.length) return {};
        const map = {};
        try {
            const { data, error } = await sb.from('reactions')
                .select('*').in('message_id', msgIds).eq('tenant_id', tid);
            if (error) { if (onError) onError(error); return map; }
            (data || []).forEach(r => {
                if (!map[r.message_id]) map[r.message_id] = [];
                // de-dupe (message_id, value, user_id)
                if (!map[r.message_id].find(x => x.value === r.value && x.user_id === r.user_id)) {
                    map[r.message_id].push(r);
                }
            });
        } catch (e) { if (onError) onError(e); }
        return map;
    }

    /**
     * Group one message's reaction rows for display.
     * @returns {Array<{value,type,count,mine}>}
     */
    function groupForDisplay(list, myUid) {
        const by = {};
        (list || []).forEach(r => {
            if (!by[r.value]) by[r.value] = { value: r.value, type: r.type, count: 0, mine: false };
            by[r.value].count++;
            if (r.user_id === myUid) by[r.value].mine = true;
        });
        return Object.values(by);
    }

    window.NFA_fetchReactions   = fetchReactions;
    window.NFA_groupReactions   = groupForDisplay;
})();
