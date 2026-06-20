import { sb } from './shared.js';

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

    const { data: msgData } = await sb.from('messages').insert(payload).select().single();

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

    // ── Notify the original message sender when replying
    if (window.currentlyReplyingTo && msgData) {
        try {
            const { data: parentMsg } = await sb.from('messages').select('sender_id').eq('id', window.currentlyReplyingTo).single();
            if (parentMsg && parentMsg.sender_id !== window.currentUser.id) {
                const myName = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'Someone';
                await window.notifyUser(parentMsg.sender_id,
                    `↩️ ${myName} replied to your message`, msgData.id, 'reply');
            }
        } catch(e) {}
    }

    window.quillEditor.root.innerHTML = '';
    window.cancelReply();
    if (sendBtn) sendBtn.innerHTML = '<i class="ti ti-send text-lg"></i>';
};

window.loadMessages = async function() {
    const { data: msgs } = await sb.from('messages')
        .select('*, profiles(full_name, email)')
        .eq('room_id', window.currentRoom)
        .order('created_at', { ascending: true });

    const { data: bms } = await sb.from('bookmarks')
        .select('message_id')
        .eq('user_id', window.currentUser.id);
    window.bookmarkedSet = new Set(bms?.map(b => b.message_id) || []);

    // ── Fetch reactions so they survive re-renders ──────────────────────────
    const msgIds = msgs?.map(m => m.id) || [];
    window.reactionsCache = {};
    if (msgIds.length) {
        try {
            const { data: rData } = await sb.from('reactions').select('*').in('message_id', msgIds);
            (rData || []).forEach(r => {
                if (!window.reactionsCache[r.message_id]) window.reactionsCache[r.message_id] = [];
                window.reactionsCache[r.message_id].push(r);
            });
        } catch(e) { /* reactions table may not exist yet */ }
    }

    const c = document.getElementById('messagesContainer');
    const isNearBottom = c ? (c.scrollHeight - c.scrollTop - c.clientHeight < 150) : false;

    window.renderMessages(msgs || []);
    if (typeof window.applyFilters === 'function') window.applyFilters();

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
                        setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 3500);
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
        const roleStr = 'Teacher';
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

        // Build persisted reactions HTML from cache (survives re-renders)
        const msgReactions = window.reactionsCache?.[msg.id] || [];
        const rGroups = {};
        msgReactions.forEach(r => {
            if (!rGroups[r.value]) rGroups[r.value] = { count:0, type:r.type };
            rGroups[r.value].count += (r.count||1);
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
                return `<button class="e-chip active" data-emoji="${val}">${val} <span class="e-cnt">${info.count}</span></button>`;
            } else {
                return `<span class="${tagColorMap[val]||'bg-blue-50 text-blue-700 border-blue-200'} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ml-1" data-tag="${val}">${val}</span>`;
            }
        }).join('');

        return `
        <div class="${rowClass} transition-colors" id="row-${msg.id}">
          <div class="${bubbleClass}">
            <div class="b-header">
              <div class="${avClass}">${avatarInitial}</div>
              <div class="b-name">${window.escapeHtml(senderName)} <span class="b-role">· ${roleStr}</span></div>
              <span class="b-time">${time} ${tickHTML}</span>
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

    const dateLabel = `<div class="day-label">Today — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>`;
    c.innerHTML = dateLabel + topLevel.map(msg => buildMsgHTML(msg)).join('');
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
        ['👍','❤️','😂','😮','😢','🙏','🎉','🔥'].map(e =>
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
        // ── REMOVE (toggle off) ──────────────────────────────────────────────
        alreadySet.remove();
        try { await sb.from('reactions').delete()
                .eq('message_id', msgId).eq('value', value).eq('user_id', window.currentUser.id); } catch(e) {}
        try {
            if (window._reactionsBroadcast) await window._reactionsBroadcast.send({
                type:'broadcast', event:'reaction_remove',
                payload:{ message_id:msgId, value, user_id:window.currentUser.id }
            });
        } catch(e) {}
        return; // done
    }

    // ── ADD (toggle on) ──────────────────────────────────────────────────────
    window.applyReactionDOM(msgId, value, type);

    // Broadcast to all connected users via Supabase Broadcast (no schema needed)
    try {
        if (window._reactionsBroadcast) await window._reactionsBroadcast.send({
            type:'broadcast', event:'reaction',
            payload:{ message_id:msgId, value, type, user_id:window.currentUser.id }
        });
    } catch(e) {}

    // Persist to reactions table for page-reload survival (optional table)
    try {
        await sb.from('reactions').insert({
            message_id:msgId, user_id:window.currentUser.id,
            tenant_id:window.currentTenantId, value, type, count:1
        });
    } catch(e) {}
};

// DOM-only update — called by applyReaction and can be called by real-time subscription
window.applyReactionDOM = function(msgId, value, type) {
    const row = document.getElementById(`row-${msgId}`);
    if (!row) return;
    const footer = row.querySelector('.b-footer');
    if (!footer) return;
    const colorMap = { 'Thank You':'bg-green-50 text-green-700 border-green-200', 'Noted':'bg-blue-50 text-blue-700 border-blue-200', 'Copied':'bg-purple-50 text-purple-700 border-purple-200', 'Yes Sir':'bg-orange-50 text-orange-700 border-orange-200', 'Yes Madam':'bg-pink-50 text-pink-700 border-pink-200' };
    if (type === 'emoji') {
        const existing = Array.from(footer.querySelectorAll('.e-chip')).find(c => c.textContent.trim().startsWith(value));
        if (existing) { const cnt = existing.querySelector('.e-cnt'); if(cnt) cnt.textContent = parseInt(cnt.textContent||'1')+1; }
        else { const rm = footer.querySelector('.group\\/reaction'); rm?.insertAdjacentHTML('beforebegin', `<button class="e-chip active" data-emoji="${value}">${value} <span class="e-cnt">1</span></button>`); }
    } else {
        if (!footer.querySelector('[data-tag="' + value + '"]')) {
            const cls = colorMap[value] || 'bg-blue-50 text-blue-700 border-blue-200';
            footer.insertAdjacentHTML('beforeend',
                '<span class="' + cls + ' px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm ml-1 cursor-pointer" ' +
                'data-tag="' + value + '" ' +
                'title="Click to remove" ' +
                'onclick="window.applyReaction(\'' + msgId + '\',\'' + value + '\',\'tag\')">' + value + '</span>');
        }
    }
    const hoverMenu = row.querySelector('.group\\/reaction .absolute');
    if (hoverMenu) { hoverMenu.style.display='none'; setTimeout(() => hoverMenu.style.display='', 300); }
};

// ── EDIT MESSAGE ─────────────────────────────────────────────────────────────
window._editCache = {};  // store original HTML per msgId

window.startEditMessage = function(msgId) {
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
        .update({ text: wrapped })
        .eq('id', msgId)
        .select();
    if (error) {
        window.showCenterToast('Edit failed — check RLS: messages UPDATE policy needed', 'fa-solid fa-lock', 'text-red-500');
        console.error('Edit error:', error);
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
    await sb.from('messages').delete().eq('id', msgId).eq('sender_id', window.currentUser.id);
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
        await sb.from('bookmarks').delete().eq('user_id', window.currentUser.id).eq('message_id', mid);
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
