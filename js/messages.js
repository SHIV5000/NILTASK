import { sb } from './shared.js';
import logger from './utils/logger.js';

// v1.58.0 - Edit/Forward/Delete, Reply+Reaction notifications, Broadcast reactions

window.sendMessage = async function() {
    // Check trial expiry
    if (window._trialExpired) {
        window.showCenterToast('Trial expired — contact developer to upgrade','fa-solid fa-circle-xmark','text-red-500');
        return;
    }
    let text = window.quillEditor.root.innerHTML.trim();
    text = text.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if (!text) return;

    // Block bare URL pasting — use the Link button instead
    // Only block if no Quill-managed links already present in the HTML
    const hasQuillLinks = text.includes('link-pill.local') || text.includes('secure-file.local') || text.includes('<a href=');
    if (!hasQuillLinks) {
        const plainText = window.stripHtml ? window.stripHtml(text) : text;
        if (/https?:\/\/[^\s]{4,}/i.test(plainText)) {
            window.showCenterToast('Please use the Link button to insert URLs', 'fa-solid fa-link', 'text-indigo-400');
            return;
        }
    }

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.innerHTML = '<i class="ti ti-loader fa-spin text-lg"></i>';

    // ── Resolve the actual room_id to store.
    // For DMs, currentRoom is "dm_<other_user_id>" (from clicking sidebar).
    // We must resolve to canonical "dm_<sorted_ids>" so both parties share the same room.
    let roomId = window.currentRoom;
    let recipientId = null;
    if (window.currentRoom.startsWith('dm_') && !window.currentRoom.includes('_', 3)) {
        // Old format: dm_<single_uuid> — convert to canonical
        recipientId = window.currentRoom.replace('dm_', '');
        if (typeof window.getDmRoomId === 'function') {
            roomId = window.getDmRoomId(recipientId);
            window.currentRoom = roomId; // update current room to canonical
            localStorage.setItem('mpgs_current_room', roomId);
        }
    } else if (window.currentRoom.startsWith('dm_')) {
        // Already canonical dm_<id1>_<id2> — extract recipient
        const parts = window.currentRoom.replace('dm_', '').split('_');
        // parts has two UUIDs joined — find the one that is not current user
        // UUIDs contain hyphens so split on _ won't work cleanly; use indexOf instead
        const withoutPrefix = window.currentRoom.replace('dm_', '');
        const meId = window.currentUser.id;
        recipientId = withoutPrefix.replace(meId, '').replace(/^_|_$/g, '');
    }

    let payload = {
        room_id:   roomId,
        sender_id: window.currentUser.id,
        tenant_id: window.currentTenantId,
        text,
        created_at: new Date().toISOString()
    };

    if (window.currentlyReplyingTo) {
        payload.parent_message_id = window.currentlyReplyingTo;
        window.pendingScrollId = window.currentlyReplyingTo;
    } else {
        window.pendingScrollId = 'BOTTOM';
    }

    logger.logAction('sendMessage', { room: window.currentRoom });
    const _t0 = performance.now();
    const { data: msgData } = await sb.from('messages').insert(payload).select().single();
    logger.logApi('messages.insert', { room: window.currentRoom }, performance.now() - _t0);

    // ── Notify original author when someone replies to their message
    if (window.currentlyReplyingTo && msgData) {
        try {
            const { data: parentMsg } = await sb.from('messages').select('sender_id').eq('id', window.currentlyReplyingTo).single();
            if (parentMsg && parentMsg.sender_id !== window.currentUser.id) {
                const myName = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'Someone';
                const cleanReply = window.stripHtml ? window.stripHtml(text).substring(0,60) : text.substring(0,60);
                await window.notifyUser(parentMsg.sender_id, `↩ Reply from ${myName}: ${cleanReply}`, msgData.id, 'message');
            }
        } catch(e) {}
    }

    // ── DM: notify recipient so they get toast + badge + sound even if not in room
    if (recipientId && msgData) {
        const senderName = window.currentUser?.user_metadata?.full_name ||
                           window.currentUser?.email?.split('@')[0] || 'Someone';
        const cleanText = window.stripHtml ? window.stripHtml(text) : text;
        await window.notifyUser(
            recipientId,
            `💬 ${senderName}: ${cleanText.substring(0, 60)}`,
            msgData.id,
            'message'
        );
    }

    // Play sent sound
    if (typeof window.playSound === 'function') window.playSound('message');

    window.quillEditor.root.innerHTML = '';
    window.cancelReply();
    if (sendBtn) sendBtn.innerHTML = '<i class="ti ti-send text-lg"></i>';

    // Optimistic append — show new message immediately without re-rendering whole list.
    // Supabase Realtime doesn't echo INSERTs back to the sender, and full loadMessages()
    // causes all rows to re-animate (flicker). Append only the new row instead.
    if (msgData) {
        // Keep _roomMsgs in sync so any subsequent renderMessages() includes this message
        if (!Array.isArray(window._roomMsgs)) window._roomMsgs = [];
        if (!window._roomMsgs.find(m => m.id === msgData.id)) window._roomMsgs.push(msgData);

        const container = document.getElementById('chatShellContainer');
        if (container) {
            const newId  = msgData.id;
            const newTime = window.getISTTime ? window.getISTTime(msgData.created_at) : new Date(msgData.created_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
            const nameInitial = (window.currentUser?.user_metadata?.full_name || window.currentUser?.email || 'Y').charAt(0).toUpperCase();
            const roleStr = window.currentDesignation || window.currentRoleName || 'Staff';
            const snippetText = window.getSnippet ? window.getSnippet(text) : text.replace(/<[^>]*>/g,'').substring(0,50);
            const escapedSnippet = snippetText.replace(/'/g,"\\'").replace(/"/g,'&quot;');

            // Apply link-pill and secure-file transforms so the message renders correctly
            let displayHtml = text.replace(
                /<a\s+href="https:\/\/secure-file\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
                (match, path, anchorText) => {
                    const ext = (path.split('.').pop()||'').toLowerCase().split('?')[0];
                    const nameRaw = anchorText.replace(/^📁\s*/,'').trim();
                    const sizeMatch = nameRaw.match(/\(([^)]+)\)$/);
                    const sizePart = sizeMatch ? sizeMatch[1] : '';
                    const displayName = nameRaw.replace(/\s*\([^)]+\)$/,'').trim()||'Attached File';
                    let icon='fa-file',iconColor='#6b7280',bg='#f9fafb',typeLabel='File';
                    if (ext==='pdf'){icon='fa-file-pdf';iconColor='#dc2626';bg='#fef2f2';typeLabel='PDF';}
                    else if(['doc','docx'].includes(ext)){icon='fa-file-word';iconColor='#2563eb';bg='#eff6ff';typeLabel='Word';}
                    else if(['xls','xlsx'].includes(ext)){icon='fa-file-excel';iconColor='#16a34a';bg='#f0fdf4';typeLabel='Excel';}
                    else if(['jpg','jpeg','png','gif','webp','svg'].includes(ext)){icon='fa-file-image';iconColor='#7c3aed';bg='#f5f3ff';typeLabel='Image';}
                    const safePath = path.replace(/'/g,'%27');
                    return `<div onclick="window.openSecureFile('${safePath}')" class="file-card" style="background:${bg};border:1px solid ${iconColor}25;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"><div style="width:38px;height:38px;border-radius:8px;background:${iconColor}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid ${icon}" style="color:${iconColor};font-size:20px;"></i></div><div style="min-width:0;flex:1;"><div style="font-size:12px;font-weight:700;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;">${displayName}</div><div style="font-size:10px;display:flex;gap:6px;align-items:center;margin-top:1px;"><span style="font-weight:700;color:${iconColor};">${typeLabel}</span>${sizePart?`<span style="color:#9ca3af;">${sizePart}</span>`:''}</div></div><div style="font-size:10px;font-weight:700;color:${iconColor};white-space:nowrap;display:flex;align-items:center;gap:3px;"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;"></i> Open</div></div>`;
                }
            ).replace(
                /<a\s+href="https:\/\/link-pill\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
                (match, encoded, anchorText) => {
                    try {
                        const decoded = decodeURIComponent(encoded);
                        const sepIdx  = decoded.indexOf('|||');
                        const name    = sepIdx > -1 ? decoded.substring(0, sepIdx) : (anchorText||decoded);
                        const url     = sepIdx > -1 ? decoded.substring(sepIdx+3) : decoded;
                        const isFile  = /\.(pdf|doc|docx|xlsx|xls|ppt|pptx|zip|rar|png|jpg|jpeg|gif|mp4|mp3)$/i.test(url.split('?')[0]);
                        const label   = isFile ? 'Click to Download' : 'Click to Visit';
                        const icon    = isFile ? 'fa-download' : 'fa-arrow-up-right-from-square';
                        const safeUrl = url.replace(/'/g,'%27');
                        return `<a href="javascript:void(0);" onclick="window.open('${safeUrl}','_blank')" title="${url}" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer;margin:2px 0;box-shadow:0 2px 8px rgba(99,102,241,0.35);white-space:nowrap;vertical-align:middle;"><i class="fa-solid ${icon}" style="font-size:9px;"></i><span>${name}</span><span style="font-size:9px;opacity:0.75;border-left:1px solid rgba(255,255,255,0.35);padding-left:7px;margin-left:3px;">${label}</span></a>`;
                    } catch(e) { return match; }
                }
            );

            const optimisticRow = `<div class="row-sent transition-colors" id="row-${newId}">
  <div class="bubble sent">
    <div class="b-header">
      <div class="b-avatar sent-av">${nameInitial}</div>
      <div class="b-name">You <span class="b-role">· ${roleStr}</span></div>
      <span class="b-time">${newTime} <span class="b-tick">✓✓</span></span>
      <div class="menu-wrap">
        <button class="dot-btn" onclick="window.toggleDropdown('dd-${newId}')" aria-label="Options"><i class="ti ti-dots-vertical"></i></button>
        <div class="bubble-dropdown" id="dd-${newId}">
          <button class="dd-item rbac-create-task" onclick="window.closeDropdowns();window.openTaskModal('${newId}','${escapedSnippet}')"><i class="ti ti-clipboard-check"></i>Create Task</button>
          <button class="dd-item" onclick="window.closeDropdowns();window.showReminderModal('${newId}','${escapedSnippet}')"><i class="ti ti-bell"></i>Reminder</button>
          <button class="dd-item" onclick="window.closeDropdowns();window.startEditMessage('${newId}')"><i class="ti ti-edit"></i>Edit</button>
          <button class="dd-item" onclick="window.closeDropdowns();window.openForwardModal('${newId}','${escapedSnippet}','You')"><i class="ti ti-share"></i>Forward</button>
          <button class="dd-item danger" onclick="window.closeDropdowns();window.deleteMessage('${newId}')"><i class="ti ti-trash"></i>Delete</button>
        </div>
      </div>
    </div>
    <div class="b-text">${displayHtml}</div>
    <div class="b-footer" id="footer-${newId}">
      <div class="relative inline-block group/reaction">
        <button class="e-add" title="Add reaction" onclick="window._showReactionPicker('${newId}',this)"><i class="ti ti-mood-smile"></i></button>
      </div>
    </div>
    <div class="b-actions">
      <button class="act-btn" onclick="window.initiateReply('${newId}','${escapedSnippet}')"><i class="ti ti-corner-up-left"></i> Reply</button>
      <button class="act-btn" onclick="window.toggleBookmark('${newId}')"><i class="ti ti-bookmark"></i> Bookmark</button>
    </div>
  </div>
</div>`;
            container.insertAdjacentHTML('beforeend', optimisticRow);
            if (typeof window.applyRBAC === 'function') window.applyRBAC();
            const mc = document.getElementById('messagesContainer');
            if (mc) mc.scrollTop = mc.scrollHeight;
        }
    }
};

window.loadMessages = async function() {
    const PAGE = 50;
    const cacheKey = 'msgcache_' + window.currentRoom;

    // Reset render-dedup key so a new room always gets a fresh render
    window._prevRenderedIds = '';

    // Restore last-read position — set pendingScrollId so the existing glow+scroll logic fires
    // Only if not already set (explicit reply-scroll or cross-room link takes priority)
    if (!window.pendingScrollId) {
        const saved = localStorage.getItem('lastread_' + window.currentRoom);
        if (saved) window.pendingScrollId = saved;
    }

    // Show cached messages instantly while network fetch runs in background
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const cachedMsgs = JSON.parse(cached);
            if (cachedMsgs?.length) {
                window._roomMsgs = cachedMsgs;
                window._oldestMsgTs = cachedMsgs[0]?.created_at || null;
                window._allMsgsLoaded = false;
                window._prevRenderedIds = cachedMsgs.map(m => m.id).join(',');
                window.renderMessages(cachedMsgs);
                const mc = document.getElementById('messagesContainer');
                if (mc) mc.scrollTop = mc.scrollHeight;
            }
        } catch(e) {}
    }

    // Fetch messages and bookmarks in parallel — saves one sequential round-trip
    const _t1 = performance.now();
    const roomAtStart = window.currentRoom;
    const [{ data: msgs }, { data: bms }] = await Promise.all([
        sb.from('messages')
            .select('*')
            .eq('room_id', window.currentRoom)
            .eq('tenant_id', window.currentTenantId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(PAGE),
        sb.from('bookmarks')
            .select('message_id')
            .eq('user_id', window.currentUser.id)
            .eq('tenant_id', window.currentTenantId)
    ]);
    logger.logApi('messages.select', { room: window.currentRoom, count: msgs?.length }, performance.now() - _t1);

    // Discard results if user switched rooms while we were fetching
    if (window.currentRoom !== roomAtStart) return;

    // Enrich messages with sender profiles from in-memory cache — no SQL JOIN needed
    const usersMap = new Map((window.globalUsersCache || []).map(u => [u.id, u]));
    const allMsgs = (msgs || []).reverse().map(m => ({
        ...m,
        profiles: usersMap.get(m.sender_id) || null
    }));
    window._roomMsgs = allMsgs;
    window._oldestMsgTs = allMsgs[0]?.created_at || null;
    window._allMsgsLoaded = !msgs || msgs.length === 0 || msgs.length < PAGE;
    window._loadingOlder = false;
    window.bookmarkedSet = new Set(bms?.map(b => b.message_id) || []);

    // Persist to localStorage cache (last 50, lightweight — no profiles nested)
    if (allMsgs.length) {
        try {
            const slim = allMsgs.map(m => ({ ...m, profiles: undefined }));
            localStorage.setItem(cacheKey, JSON.stringify(slim.slice(-50)));
        } catch(e) {} // quota exceeded — not fatal
    }

    // Render immediately — reactions load in background and patch without full re-render
    const c = document.getElementById('messagesContainer');
    const isNearBottom = c ? (c.scrollHeight - c.scrollTop - c.clientHeight < 150) : false;

    window.reactionsCache = {};
    window.removedReactions = window.removedReactions || new Set();
    // Merge localStorage reactions so they show instantly before DB fetch completes
    try {
        const myRx = JSON.parse(localStorage.getItem('myreactions_' + window.currentRoom) || '[]');
        myRx.forEach(r => {
            if (!window.reactionsCache[r.message_id]) window.reactionsCache[r.message_id] = [];
            if (!window.reactionsCache[r.message_id].find(c => c.value === r.value && c.user_id === r.user_id))
                window.reactionsCache[r.message_id].push(r);
        });
    } catch(e) {}

    // Skip re-render if DB returned the same messages already shown from cache
    const newIds = allMsgs.map(m => m.id).join(',');
    if (newIds !== window._prevRenderedIds) {
        window._prevRenderedIds = newIds;
        window.renderMessages(allMsgs);
        if (typeof window.applyFilters === 'function') window.applyFilters();
    }

    // Fetch reactions in background — patch footers without clearing the whole list
    const msgIds = allMsgs.map(m => m.id);
    if (msgIds.length) {
        sb.from('reactions').select('*').in('message_id', msgIds).eq('tenant_id', window.currentTenantId)
            .then(({ data: rData }) => {
                if (window.currentRoom !== roomAtStart) return;
                (rData || []).forEach(r => {
                    if (window.removedReactions.has(r.message_id + '|' + r.value + '|' + r.user_id)) return;
                    if (!window.reactionsCache[r.message_id]) window.reactionsCache[r.message_id] = [];
                    if (!window.reactionsCache[r.message_id].find(x => x.value === r.value && x.user_id === r.user_id))
                        window.reactionsCache[r.message_id].push(r);
                });
                // Patch only the reaction footer of each message — no full re-render
                if (typeof window._patchReactionFooters === 'function') window._patchReactionFooters(msgIds);
            }).catch(() => {});
    }

    // Attach scroll listener — paging + last-read tracking
    if (c) {
        c.onscroll = function() {
            if (c.scrollTop < 120 && !window._loadingOlder && !window._allMsgsLoaded) {
                window._loadOlderMsgs();
            }
            // Track last-read: last row whose top edge is above the visible bottom
            const rows = document.querySelectorAll('#chatShellContainer [id^="row-"]');
            const visibleBottom = c.scrollTop + c.clientHeight;
            let lastVisible = null;
            rows.forEach(row => {
                if (row.offsetTop <= visibleBottom) lastVisible = row.id.slice(4); // strip "row-"
            });
            if (lastVisible) {
                try { localStorage.setItem('lastread_' + window.currentRoom, lastVisible); } catch(e) {}
            }
        };
    }

    if (c) {
        setTimeout(() => {
            if (window.pendingScrollId && window.pendingScrollId !== 'BOTTOM') {
                const row = document.getElementById(`row-${window.pendingScrollId}`);
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const bubble = row.querySelector('.bubble');
                    if (bubble) {
                        bubble.classList.add('glow-target');
                        setTimeout(() => bubble.classList.add('active-glow'), 50);
                        setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 4000);
                    }
                }
                window.pendingScrollId = null;
            } else if (window.pendingScrollId === 'BOTTOM') {
                c.scrollTop = c.scrollHeight;
                window.pendingScrollId = null;
            } else if (isNearBottom) {
                c.scrollTop = c.scrollHeight;
            }
        }, 100);
    }
};

