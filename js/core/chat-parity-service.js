(function () {
    'use strict';

    if (window.NILTASK_ChatParity) return;

    const VERSION = 'v1';
    const OWNER = 'cross-platform-chat-parity';
    const INSTALL_LIMIT = 300;
    const TYPING_TTL = 3200;
    const TYPING_THROTTLE = 1400;
    const TAG_COLORS = {
        'Thank You':'#16a34a',
        'Noted':'#2563eb',
        'Copied':'#7c3aed',
        'Yes Sir':'#ea580c',
        'Yes Madam':'#db2777'
    };

    const STATE = {
        installed: false,
        disposed: false,
        tenantId: null,
        userId: null,
        topic: null,
        channel: null,
        channelStatus: null,
        restartTimer: null,
        typingLastSentAt: 0,
        typingTimers: new Map(),
        typingUsers: new Map(),
        mobileObserver: null,
        desktopObserver: null,
        cacheTimer: null,
        decorateTimer: null,
        reactionSyncTimer: null,
        pendingReactionIds: new Set(),
        reactionSyncs: 0,
        typingSent: 0,
        typingReceived: 0,
        offlineSaves: 0,
        offlineRestores: 0,
        replyRowsDecorated: 0
    };

    function isMobile() {
        return Boolean(window.isMobileView?.() || document.getElementById('mobileApp'));
    }

    function clean(value) {
        return String(value == null ? '' : value);
    }

    function esc(value) {
        if (window.escapeHtml) return window.escapeHtml(clean(value));
        return clean(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function attr(value) {
        return esc(value).replace(/`/g, '&#96;');
    }

    function identity() {
        return {
            userId: window.currentUser?.id || null,
            tenantId: window.currentTenantId || null
        };
    }

    function currentName() {
        const id = window.currentUser?.id;
        const profile = (window.globalUsersCache || []).find(user => user.id === id);
        return profile?.full_name || window.currentUser?.full_name ||
            window.currentUser?.user_metadata?.full_name ||
            window.currentUser?.email?.split('@')[0] || 'Someone';
    }

    function activeMobileRoom() {
        const app = document.getElementById('mobileApp');
        if (!app) return null;
        const selectors = [
            '[data-action="sendGroup"][data-room]',
            '[data-action="sendDM"][data-room]',
            '[data-action="sendReply"][data-room]'
        ];
        for (const selector of selectors) {
            const button = app.querySelector(selector);
            if (button && button.offsetParent !== null) return button.dataset.room || null;
        }
        const fallback = app.querySelector(selectors.join(','));
        return fallback?.dataset?.room || null;
    }

    function activeRoom() {
        return isMobile() ? activeMobileRoom() : (window.currentRoom || null);
    }

    function typingTarget(eventTarget) {
        if (!eventTarget) return false;
        if (eventTarget.closest?.('.m-ce')) return true;
        if (window.quillEditor?.root && eventTarget === window.quillEditor.root) return true;
        if (eventTarget.closest?.('.ql-editor') && eventTarget.closest?.('#messageInput,#editor,#composerArea,.chat-area')) return true;
        return false;
    }

    function typingBar() {
        return isMobile() ? document.getElementById('mTypingArea') : document.getElementById('webTypingBar');
    }

    function renderTyping(room) {
        if (!room || activeRoom() !== room) return;
        const bar = typingBar();
        if (!bar) return;
        const now = Date.now();
        const users = Array.from(STATE.typingUsers.values())
            .filter(item => item.room === room && item.expiresAt > now);
        if (!users.length) {
            bar.innerHTML = '';
            bar.textContent = '';
            bar.style.display = 'none';
            return;
        }
        const names = users.map(item => clean(item.name).split(' ')[0]).filter(Boolean);
        const label = names.length === 1 ? `${esc(names[0])} is typing` : `${esc(names.join(', '))} are typing`;
        if (isMobile()) {
            bar.innerHTML = `<div class="m-typing"><span class="m-typing-dots"><span></span><span></span><span></span></span><span class="m-typing-text">${label}</span></div>`;
        } else {
            bar.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-flex;gap:2px;"><i style="width:4px;height:4px;border-radius:50%;background:currentColor;display:block;"></i><i style="width:4px;height:4px;border-radius:50%;background:currentColor;display:block;"></i><i style="width:4px;height:4px;border-radius:50%;background:currentColor;display:block;"></i></span><span>${label}</span></span>`;
        }
        bar.style.display = '';
    }

    function clearTypingUser(uid, room) {
        const timer = STATE.typingTimers.get(uid);
        if (timer) clearTimeout(timer);
        STATE.typingTimers.delete(uid);
        STATE.typingUsers.delete(uid);
        renderTyping(room);
    }

    function receiveTyping(payload) {
        if (!payload || payload.uid === STATE.userId || payload.tenant_id !== STATE.tenantId) return;
        const room = payload.room;
        if (!room) return;
        STATE.typingReceived += 1;
        if (payload.active === false) {
            clearTypingUser(payload.uid, room);
            return;
        }
        STATE.typingUsers.set(payload.uid, {
            uid: payload.uid,
            room,
            name: payload.name || 'Someone',
            expiresAt: Date.now() + TYPING_TTL
        });
        const prior = STATE.typingTimers.get(payload.uid);
        if (prior) clearTimeout(prior);
        STATE.typingTimers.set(payload.uid, setTimeout(() => clearTypingUser(payload.uid, room), TYPING_TTL));
        renderTyping(room);
    }

    function sendTyping(active) {
        const room = activeRoom();
        if (!room || !STATE.channel || STATE.channel.state !== 'joined') return;
        const now = Date.now();
        if (active !== false && now - STATE.typingLastSentAt < TYPING_THROTTLE) return;
        STATE.typingLastSentAt = now;
        STATE.typingSent += 1;
        try {
            STATE.channel.send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    room,
                    uid: STATE.userId,
                    tenant_id: STATE.tenantId,
                    name: currentName(),
                    active: active !== false,
                    at: now
                }
            });
        } catch (e) {}
    }

    function onInput(event) {
        if (STATE.disposed || !typingTarget(event.target)) return;
        sendTyping(true);
    }

    function onFocusOut(event) {
        if (STATE.disposed || !typingTarget(event.target)) return;
        sendTyping(false);
    }

    function mobileReactionKey() {
        return `${STATE.tenantId}_mob_reactions`;
    }

    function readMobileReactionCache() {
        try { return JSON.parse(localStorage.getItem(mobileReactionKey()) || '{}'); }
        catch (e) { return {}; }
    }

    function writeMobileReactionCache(cache) {
        try { localStorage.setItem(mobileReactionKey(), JSON.stringify(cache)); }
        catch (e) {}
    }

    function normalizedReaction(reaction) {
        return {
            message_id: reaction.message_id,
            user_id: reaction.user_id,
            value: clean(reaction.value),
            type: reaction.type === 'emoji' ? 'emoji' : 'tag',
            count: Number(reaction.count || 1)
        };
    }

    function mobileChipsHtml(messageId, list) {
        const grouped = new Map();
        for (const raw of list || []) {
            const reaction = normalizedReaction(raw);
            if (!reaction.value) continue;
            const key = `${reaction.type}|${reaction.value}`;
            const item = grouped.get(key) || {
                type: reaction.type,
                value: reaction.value,
                count: 0,
                mine: false
            };
            item.count += reaction.count || 1;
            if (reaction.user_id === STATE.userId) item.mine = true;
            grouped.set(key, item);
        }
        if (!grouped.size) return '';
        return `<div class="m-chips">${Array.from(grouped.values()).map(item => {
            const mine = item.mine ? ' mine' : '';
            const mineAttr = item.mine ? ' data-mine="1"' : '';
            if (item.type === 'tag') {
                const color = TAG_COLORS[item.value] || 'var(--accent)';
                return `<button class="m-chip m-chip-tag${mine}"${mineAttr} style="color:${color};border-color:${color};" data-action="toggleReaction" data-id="${attr(messageId)}" data-value="${attr(item.value)}" data-type="tag">${esc(item.value)}</button>`;
            }
            return `<button class="m-chip${mine}"${mineAttr} data-action="toggleReaction" data-id="${attr(messageId)}" data-value="${attr(item.value)}" data-type="emoji">${esc(item.value)} <span class="m-chip-cnt">${item.count}</span></button>`;
        }).join('')}</div>`;
    }

    function patchMobileReaction(messageId, list) {
        const row = document.getElementById(`row-${messageId}`);
        if (!row || !row.closest('#mobileApp')) return false;
        const html = mobileChipsHtml(messageId, list);
        const existing = row.querySelector('.m-chips');
        if (existing) {
            if (html) existing.outerHTML = html;
            else existing.remove();
        } else if (html) {
            const text = row.querySelector('.m-btext');
            if (text) text.insertAdjacentHTML('afterend', html);
            else row.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend', html);
        }
        return true;
    }

    function desktopReactionHtml(messageId, list) {
        const groups = new Map();
        for (const raw of list || []) {
            const reaction = normalizedReaction(raw);
            const item = groups.get(reaction.value) || {
                value: reaction.value,
                type: reaction.type,
                count: 0,
                mine: false
            };
            item.count += reaction.count || 1;
            if (reaction.user_id === STATE.userId) item.mine = true;
            groups.set(reaction.value, item);
        }
        return Array.from(groups.values()).map(item => {
            if (item.type === 'emoji') {
                const mineClass = item.mine ? ' mine' : '';
                const click = item.mine ? ` onclick="window.applyReaction('${attr(messageId)}','${attr(item.value)}','emoji')"` : '';
                return `<button class="e-chip active${mineClass}" data-emoji="${attr(item.value)}"${click} style="${item.mine ? 'cursor:pointer;' : 'cursor:default;'}">${esc(item.value)} <span class="e-cnt">${item.count}</span>${item.mine ? '<span class="chip-remove">✕</span>' : ''}</button>`;
            }
            const colorClasses = {
                'Thank You':'bg-green-50 text-green-700 border-green-200',
                'Noted':'bg-blue-50 text-blue-700 border-blue-200',
                'Copied':'bg-purple-50 text-purple-700 border-purple-200',
                'Yes Sir':'bg-orange-50 text-orange-700 border-orange-200',
                'Yes Madam':'bg-pink-50 text-pink-700 border-pink-200'
            };
            const classes = colorClasses[item.value] || 'bg-blue-50 text-blue-700 border-blue-200';
            const click = item.mine ? ` onclick="window.applyReaction('${attr(messageId)}','${attr(item.value)}','tag')"` : '';
            return `<span class="${classes}${item.mine ? ' mine' : ''} px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ml-1" data-tag="${attr(item.value)}"${click} style="${item.mine ? 'cursor:pointer;' : 'cursor:default;'}">${esc(item.value)}${item.mine ? '<span class="chip-remove">✕</span>' : ''}</span>`;
        }).join('');
    }

    function rootReplies() {
        const messages = Array.isArray(window._roomMsgs) ? window._roomMsgs : [];
        const byId = new Map(messages.map(message => [String(message.id), message]));
        const grouped = new Map();
        for (const message of messages) {
            if (!message.parent_message_id) continue;
            let root = String(message.parent_message_id);
            const visited = new Set();
            while (byId.has(root) && byId.get(root)?.parent_message_id) {
                if (visited.has(root)) break;
                visited.add(root);
                root = String(byId.get(root).parent_message_id);
            }
            if (!grouped.has(root)) grouped.set(root, []);
            grouped.get(root).push(message);
        }
        return grouped;
    }

    function decorateDesktopReplies() {
        if (STATE.disposed || isMobile()) return;
        const shell = document.getElementById('chatShellContainer');
        if (!shell) return;
        const grouped = rootReplies();
        let decorated = 0;
        for (const [parentId, replies] of grouped.entries()) {
            const wrap = document.getElementById(`rw-${parentId}`);
            if (!wrap) continue;
            const rows = Array.from(wrap.querySelectorAll(':scope > .reply-item'));
            rows.forEach((row, index) => {
                const reply = replies[index];
                if (!reply?.id) return;
                row.id = `row-${reply.id}`;
                row.dataset.replyId = reply.id;
                const body = row.querySelector('.reply-body') || row;
                let footer = row.querySelector(`#footer-${CSS.escape(String(reply.id))}`);
                if (!footer) {
                    footer = document.createElement('div');
                    footer.className = 'b-footer reply-reaction-footer';
                    footer.id = `footer-${reply.id}`;
                    body.appendChild(footer);
                }
                const list = window.reactionsCache?.[reply.id] || [];
                footer.innerHTML = `${desktopReactionHtml(reply.id, list)}<div class="relative inline-block group/reaction"><button class="e-add" title="Add reaction" onclick="window._showReactionPicker('${attr(reply.id)}', this)"><i class="ti ti-mood-smile"></i></button></div>`;
                decorated += 1;
            });
        }
        STATE.replyRowsDecorated += decorated;
    }

    async function fetchReactionMap(ids) {
        const unique = Array.from(new Set((ids || []).filter(Boolean).map(String)));
        if (!unique.length) return {};
        if (typeof window.NFA_fetchReactions === 'function') {
            return await window.NFA_fetchReactions(window.sb, unique, STATE.tenantId, () => {});
        }
        const { data } = await window.sb.from('reactions').select('*')
            .in('message_id', unique).eq('tenant_id', STATE.tenantId);
        const map = {};
        for (const reaction of data || []) {
            if (!map[reaction.message_id]) map[reaction.message_id] = [];
            map[reaction.message_id].push(reaction);
        }
        return map;
    }

    async function syncReactions(ids) {
        if (STATE.disposed || !STATE.tenantId) return;
        const unique = Array.from(new Set((ids || []).filter(Boolean).map(String)));
        if (!unique.length) return;
        try {
            const map = await fetchReactionMap(unique);
            STATE.reactionSyncs += 1;
            if (isMobile()) {
                const cache = readMobileReactionCache();
                for (const id of unique) {
                    const list = (map[id] || []).map(normalizedReaction);
                    if (list.length) cache[id] = list;
                    else delete cache[id];
                    patchMobileReaction(id, list);
                }
                writeMobileReactionCache(cache);
                scheduleMobileCacheSave();
            } else {
                window.reactionsCache = window.reactionsCache || {};
                for (const id of unique) window.reactionsCache[id] = (map[id] || []).map(normalizedReaction);
                decorateDesktopReplies();
                if (typeof window._patchReactionFooters === 'function') window._patchReactionFooters(unique);
            }
        } catch (e) {}
    }

    function visibleMessageIds() {
        return Array.from(document.querySelectorAll('[id^="row-"]'))
            .filter(row => row.closest('#mobileApp,#chatShellContainer'))
            .map(row => row.id.slice(4))
            .filter(Boolean);
    }

    function queueReactionSync(id) {
        if (id) STATE.pendingReactionIds.add(String(id));
        else visibleMessageIds().forEach(messageId => STATE.pendingReactionIds.add(messageId));
        clearTimeout(STATE.reactionSyncTimer);
        STATE.reactionSyncTimer = setTimeout(() => {
            const ids = Array.from(STATE.pendingReactionIds);
            STATE.pendingReactionIds.clear();
            syncReactions(ids);
        }, 100);
    }

    function mobileAreaContext(area) {
        const app = document.getElementById('mobileApp');
        if (!app || !area) return null;
        if (area.id === 'mThreadArea') {
            const button = app.querySelector('[data-action="sendReply"][data-pid]');
            return button ? { kind:'thread', id:button.dataset.pid, room:button.dataset.room || '' } : null;
        }
        const action = area.id === 'mMsgArea' ? 'sendGroup' : 'sendDM';
        const button = app.querySelector(`[data-action="${action}"][data-room]`);
        return button ? { kind:area.id === 'mMsgArea' ? 'group' : 'dm', id:button.dataset.room, room:button.dataset.room } : null;
    }

    function offlineCacheKey(context) {
        return `niltask_mobile_html_cache:${STATE.userId || 'anon'}:${STATE.tenantId || 'none'}:${context.kind}:${context.id}`;
    }

    function cacheableAreaHtml(area, context) {
        if (context.kind === 'thread') {
            const parent = area.querySelector('.m-thread-parent')?.outerHTML || '';
            const separator = area.querySelector('.m-thread-sep')?.outerHTML || '';
            const rows = Array.from(area.querySelectorAll('.m-bubble-row')).slice(-100).map(row => row.outerHTML).join('');
            return rows ? parent + separator + rows : '';
        }
        return Array.from(area.querySelectorAll('.m-bubble-row')).slice(-100).map(row => row.outerHTML).join('');
    }

    function saveMobileArea(area) {
        if (!area || !STATE.userId || !STATE.tenantId) return;
        const context = mobileAreaContext(area);
        if (!context) return;
        const html = cacheableAreaHtml(area, context);
        if (!html) return;
        try {
            localStorage.setItem(offlineCacheKey(context), JSON.stringify({
                html,
                savedAt: Date.now(),
                room: context.room
            }));
            STATE.offlineSaves += 1;
        } catch (e) {}
    }

    function restoreMobileArea(area) {
        if (!area || area.querySelector('.m-bubble-row')) return false;
        const context = mobileAreaContext(area);
        if (!context) return false;
        try {
            const cached = JSON.parse(localStorage.getItem(offlineCacheKey(context)) || 'null');
            if (!cached?.html) return false;
            area.innerHTML = cached.html;
            STATE.offlineRestores += 1;
            queueReactionSync();
            return true;
        } catch (e) { return false; }
    }

    function processMobileAreas() {
        if (!isMobile()) return;
        const areas = document.querySelectorAll('#mMsgArea,#mDMArea,#mThreadArea');
        areas.forEach(area => {
            if (!navigator.onLine) restoreMobileArea(area);
            if (area.querySelector('.m-bubble-row')) saveMobileArea(area);
        });
    }

    function scheduleMobileCacheSave() {
        clearTimeout(STATE.cacheTimer);
        STATE.cacheTimer = setTimeout(processMobileAreas, 120);
    }

    function scheduleDesktopDecoration() {
        clearTimeout(STATE.decorateTimer);
        STATE.decorateTimer = setTimeout(decorateDesktopReplies, 0);
    }

    function installObservers() {
        const mobileApp = document.getElementById('mobileApp');
        if (mobileApp && !STATE.mobileObserver) {
            STATE.mobileObserver = new MutationObserver(() => scheduleMobileCacheSave());
            STATE.mobileObserver.observe(mobileApp, { childList:true, subtree:true });
            processMobileAreas();
        }
        const shell = document.getElementById('chatShellContainer');
        if (shell && !STATE.desktopObserver) {
            STATE.desktopObserver = new MutationObserver(() => scheduleDesktopDecoration());
            STATE.desktopObserver.observe(shell, { childList:true, subtree:true });
            decorateDesktopReplies();
        }
    }

    async function stopChannel() {
        clearTimeout(STATE.restartTimer);
        STATE.restartTimer = null;
        const manager = window.NILTASK_RealtimeManager;
        if (manager?.stopOwner) {
            try { await manager.stopOwner(OWNER); } catch (e) {}
        } else if (STATE.channel) {
            try { await window.sb?.removeChannel?.(STATE.channel); } catch (e) {
                try { await STATE.channel.unsubscribe?.(); } catch (e2) {}
            }
        }
        STATE.channel = null;
        STATE.channelStatus = null;
    }

    function scheduleRestart() {
        if (STATE.disposed || STATE.restartTimer) return;
        STATE.restartTimer = setTimeout(() => {
            STATE.restartTimer = null;
            startChannel();
        }, 3000);
    }

    async function startChannel() {
        if (STATE.disposed || !window.sb?.channel) return false;
        const current = identity();
        if (!current.userId || !current.tenantId) return false;
        if (STATE.channel && STATE.tenantId === current.tenantId && STATE.channel.state === 'joined') return true;
        STATE.userId = current.userId;
        STATE.tenantId = current.tenantId;
        STATE.topic = `niltask-chat-parity-${STATE.tenantId}`;
        await stopChannel();
        if (STATE.disposed) return false;
        const channel = window.sb.channel(STATE.topic, { config:{ broadcast:{ self:false } } })
            .on('broadcast', { event:'typing' }, event => receiveTyping(event?.payload))
            .on('postgres_changes', {
                event:'INSERT', schema:'public', table:'reactions',
                filter:`tenant_id=eq.${STATE.tenantId}`
            }, event => queueReactionSync(event?.new?.message_id))
            .on('postgres_changes', {
                event:'DELETE', schema:'public', table:'reactions'
            }, event => queueReactionSync(event?.old?.message_id || null))
            .subscribe(status => {
                STATE.channelStatus = status;
                if (status === 'SUBSCRIBED') {
                    clearTimeout(STATE.restartTimer);
                    STATE.restartTimer = null;
                    queueReactionSync();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    scheduleRestart();
                }
            });
        STATE.channel = channel;
        try { window.NILTASK_RealtimeManager?.register?.(OWNER, channel); } catch (e) {}
        return true;
    }

    function snapshot() {
        return {
            version: VERSION,
            owner: OWNER,
            installed: STATE.installed,
            disposed: STATE.disposed,
            userId: STATE.userId,
            tenantId: STATE.tenantId,
            topic: STATE.topic,
            channelState: STATE.channel?.state || STATE.channelStatus || null,
            typingSent: STATE.typingSent,
            typingReceived: STATE.typingReceived,
            activeTypingUsers: STATE.typingUsers.size,
            reactionSyncs: STATE.reactionSyncs,
            offlineSaves: STATE.offlineSaves,
            offlineRestores: STATE.offlineRestores,
            replyRowsDecorated: STATE.replyRowsDecorated,
            mobileObserverActive: Boolean(STATE.mobileObserver),
            desktopObserverActive: Boolean(STATE.desktopObserver)
        };
    }

    function printSnapshot() {
        const data = snapshot();
        try { console.log('[NILTASK ChatParity]', data); } catch (e) {}
        return data;
    }

    async function dispose(reason = 'manual') {
        if (STATE.disposed) return;
        STATE.disposed = true;
        clearTimeout(STATE.cacheTimer);
        clearTimeout(STATE.decorateTimer);
        clearTimeout(STATE.reactionSyncTimer);
        clearTimeout(STATE.restartTimer);
        STATE.typingTimers.forEach(timer => clearTimeout(timer));
        STATE.typingTimers.clear();
        STATE.typingUsers.clear();
        STATE.mobileObserver?.disconnect?.();
        STATE.desktopObserver?.disconnect?.();
        STATE.mobileObserver = null;
        STATE.desktopObserver = null;
        document.removeEventListener('input', onInput, true);
        document.removeEventListener('focusout', onFocusOut, true);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
        await stopChannel();
        try { window.dispatchEvent(new CustomEvent('niltask:chat-parity-stopped', { detail:{ reason } })); } catch (e) {}
    }

    function onVisibility() {
        if (document.visibilityState !== 'visible' || STATE.disposed) return;
        installObservers();
        processMobileAreas();
        decorateDesktopReplies();
        queueReactionSync();
        if (!STATE.channel || STATE.channel.state !== 'joined') startChannel();
    }

    function onOnline() {
        if (STATE.disposed) return;
        processMobileAreas();
        queueReactionSync();
        if (!STATE.channel || STATE.channel.state !== 'joined') startChannel();
    }

    function install() {
        if (STATE.installed || STATE.disposed) return;
        const current = identity();
        if (!window.sb || !current.userId || !current.tenantId) return;
        STATE.installed = true;
        STATE.userId = current.userId;
        STATE.tenantId = current.tenantId;
        document.addEventListener('input', onInput, true);
        document.addEventListener('focusout', onFocusOut, true);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', onOnline, { passive:true });
        window.addEventListener('niltask:mobile-runtime-stopped', () => dispose('mobile-runtime-stopped'), { once:true });
        window.addEventListener('niltask:subscriptions-started', () => {
            if (!STATE.disposed && (!STATE.channel || STATE.channel.state !== 'joined')) startChannel();
        });
        installObservers();
        startChannel();
    }

    window.NILTASK_ChatParity = Object.freeze({
        version: VERSION,
        start: startChannel,
        syncReactions,
        decorateDesktopReplies,
        processOfflineCache: processMobileAreas,
        snapshot,
        printSnapshot,
        dispose
    });
    window.NILTASK_CHAT_PARITY_VERSION = VERSION;

    let attempts = 0;
    const installer = setInterval(() => {
        attempts += 1;
        install();
        if (STATE.installed || attempts >= INSTALL_LIMIT) clearInterval(installer);
    }, 100);
})();