window._loadOlderMsgs = async function() {
    if (window._loadingOlder || window._allMsgsLoaded || !window._oldestMsgTs) return;
    window._loadingOlder = true;
    const loader = document.getElementById('__olderMsgsLoader');
    if (loader) {
        loader.style.display = 'flex';
        loader.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--text-secondary);font-size:11px;"></i><span style="font-size:11px;color:var(--text-secondary);margin-left:6px;">Loading older messages…</span>';
    }

    const PAGE = 50;
    const { data: olderRaw } = await sb.from('messages')
        .select('*')
        .eq('room_id', window.currentRoom)
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .lt('created_at', window._oldestMsgTs)
        .order('created_at', { ascending: false })
        .limit(PAGE);

    // Enrich with profiles from in-memory cache
    const _olderMap = new Map((window.globalUsersCache || []).map(u => [u.id, u]));
    const older = olderRaw?.map(m => ({ ...m, profiles: _olderMap.get(m.sender_id) || null }));

    if (older && older.length) {
        const olderChron = older.reverse();
        window._oldestMsgTs = olderChron[0].created_at;
        window._allMsgsLoaded = older.length < PAGE;
        window._roomMsgs = [...olderChron, ...(window._roomMsgs || [])];

        const newIds = olderChron.map(m => m.id);
        try {
            const { data: rData } = await sb.from('reactions').select('*').in('message_id', newIds).eq('tenant_id', window.currentTenantId);
            (rData || []).forEach(r => {
                if (window.removedReactions?.has(r.message_id + '|' + r.value + '|' + r.user_id)) return;
                if (!window.reactionsCache[r.message_id]) window.reactionsCache[r.message_id] = [];
                window.reactionsCache[r.message_id].push(r);
            });
        } catch(e) {}

        const mc = document.getElementById('messagesContainer');
        const prevScrollHeight = mc ? mc.scrollHeight : 0;
        window.renderMessages(window._roomMsgs);
        if (mc) mc.scrollTop = mc.scrollHeight - prevScrollHeight;
    } else {
        window._allMsgsLoaded = true;
        if (loader) {
            loader.style.display = 'flex';
            loader.innerHTML = '<span style="font-size:11px;color:var(--text-secondary);">— Beginning of chat —</span>';
        }
    }
    window._loadingOlder = false;
};

window.renderMessages = function(messages) {
    const c = document.getElementById('chatShellContainer');
    if (!c) return;
    if (!messages.length) {
        c.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="ti ti-messages text-5xl mb-3 text-gray-300"></i><p class="font-medium text-gray-500">Say hello!</p></div>';
        return;
    }

    window.bookmarkedSet = window.bookmarkedSet || new Set();

    const msgMap = new Map();
    messages.forEach(m => msgMap.set(m.id, m));
    const topLevel = [];
    const replies = {};

    messages.forEach(msg => {
        if (msg.parent_message_id) {
            let rootId = msg.parent_message_id;
            const visited = new Set();
            while (msgMap.has(rootId) && msgMap.get(rootId).parent_message_id) {
                if (visited.has(rootId)) break;
                visited.add(rootId);
                rootId = msgMap.get(rootId).parent_message_id;
            }
            if (!replies[rootId]) replies[rootId] = [];
            replies[rootId].push(msg);
        } else {
            topLevel.push(msg);
        }
    });

    function buildMsgHTML(msg) {
        const isSent = msg.sender_id === window.currentUser.id;
        const senderName = isSent ? 'You' : window.toSentenceCase(msg.profiles?.full_name || msg.profiles?.email.split('@')[0] || 'Unknown');
        const time = window.getISTTime(msg.created_at);
        const snippetText = window.getSnippet(msg.text);

        // ── Transform secure-file links to styled file cards ────────────────────
        let displayHtml = msg.text.replace(
            /<a\s+href="https:\/\/secure-file\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
            (match, path, anchorText) => {
                const ext = (path.split('.').pop() || '').toLowerCase().split('?')[0];
                const nameRaw = anchorText.replace(/^📁\s*/, '').trim();
                const sizeMatch = nameRaw.match(/\(([^)]+)\)$/);
                const sizePart = sizeMatch ? sizeMatch[1] : '';
                const displayName = nameRaw.replace(/\s*\([^)]+\)$/, '').trim() || 'Attached File';
                // Icon + color per file type
                let icon='fa-file', iconColor='#6b7280', bg='#f9fafb', typeLabel='File';
                if (ext==='pdf') { icon='fa-file-pdf'; iconColor='#dc2626'; bg='#fef2f2'; typeLabel='PDF'; }
                else if (['doc','docx'].includes(ext)) { icon='fa-file-word'; iconColor='#2563eb'; bg='#eff6ff'; typeLabel='Word'; }
                else if (['xls','xlsx'].includes(ext)) { icon='fa-file-excel'; iconColor='#16a34a'; bg='#f0fdf4'; typeLabel='Excel'; }
                else if (['ppt','pptx'].includes(ext)) { icon='fa-file-powerpoint'; iconColor='#ea580c'; bg='#fff7ed'; typeLabel='PowerPoint'; }
                else if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) { icon='fa-file-image'; iconColor='#7c3aed'; bg='#f5f3ff'; typeLabel='Image'; }
                const safePath = path.replace(/'/g, '%27');
                return `<div onclick="window.openSecureFile('${safePath}')"
                    class="file-card"
                    style="background:${bg};border:1px solid ${iconColor}25;"
                    onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                    <div style="width:38px;height:38px;border-radius:8px;background:${iconColor}15;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fa-solid ${icon}" style="color:${iconColor};font-size:20px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:12px;font-weight:700;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px;">${displayName}</div>
                        <div style="font-size:10px;display:flex;gap:6px;align-items:center;margin-top:1px;">
                            <span style="font-weight:700;color:${iconColor};">${typeLabel}</span>
                            ${sizePart ? `<span style="color:#9ca3af;">${sizePart}</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size:10px;font-weight:700;color:${iconColor};white-space:nowrap;display:flex;align-items:center;gap:3px;">
                        <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:9px;"></i> Open
                    </div>
                </div>`;
            }
        );

        // ── Transform link-pill URLs into beautiful styled buttons ────────────
        // Quill stores these as <a href="https://link-pill.local/ENCODED">NAME</a>
        displayHtml = displayHtml.replace(
            /<a\s+href="https:\/\/link-pill\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
            (match, encoded, anchorText) => {
                try {
                    const decoded = decodeURIComponent(encoded);
                    const sepIdx  = decoded.indexOf('|||');
                    const name    = sepIdx > -1 ? decoded.substring(0, sepIdx) : (anchorText || decoded);
                    const url     = sepIdx > -1 ? decoded.substring(sepIdx + 3) : decoded;
                    // Detect file vs web link
                    const fileExts = /\.(pdf|doc|docx|xlsx|xls|ppt|pptx|zip|rar|png|jpg|jpeg|gif|mp4|mp3)$/i;
                    const isFile   = fileExts.test(url.split('?')[0]);
                    const label    = isFile ? 'Click to Download' : 'Click to Visit';
                    const icon     = isFile ? 'fa-download' : 'fa-arrow-up-right-from-square';
                    const safeUrl  = url.replace(/'/g, '%27');
                    return `<a href="javascript:void(0);"
                        onclick="window.open('${safeUrl}','_blank')"
                        title="${url}"
                        style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer;margin:2px 0;box-shadow:0 2px 8px rgba(99,102,241,0.35);white-space:nowrap;vertical-align:middle;">
                        <i class="fa-solid ${icon}" style="font-size:9px;"></i>
                        <span>${name}</span>
                        <span style="font-size:9px;opacity:0.75;border-left:1px solid rgba(255,255,255,0.35);padding-left:7px;margin-left:3px;">${label}</span>
                    </a>`;
                } catch(e) {
                    return match; // fallback to original if decode fails
                }
            }
        );

        const rowClass = isSent ? 'row-sent' : 'row-rcvd';
        const bubbleClass = isSent ? 'bubble sent' : 'bubble rcvd';
        const avClass = isSent ? 'b-avatar sent-av' : 'b-avatar rcvd-av';
        const avatarInitial = senderName.charAt(0).toUpperCase();
        const sentAvUrl = window._userAvatarUrl || localStorage.getItem('mpgs_avatar_' + window.currentUser.id) || '';
        const rcvdAvUrl = msg.profiles?.avatar_url || '';
        const avatarUrl = isSent ? sentAvUrl : rcvdAvUrl;
        const avatarHTML = avatarUrl
            ? `<div class="${avClass}" style="overflow:hidden;padding:0;background:transparent;"><img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='')"><span style="display:none">${avatarInitial}</span></div>`
            : `<div class="${avClass}">${avatarInitial}</div>`;
        const rawRole = msg.profiles?.designation || msg.profiles?.role || 'Staff';
        const roleStr = isSent ? (window.currentDesignation || window.currentRoleName || 'Staff')
            : rawRole.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
        const tickHTML = isSent ? `<span class="b-tick">✓✓</span>` : '';
        const replyCount = replies[msg.id] ? replies[msg.id].length : 0;
        const isBookmarked = window.bookmarkedSet.has(msg.id);

        // Create Task visible only to non-teachers and only if tasks_enabled
        const createTaskBtn = `<button class="dd-item rbac-create-task" onclick="window.closeDropdowns(); window.openTaskModal('${msg.id}', '${window.escapeHtml(msg.text)}')"><i class="ti ti-clipboard-check"></i>Create Task</button>`;

        const ddItems = isSent
            ? `${createTaskBtn}
               <button class="dd-item" onclick="window.closeDropdowns(); window.showReminderModal('${msg.id}', '${snippetText}')"><i class="ti ti-bell"></i>Reminder</button>
               <button class="dd-item" onclick="window.closeDropdowns(); window.startEditMessage('${msg.id}')"><i class="ti ti-edit"></i>Edit</button>
               <button class="dd-item" onclick="window.closeDropdowns(); window.openForwardModal('${msg.id}', '${snippetText}', '${window.escapeHtml(senderName)}')"><i class="ti ti-share"></i>Forward</button>
               <button class="dd-item danger" onclick="window.closeDropdowns(); window.deleteMessage('${msg.id}')"><i class="ti ti-trash"></i>Delete</button>`
            : `${createTaskBtn}
               <button class="dd-item" onclick="window.closeDropdowns(); window.showReminderModal('${msg.id}', '${snippetText}')"><i class="ti ti-bell"></i>Reminder</button>
               <button class="dd-item" onclick="window.closeDropdowns(); window.openForwardModal('${msg.id}', '${snippetText}', '${window.escapeHtml(senderName)}')"><i class="ti ti-share"></i>Forward</button>`;

        let repliesHTML = '';
        if (replyCount > 0) {
            repliesHTML = `
            <div class="b-divider"></div>
            <div class="replies-wrap" id="rw-${msg.id}" style="display:flex;flex-direction:column;gap:2px;">
              <div class="replies-label"><i class="ti ti-git-branch"></i>Replies</div>
              ${replies[msg.id].map((r, idx) => {
                  const rName = window.toSentenceCase(r.profiles?.full_name || r.profiles?.email.split('@')[0] || 'Unknown');
                  const rTime = window.getISTTime(r.created_at);
                  const rDisplayHtml = r.text.replace(/href="https:\/\/secure-file\.local\/([^"]+)"/g,
                      `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium"`);
                  return `<div class="reply-item">
                    <div class="reply-num">${idx + 1}</div>
                    <div class="reply-body">
                      <div class="reply-meta">
                        <span class="reply-name">${window.escapeHtml(rName)}</span>
                        <span class="reply-role">Teacher</span>
                        <span class="reply-time">${rTime}</span>
                      </div>
                      <div class="reply-text">${rDisplayHtml}</div>
                    </div>
                  </div>`;
              }).join('')}
            </div>`;
        }

        // Build persisted reactions HTML — WhatsApp style: only your own reaction is removable
        const msgReactions = window.reactionsCache?.[msg.id] || [];
        const rGroups = {};
        msgReactions.forEach(r => {
            if (!rGroups[r.value]) rGroups[r.value] = { count:0, type:r.type, mine:false };
            rGroups[r.value].count += (r.count||1);
            if (r.user_id && r.user_id !== '_rt_' && r.user_id === window.currentUser?.id) rGroups[r.value].mine = true;
        });
        const tagColorMap = {
            'Thank You':'bg-green-50 text-green-700 border-green-200',
            'Noted':'bg-blue-50 text-blue-700 border-blue-200',
            'Copied':'bg-purple-50 text-purple-700 border-purple-200',
            'Yes Sir':'bg-orange-50 text-orange-700 border-orange-200',
            'Yes Madam':'bg-pink-50 text-pink-700 border-pink-200'
        };
        const persistedReactionsHTML = Object.entries(rGroups).map(([val, info]) => {
            if (info.type === 'emoji') {
                const chipClass = info.mine ? 'e-chip active mine' : 'e-chip active';
                const title = info.mine ? 'Click to remove your reaction' : val;
                const onclick = info.mine ? `window.applyReaction('${msg.id}','${val}','emoji')` : '';
                const cursor = info.mine ? 'cursor:pointer;' : 'cursor:default;';
                return `<button class="${chipClass}" data-emoji="${val}" ${onclick ? `onclick="${onclick}"` : ''} title="${title}" style="${cursor}">${val} <span class="e-cnt">${info.count}</span>${info.mine ? '<span class="chip-remove">✕</span>' : ''}</button>`;
            } else {
                const tagBase = tagColorMap[val] || 'bg-blue-50 text-blue-700 border-blue-200';
                const tagClass = tagBase + (info.mine ? ' mine' : '');
                const title = info.mine ? 'Click to remove your tag' : val;
                const onclick = info.mine ? `onclick="window.applyReaction('${msg.id}','${val}','tag')"` : '';
                const cursor = info.mine ? 'cursor:pointer;' : 'cursor:default;';
                return `<span class="${tagClass} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ml-1" data-tag="${val}" ${onclick} title="${title}" style="${cursor}">${val}${info.mine ? '<span class="chip-remove">✕</span>' : ''}</span>`;
            }
        }).join('');

        return `
        <div class="${rowClass} transition-colors" id="row-${msg.id}">
          <div class="${bubbleClass}">
            <div class="b-header">
              ${avatarHTML}
              <div class="b-name">${window.escapeHtml(senderName)} <span class="b-role">· ${roleStr}</span></div>
              <span class="b-time">${time}${msg.updated_at && msg.updated_at > msg.created_at ? ' <span style="font-size:10px;font-style:italic;opacity:.65;">(edited)</span>' : ''} ${tickHTML}</span>
              <div class="menu-wrap">
                <button class="dot-btn" onclick="window.toggleDropdown('dd-${msg.id}')" aria-label="Options"><i class="ti ti-dots-vertical"></i></button>
                <div class="bubble-dropdown" id="dd-${msg.id}">${ddItems}</div>
              </div>
            </div>
            <div class="b-text">${displayHtml}</div>
            <div class="b-footer" id="footer-${msg.id}">
              ${persistedReactionsHTML}
              <div class="relative inline-block group/reaction">
                  <button class="e-add" title="Add reaction" onclick="window._showReactionPicker('${msg.id}', this)"><i class="ti ti-mood-smile"></i></button>
              </div>
            </div>
            <div class="b-actions">
              ${replyCount > 0 ? `<button class="act-btn" onclick="window.toggleReplies('rw-${msg.id}')"><i class="ti ti-message-2"></i> Replies <span class="reply-badge">${replyCount}</span></button>` : ''}
              <button class="act-btn" onclick="window.initiateReply('${msg.id}', '${snippetText}')"><i class="ti ti-corner-up-left"></i> Reply</button>
              <button class="act-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="window.toggleBookmark('${msg.id}')"><i class="ti ${isBookmarked ? 'ti-bookmark-filled' : 'ti-bookmark'}"></i> ${isBookmarked ? 'Bookmarked' : 'Bookmark'}</button>
            </div>
            ${repliesHTML}
          </div>
        </div>`;
    }

    const loaderHtml = window._allMsgsLoaded
        ? '<div id="__olderMsgsLoader" style="display:flex;text-align:center;padding:12px;align-items:center;justify-content:center;"><span style="font-size:11px;color:var(--text-secondary);">— Beginning of chat —</span></div>'
        : '<div id="__olderMsgsLoader" style="display:none;text-align:center;padding:12px;align-items:center;justify-content:center;gap:6px;"></div>';
    const htmlParts = [loaderHtml];
    let lastDateKey = null;
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
    for (const msg of topLevel) {
        const dateKey = msg.created_at ? msg.created_at.split('T')[0] : '';
        if (dateKey !== lastDateKey) {
            lastDateKey = dateKey;
            let label = dateKey;
            if (msg.created_at) {
                const d = new Date(msg.created_at);
                const msgDay = new Date(d); msgDay.setHours(0,0,0,0);
                const diffDays = Math.round((todayMidnight - msgDay) / 86400000);
                label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday'
                    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            }
            htmlParts.push(`<div class="day-label">${label}</div>`);
        }
        htmlParts.push(buildMsgHTML(msg));
    }
    const mc2 = document.getElementById('messagesContainer');
    if (mc2) mc2.classList.add('no-anim');
    c.innerHTML = htmlParts.join('');
    if (mc2) requestAnimationFrame(() => mc2.classList.remove('no-anim'));
    if (typeof window.applyRBAC === 'function') window.applyRBAC();
};

// ─── REACTION PICKER (body-appended, fixed position, never clipped) ──────────
window._getQuickTags = function() {
    const key = 'quickTags_' + (window.currentTenantId || 'default');
    const raw = localStorage.getItem(key);
    if (raw) { try { return JSON.parse(raw); } catch(e) {} }
    return [
        {v:'Thank You',c:'#16a34a',bg:'#f0fdf4',border:'#bbf7d0'},
        {v:'Noted',    c:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
        {v:'Copied',   c:'#7c3aed',bg:'#f5f3ff',border:'#ddd6fe'},
        {v:'Yes Sir',  c:'#c2410c',bg:'#fff7ed',border:'#fed7aa'},
        {v:'Yes Madam',c:'#be185d',bg:'#fdf2f8',border:'#fbcfe8'},
    ];
};

// Patch reaction footers in-place after background fetch — no full re-render
window._patchReactionFooters = function(msgIds) {
    const tagColorMap = {
        'Thank You':'bg-green-50 text-green-700 border-green-200',
        'Noted':'bg-blue-50 text-blue-700 border-blue-200',
        'Copied':'bg-purple-50 text-purple-700 border-purple-200',
        'Yes Sir':'bg-orange-50 text-orange-700 border-orange-200',
        'Yes Madam':'bg-pink-50 text-pink-700 border-pink-200'
    };
    msgIds.forEach(id => {
        const footer = document.getElementById('footer-' + id);
        if (!footer) return;
        const msgReactions = window.reactionsCache?.[id] || [];
        const rGroups = {};
        msgReactions.forEach(r => {
            if (!rGroups[r.value]) rGroups[r.value] = { count:0, type:r.type, mine:false };
            rGroups[r.value].count += (r.count||1);
            if (r.user_id && r.user_id !== '_rt_' && r.user_id === window.currentUser?.id) rGroups[r.value].mine = true;
        });
        const html = Object.entries(rGroups).map(([val, info]) => {
            if (info.type === 'emoji') {
                const chipClass = info.mine ? 'e-chip active mine' : 'e-chip active';
                const onclick = info.mine ? `window.applyReaction('${id}','${val}','emoji')` : '';
                return `<button class="${chipClass}" data-emoji="${val}" ${onclick ? `onclick="${onclick}"` : ''} title="${info.mine ? 'Click to remove your reaction' : val}" style="${info.mine ? 'cursor:pointer;' : 'cursor:default;'}">${val} <span class="e-cnt">${info.count}</span>${info.mine ? '<span class="chip-remove">✕</span>' : ''}</button>`;
            } else {
                const tagBase = tagColorMap[val] || 'bg-blue-50 text-blue-700 border-blue-200';
                const onclick = info.mine ? `onclick="window.applyReaction('${id}','${val}','tag')"` : '';
                return `<span class="${tagBase + (info.mine ? ' mine' : '')} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ml-1" data-tag="${val}" ${onclick} title="${info.mine ? 'Click to remove your tag' : val}" style="${info.mine ? 'cursor:pointer;' : 'cursor:default;'}">${val}${info.mine ? '<span class="chip-remove">✕</span>' : ''}</span>`;
            }
        }).join('');
        // Preserve the add-reaction button, replace only the chips
        const addBtn = footer.querySelector('.relative.inline-block');
        footer.innerHTML = html + (addBtn ? addBtn.outerHTML : '');
    });
};

window._showReactionPicker = function(msgId, btn) {
    document.querySelectorAll('#__reactionPicker').forEach(el => el.remove());
    const r = btn.getBoundingClientRect();
    const tags = window._getQuickTags();
    const panel = document.createElement('div');
    panel.id = '__reactionPicker';
    panel.style.cssText = 'position:fixed;z-index:99999;background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:14px;padding:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);min-width:280px;';
    panel.innerHTML =
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Reactions</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--border-color);">' +
        ['👍','👎','❤️','😂','😮','😢','🙏','🔥','✅','⚡','💡','📌'].map(e =>
            '<span style="cursor:pointer;font-size:20px;padding:4px 6px;border-radius:8px;transition:background .1s;" ' +
            'onmouseover="this.style.background=\'var(--bg-body)\'" onmouseout="this.style.background=\'\'" ' +
            'onclick="window.applyReaction(\'' + msgId + '\',\'' + e + '\',\'emoji\');document.getElementById(\'__reactionPicker\')?.remove();">' + e + '</span>'
        ).join('') +
        '</div>' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Quick Tags</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        tags.map(t =>
            '<span style="cursor:pointer;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:700;color:' + t.c + ';background:' + t.bg + ';border:1px solid ' + t.border + ';" ' +
            'onclick="window.applyReaction(\'' + msgId + '\',\'' + t.v + '\',\'tag\');document.getElementById(\'__reactionPicker\')?.remove();">' + t.v + '</span>'
        ).join('') +
        '</div>';
    document.body.appendChild(panel);
    // Position: prefer above button, fall back to below
    const pw = 292, ph = 180;
    let top = r.top - ph - 8;
    if (top < 8) top = r.bottom + 8;
    let left = r.left - pw + 28;
    if (left < 8) left = 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    panel.style.top  = top + 'px';
    panel.style.left = left + 'px';
    setTimeout(() => {
        document.addEventListener('click', function _cp(e) {
            if (!e.target.closest('#__reactionPicker') && !e.target.closest('.e-add')) {
                document.getElementById('__reactionPicker')?.remove();
                document.removeEventListener('click', _cp);
            }
        });
    }, 0);
};

// Apply reaction — updates DOM immediately, broadcasts to all users, optionally persists.
// ─── REACTION TOGGLE ─────────────────────────────────────────────────────────
// Click once = add reaction; click same reaction again = remove it
window.applyReaction = async function(msgId, value, type) {
    const footer = document.getElementById('footer-' + msgId);
    if (!footer) return;

    // Check if this user already set this same reaction (visible in DOM)
    const existingEmoji = type === 'emoji' ? footer.querySelector(`[data-emoji="${value}"]`) : null;
    const existingTag   = type === 'tag'   ? footer.querySelector(`[data-tag="${value}"]`)   : null;
    const alreadySet    = existingEmoji || existingTag;

    if (alreadySet) {
        // ── REMOVE — only if this user added the reaction (WhatsApp style) ───
        const isMine = alreadySet.classList.contains('mine');
        if (!isMine) return; // not the adder — do nothing
        alreadySet.remove();
        // Session cache prevents re-appearance if RLS blocks the DB delete
        window.removedReactions = window.removedReactions || new Set();
        window.removedReactions.add(msgId + '|' + value + '|' + window.currentUser.id);
        // Remove from localStorage backup
        try {
            const lsKey = 'myreactions_' + window.currentRoom;
            const myRx = JSON.parse(localStorage.getItem(lsKey) || '[]').filter(
                r => !(r.message_id === msgId && r.value === value)
            );
            localStorage.setItem(lsKey, JSON.stringify(myRx));
        } catch(e) {}
        // Delete only this user's row
        try { await sb.from('reactions').delete()
                .eq('message_id', msgId).eq('value', value).eq('user_id', window.currentUser.id).eq('tenant_id', window.currentTenantId); } catch(e) {}
        // Sync local cache
        if (window.reactionsCache?.[msgId]) {
            window.reactionsCache[msgId] = window.reactionsCache[msgId].filter(
                r => !(r.value === value && r.user_id === window.currentUser.id)
            );
        }
        try {
            if (window._reactionsBroadcast) await window._reactionsBroadcast.send({
                type:'broadcast', event:'reaction_remove',
                payload:{ message_id:msgId, value, user_id:window.currentUser.id, tenant_id:window.currentTenantId }
            });
            // Shared cross-platform channel (reaches mobile) — reaction event w/ isDelete:true
            if (window._sharedBroadcast) window._sharedBroadcast.send({
                type:'broadcast', event:'reaction',
                payload:{ message_id:msgId, value, user_id:window.currentUser.id, tenant_id:window.currentTenantId, isDelete:true, src:'w' }
            });
        } catch(e) {}
        return; // done
    }

    // ── ADD (toggle on) ──────────────────────────────────────────────────────
    window.applyReactionDOM(msgId, value, type, window.currentUser.id);

    // Broadcast to all connected users — tenant_id scopes to own school only
    try {
        if (window._reactionsBroadcast) await window._reactionsBroadcast.send({
            type:'broadcast', event:'reaction',
            payload:{ message_id:msgId, value, type, user_id:window.currentUser.id, tenant_id:window.currentTenantId }
        });
        // Shared cross-platform channel (reaches mobile users) — normalized isDelete format
        if (window._sharedBroadcast) window._sharedBroadcast.send({
            type:'broadcast', event:'reaction',
            payload:{ message_id:msgId, value, type, user_id:window.currentUser.id, tenant_id:window.currentTenantId, isDelete:false, src:'w' }
        });
    } catch(e) {}

    // Save to localStorage so reaction survives refresh even if DB is blocked by RLS
    try {
        const lsKey = 'myreactions_' + window.currentRoom;
        const myRx = JSON.parse(localStorage.getItem(lsKey) || '[]');
        if (!myRx.find(r => r.message_id === msgId && r.value === value)) {
            myRx.push({ message_id: msgId, value, type, user_id: window.currentUser.id });
            localStorage.setItem(lsKey, JSON.stringify(myRx));
        }
    } catch(e) {}
    // Persist to reactions table (upsert handles unique constraint conflicts)
    try {
        await sb.from('reactions').upsert({
            message_id:msgId, user_id:window.currentUser.id,
            tenant_id:window.currentTenantId, value, type, count:1
        }, { onConflict: 'message_id,user_id,value' });
    } catch(e) {}
};

// DOM-only update — called by applyReaction and can be called by real-time subscription
window.applyReactionDOM = function(msgId, value, type, userId) {
    const row = document.getElementById(`row-${msgId}`);
    if (!row) return;
    const footer = row.querySelector('.b-footer');
    if (!footer) return;
    const colorMap = { 'Thank You':'bg-green-50 text-green-700 border-green-200', 'Noted':'bg-blue-50 text-blue-700 border-blue-200', 'Copied':'bg-purple-50 text-purple-700 border-purple-200', 'Yes Sir':'bg-orange-50 text-orange-700 border-orange-200', 'Yes Madam':'bg-pink-50 text-pink-700 border-pink-200' };
    const isMineAdd = !userId || userId === window.currentUser?.id;
    if (type === 'emoji') {
        const existing = Array.from(footer.querySelectorAll('.e-chip')).find(c => c.dataset.emoji === value);
        if (existing) { const cnt = existing.querySelector('.e-cnt'); if(cnt) cnt.textContent = parseInt(cnt.textContent||'1')+1; }
        else {
            const chipClass = `e-chip active${isMineAdd ? ' mine' : ''}`;
            const chipOnclick = isMineAdd ? `onclick="window.applyReaction('${msgId}','${value}','emoji')"` : '';
            const chipCursor = isMineAdd ? 'cursor:pointer;' : 'cursor:default;';
            const chipRemove = isMineAdd ? '<span class="chip-remove">✕</span>' : '';
            footer.querySelector('.group\\/reaction, .relative.inline-block')?.insertAdjacentHTML('beforebegin',
                `<button class="${chipClass}" data-emoji="${value}" ${chipOnclick} title="${isMineAdd ? 'Click to remove your reaction' : value}" style="${chipCursor}">${value} <span class="e-cnt">1</span>${chipRemove}</button>`);
        }
    } else {
        if (!footer.querySelector('[data-tag="' + value + '"]')) {
            const cls = colorMap[value] || 'bg-blue-50 text-blue-700 border-blue-200';
            footer.insertAdjacentHTML('beforeend',
                '<span class="' + cls + (isMineAdd ? ' mine' : '') + ' px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm ml-1" ' +
                'data-tag="' + value + '" ' +
                (isMineAdd ? 'title="Click to remove your tag" onclick="window.applyReaction(\'' + msgId + '\',\'' + value + '\',\'tag\')" style="cursor:pointer;"' : 'title="' + value + '" style="cursor:default;"') +
                '>' + value + (isMineAdd ? '<span class="chip-remove">✕</span>' : '') + '</span>');
        }
    }
    // Keep reactionsCache in sync so re-renders preserve real-time reactions
    if (!window.reactionsCache) window.reactionsCache = {};
    if (!window.reactionsCache[msgId]) window.reactionsCache[msgId] = [];
    const cache = window.reactionsCache[msgId];
    const cacheEntry = cache.find(r => r.value === value && r.user_id === (userId || '_rt_'));
    if (cacheEntry) { cacheEntry.count = (cacheEntry.count || 1) + 1; }
    else { cache.push({ message_id: msgId, value, type, count: 1, user_id: userId || '_rt_' }); }

    const hoverMenu = row.querySelector('.group\\/reaction .absolute');
    if (hoverMenu) { hoverMenu.style.display='none'; setTimeout(() => hoverMenu.style.display='', 300); }
};

// ── EDIT MESSAGE ─────────────────────────────────────────────────────────────
window._editCache = {};  // store original HTML per msgId

window.startEditMessage = function(msgId) {
    // 30-min edit window (parity with mobile) — block edits on older messages
    const msg = (window._roomMsgs || []).find(m => String(m.id) === String(msgId));
    if (msg && msg.created_at) {
        const ageMs = Date.now() - new Date(msg.created_at).getTime();
        if (ageMs > 30 * 60 * 1000) {
            window.showCenterToast('Edit window closed (30 min limit)', 'fa-solid fa-clock', 'text-orange-500');
            return;
        }
    }
    const textDiv = document.querySelector('#row-' + msgId + ' .b-text');
    if (!textDiv) return;
    window._editCache[msgId] = textDiv.innerHTML;
    const plainText = window.stripHtml(textDiv.innerHTML);
    // Use data-* attributes so no quoting conflicts with onclick="" strings
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const ta = document.createElement('textarea');
    ta.id = 'edit-area-' + msgId;
    ta.value = plainText;
    ta.style.cssText = 'width:100%;min-height:60px;padding:8px;border-radius:8px;border:1px solid var(--border-color);font-size:13px;background:var(--bg-body);color:var(--text-primary);resize:vertical;font-family:inherit;outline:none;';
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'font-size:11px;font-weight:700;padding:4px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-secondary);cursor:pointer;';
    btnCancel.type = 'button';
    btnCancel.addEventListener('click', (e) => { e.stopPropagation(); window.cancelEditMessage(msgId); });
    const btnSave = document.createElement('button');
    btnSave.textContent = 'Save';
    btnSave.type = 'button';
    btnSave.style.cssText = 'font-size:11px;font-weight:700;padding:4px 12px;border-radius:8px;background:var(--accent);color:#fff;border:none;cursor:pointer;';
    btnSave.addEventListener('click', (e) => { e.stopPropagation(); window.saveEditMessage(msgId); });
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnSave);
    wrap.appendChild(ta);
    wrap.appendChild(btnRow);
    textDiv.innerHTML = '';
    textDiv.appendChild(wrap);
    ta.focus();
};
window.cancelEditMessage = function(msgId) {
    const textDiv = document.querySelector('#row-' + msgId + ' .b-text');
    if (textDiv && window._editCache[msgId]) {
        textDiv.innerHTML = window._editCache[msgId];
        delete window._editCache[msgId];
    }
};
window.saveEditMessage = async function(msgId) {
    const area = document.getElementById(`edit-area-${msgId}`);
    if (!area) return;
    const newText = area.value.trim();
    if (!newText) { window.showCenterToast('Message cannot be empty','fa-solid fa-times','text-red-500'); return; }
    const wrapped = `<p>${newText.replace(/\n/g,'</p><p>')}</p>`;
    const { error, data: updData } = await sb.from('messages')
        .update({ text: wrapped, updated_at: new Date().toISOString() })
        .eq('id', msgId)
        .eq('sender_id', window.currentUser.id)
        .eq('tenant_id', window.currentTenantId)
        .select();
    if (error) {
        window.showCenterToast('Edit failed — check RLS: messages UPDATE policy needed', 'fa-solid fa-lock', 'text-red-500');
        // SQL needed: CREATE POLICY "users update own messages" ON messages FOR UPDATE USING (auth.uid()=sender_id);
        return;
    }
    if (!updData || updData.length === 0) {
        window.showCenterToast('Not saved — you may not be the sender', 'fa-solid fa-ban', 'text-orange-500');
        return;
    }
    window.showCenterToast('Message updated ✓', 'fa-solid fa-check', 'text-green-400');
    if (typeof window.loadMessages === 'function') window.loadMessages();
};

// ── DELETE MESSAGE ────────────────────────────────────────────────────────────
window.deleteMessage = async function(msgId) {
    if (!confirm('Delete this message?')) return;
    // Soft-delete (parity with mobile) — keep the row, hide via deleted_at
    await sb.from('messages').update({ deleted_at: new Date().toISOString() })
        .eq('id', msgId).eq('sender_id', window.currentUser.id).eq('tenant_id', window.currentTenantId);
    if (typeof window.loadMessages === 'function') window.loadMessages();
};

// ── FORWARD MESSAGE ───────────────────────────────────────────────────────────
window.openForwardModal = function(msgId, snippet, fromName) {
    window._fwdMsgId = msgId;
    window._fwdSnippet = snippet;
    window._fwdFrom = fromName;
    // Build room list in modal
    const sel = document.getElementById('forwardRoomSelect');
    if (!sel) return;
    sel.innerHTML = '';
    // Departments
    ['general','math','science','leadership'].forEach(g => {
        const opt = document.createElement('option');
        opt.value = g; opt.textContent = '# ' + g.charAt(0).toUpperCase() + g.slice(1);
        sel.appendChild(opt);
    });
    // DMs
    (window.globalUsersCache||[]).filter(u=>u.id!==window.currentUser.id).forEach(u => {
        const name = window.toSentenceCase?.(u.full_name||u.email.split('@')[0])||u.email;
        const dmRoom = typeof window.getDmRoomId==='function' ? window.getDmRoomId(u.id) : 'dm_'+u.id;
        const opt = document.createElement('option');
        opt.value = dmRoom; opt.textContent = '💬 ' + name;
        sel.appendChild(opt);
    });
    document.getElementById('forwardPreview').textContent = snippet;
    const modal = document.getElementById('forwardModal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};
window.closeForwardModal = function() {
    const modal = document.getElementById('forwardModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window.sendForwardedMessage = async function() {
    const sel = document.getElementById('forwardRoomSelect');
    if (!sel?.value) return;
    const { data: orig } = await sb.from('messages').select('text').eq('id', window._fwdMsgId).single();
    if (!orig) return;
    const forwardText = `<p style="font-size:11px;color:#6b7280;border-left:3px solid #6366f1;padding-left:8px;margin-bottom:6px;">↪ Forwarded from ${window.escapeHtml(window._fwdFrom)}</p>${orig.text}`;
    await sb.from('messages').insert({ room_id: sel.value, sender_id: window.currentUser.id, tenant_id: window.currentTenantId, text: forwardText });
    window.closeForwardModal();
    window.showCenterToast('Message forwarded','fa-solid fa-share','text-indigo-400');
};

window.toggleReplies = function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
};

window.initiateReply = function(parentId, text) {
    window.currentlyReplyingTo = parentId;
    document.getElementById('replyBanner').classList.remove('hidden');
    document.getElementById('replyBannerText').innerText = text;
    window.quillEditor.focus();
};

window.cancelReply = function() {
    window.currentlyReplyingTo = null;
    const banner = document.getElementById('replyBanner');
    if (banner) banner.classList.add('hidden');
};

window.toggleBookmark = async function(mid) {
    if (typeof window.closeDropdowns === 'function') window.closeDropdowns();
    const btn = document.querySelector(`#row-${mid} .act-btn[onclick*="toggleBookmark"]`);
    let isCurrentlyBookmarked = window.bookmarkedSet && window.bookmarkedSet.has(mid);
    if (isCurrentlyBookmarked) {
        window.bookmarkedSet.delete(mid);
        if (btn) { btn.classList.remove('bookmarked'); btn.innerHTML = '<i class="ti ti-bookmark"></i> Bookmark'; }
        window.showCenterToast('Bookmark removed', 'fa-solid fa-info-circle', 'text-yellow-400');
        await sb.from('bookmarks').delete().eq('user_id', window.currentUser.id).eq('message_id', mid).eq('tenant_id', window.currentTenantId);
    } else {
        window.bookmarkedSet = window.bookmarkedSet || new Set();
        window.bookmarkedSet.add(mid);
        if (btn) { btn.classList.add('bookmarked'); btn.innerHTML = '<i class="ti ti-bookmark-filled"></i> Bookmarked'; }
        window.showCenterToast('Message Bookmarked');
        await sb.from('bookmarks').insert({ user_id: window.currentUser.id, message_id: mid, tenant_id: window.currentTenantId });
    }
};

window.applyFilters = function() {
    const searchBar = document.getElementById('messageSearchBar');
    if (!searchBar) return;
    const search = searchBar.value.toLowerCase();
    document.querySelectorAll('.row-sent, .row-rcvd').forEach(el => {
        el.style.display = (!search || el.innerText.toLowerCase().includes(search)) ? 'flex' : 'none';
    });
};

window.insertEmoji = function(char) {
    if (!window.quillEditor) return;
    window.quillEditor.focus();
    const range = window.quillEditor.getSelection();
    const index = range ? range.index : window.quillEditor.getLength();
    window.quillEditor.insertText(index, char);
    window.quillEditor.setSelection(index + char.length);
    const ep = document.getElementById('inputEmojiPicker');
    if (ep) ep.classList.add('hidden');
};

window.toggleInputEmojiPicker = function() {
    const ep = document.getElementById('inputEmojiPicker');
    if (ep) ep.classList.toggle('hidden');
};

window.cancelFileRename = function() {
    window.pendingFileUpload = null;
    const fileInput = document.getElementById('fileAttachment');
    if (fileInput) fileInput.value = '';
    const modal = document.getElementById('fileRenameModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.confirmFileRename = async function() {
    if (!window.pendingFileUpload) return;
    const file = window.pendingFileUpload;
    window.pendingFileUpload = null;
    const modal = document.getElementById('fileRenameModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot) : '';
    let newNameInput = document.getElementById('newFileNameInput');
    let newName = newNameInput ? newNameInput.value.trim() : '';
    if (!newName) newName = lastDot !== -1 ? file.name.substring(0, lastDot) : file.name;
    const finalName = newName + ext;
    window.showCenterToast('Uploading secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const sizeKB = Math.round(file.size / 1024);
    const safeName = finalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `chat/${Date.now()}_${safeName}`;
    const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
    if (error) { window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    if (window.quillEditor) {
        window.quillEditor.focus();
        const range = window.quillEditor.getSelection();
        const index = range ? range.index : window.quillEditor.getLength();
        window.quillEditor.insertText(index, `📁 Attached File: ${finalName} (${sizeKB} KB)\n`, 'link', `https://secure-file.local/${filePath}`);
    }
    window.showCenterToast('File securely attached!', 'fa-solid fa-check-circle', 'text-green-500');
    const fileInput = document.getElementById('fileAttachment');
    if (fileInput) fileInput.value = '';
};
