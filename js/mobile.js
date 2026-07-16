import { sb } from './shared.js';

const MOB = 768;
const _MOB_VER = 'v199';

// Console capture now lives in the GLOBAL recorder (inline script at the very top
// of index.html → window.__LOG), so it records EVERY console call + uncaught
// errors + promise rejections from the first line, and survives reloads/crashes.
// Tapping the version badge copies that full buffer (this session + the previous
// session's tail). Long-press the badge clears it.
window._copyLogs = () => {
    const arr = (window.__LOG && window.__LOG.length) ? window.__LOG : ['(no logs captured yet)'];
    const txt = '['+_MOB_VER+' log dump '+new Date().toISOString()+']\n'+arr.join('\n');
    navigator.clipboard?.writeText(txt)
        .then(() => _toast('Logs copied ✓ ('+arr.length+' lines) — paste anywhere'))
        .catch(() => _toast('Clipboard denied — use ?debug','err'));
};
window._clearLogs = () => { try { window.__clearLog?.(); } catch(e){} _toast('Logs cleared'); };
let _stack  = [];
let _uid    = null;
let _tid    = null;
let _tsInterval = null;
let _users  = [];
let _pendingUploadTaskId = null;
let _pendingDeptPhoto = null;
// Primary mobile realtime channel carries DB changes. A second lightweight bridge
// channel uses the same taskflow-bc topic as web/PWA for cross-platform broadcasts;
// keeping DB callbacks off the bridge avoids the duplicate-topic/late-callback issue
// while still syncing photos, reactions, typing, and read receipts across platforms.
let _rtChannel = null;
let _bridgeChannel = null;
let _presenceChannel = null;   // Supabase Presence: instant online/offline for the green/maroon dots
// Rooms we've seen a live message for this session. Since Patch Set 2 removed the
// hand-increment that used to seed window.unreadCounts, reconcile needs another way
// to know about a room that isn't in DEPTS/_customGroups yet (e.g. a group created
// on another device, or 'general') — otherwise its unread is never computed.
const _seenRooms = new Set();
// De-dupes the author's self-inserted reaction notification against the twin
// delivery (postgres_changes + broadcast) for the same (message_id, reactor).
const _reactNotifSeen = new Set();
// Broadcast on the cross-platform bridge. self:false already stops our own echo, so
// every other client (web src:'w', mobile src:'m') receives it once.
function _bcSend(event, payload) {
    const msg = { type:'broadcast', event, payload:{ ...payload, src:'m' } };
    try { (_bridgeChannel || _rtChannel)?.send(msg); } catch {}
}
// Refresh the Realtime socket's auth token from the current session — an expired JWT
// can silently wedge postgres_changes delivery until a full reconnect. Cheap; call
// before every (re)subscribe and on wake.
async function _refreshRtAuth() {
    try {
        const { data } = await sb.auth.getSession();
        const tok = data?.session?.access_token;
        if (tok) sb.realtime.setAuth(tok);
    } catch (e) {}
}
let _notifPoll = null;
let _navGen = 0;   // render-race guard (see _render)
let _swipeStart = null, _swipeRow = null, _swipeTriggered = false;
let _searchMode = false;
let _customGroups = [];
let _userRoles = {};
let _typingUsers = {};
let _typingTimers = {};
let _rtReconnectTimer = null;
let _rtWasErrored = false;
let _rtIntentionalClose = false;
let _typingThrottle = 0;
let _notifFallbackInterval = null;
let _fallbackTimer = null;   // adaptive fallback-poll timer (see _scheduleFallback)
let _activityPoll = null;    // 12s refresh while the Activity screen is open (realtime safety net)
let _bellCount = 0;   // BELL = attention-only count (mentions/replies/reactions/tasks/reminders)
let _activityHasNew = false;   // Activity TIMELINE tab: show a subtle "new" dot when unseen items exist
let _replyMapCache = {};   // room_id -> {parentId: replyCount} so thread buttons show on instant shell render
let _lastScrollTs = 0;     // last time the user scrolled any list — pauses background re-renders
let _liveUnreadTs = {};    // room_id -> last live-message time; guards its badge from a lagging DB reconcile
let _scrollFabCount = 0;
let _oldestTs = {};      // room_id -> created_at of oldest loaded message (pagination)
let _allLoaded = {};     // room_id -> true when no older messages remain
let _loadingOlder = false;

function _lsKey(k) { return (_tid ? _tid+'_' : '')+k; }
function _lsSet(k,v) { try { localStorage.setItem(_lsKey(k),v); } catch{} }
function _lsGet(k,def='') {
    const val = localStorage.getItem(_lsKey(k));
    if (val !== null && val !== '') return val;
    const legacy = localStorage.getItem(k);
    if (legacy !== null) {
        try { localStorage.setItem(_lsKey(k), legacy); } catch{}
        return legacy;
    }
    return def;
}
function _lsRm(k) { localStorage.removeItem(_lsKey(k)); }

function _roleChip(userId) {
    const r = (_userRoles[userId] || '').toLowerCase();
    if (!r) return '';
    const cfg = {
        principal: { bg:'#dc2626', label:'Principal' },
        hod:       { bg:'#ea580c', label:'HOD' },
        teacher:   { bg:'#2563eb', label:'Teacher' },
        student:   { bg:'#6b7280', label:'Student' },
    };
    const c = cfg[r] || { bg:'#6b7280', label:r };
    return `<span class="m-role-chip" style="background:${c.bg};">${x(c.label)}</span>`;
}

// Standard presence palette (per request): dark green = online, maroon = offline.
const _ONLINE_GREEN = '#15803d', _OFFLINE_MAROON = '#7f1d1d';
// Live-presence set, populated INSTANTLY by the Supabase presence channel
// (join/leave). This is the authoritative "online now" signal; the last_seen
// timestamp is only a fallback when the presence socket is momentarily down.
const _onlineSet = new Set();
function _isOnline(uid) {
    if (_onlineSet.has(uid)) return true;
    const u = _users.find(u => u.id === uid);
    const diffMin = u?.last_seen ? (Date.now() - new Date(u.last_seen).getTime()) / 60000 : Infinity;
    return diffMin < 3;
}
function _onlineStatus(uid) {
    if (_isOnline(uid)) return `<span style="color:${_ONLINE_GREEN};font-weight:700;">● Online</span>`;
    const u = _users.find(u => u.id === uid);
    if (!u?.last_seen) return `<span style="color:${_OFFLINE_MAROON};font-weight:700;">● Offline</span>`;
    const diffMin = (Date.now() - new Date(u.last_seen).getTime()) / 60000;
    if (diffMin < 60)   return `Last seen ${Math.round(diffMin)}m ago`;
    if (diffMin < 1440) return `Last seen ${Math.round(diffMin/60)}h ago`;
    return `<span style="color:${_OFFLINE_MAROON};font-weight:700;">● Offline</span>`;
}

function _onlineDot(uid) {
    // Dark green when online, maroon when offline — shown on every avatar.
    return `<span class="m-presence-dot" style="background:${_isOnline(uid) ? _ONLINE_GREEN : _OFFLINE_MAROON};"></span>`;
}
// Repaint EVERY presence dot currently on screen (used on presence sync/join/leave).
function _repaintAllDots() {
    document.querySelectorAll('[data-uid]').forEach(el => {
        const uid = el.getAttribute('data-uid');
        const holder = el.querySelector('div[style*="position:relative"]');
        if (!holder) return;
        holder.querySelector('.m-presence-dot')?.remove();
        const html = _onlineDot(uid);
        if (html) holder.insertAdjacentHTML('beforeend', html);
    });
    // DM header status line, if a DM is open.
    document.querySelectorAll('[data-online-uid]').forEach(el => {
        el.innerHTML = _onlineStatus(el.getAttribute('data-online-uid'));
    });
}

// Top-bar connectivity chip: dark-green "Online" when the device has a network
// AND the realtime socket is joined; maroon "Offline" otherwise. Replaces the
// Capacitor WebView "web page not available" experience with a clear status.
function _setConnState(online) {
    const el = _el('mConnState');
    if (!el) return;
    const ok = (online !== undefined) ? online
        : (navigator.onLine && (!_rtChannel || _rtChannel.state === 'joined'));
    // A short coloured underline below the name: dark green when online, maroon when
    // offline (replaces the "● Online/Offline" text chip).
    el.textContent = '';
    el.title = ok ? 'Online' : 'Offline';
    el.style.cssText = 'display:block;height:3px;width:32px;border-radius:2px;margin-top:3px;background:' + (ok ? _ONLINE_GREEN : _OFFLINE_MAROON) + ';';
}

function _updateTypingUI(room) {
    const el = _el('mTypingArea');
    if (!el) return;
    const users = Object.values(_typingUsers[room] || {});
    if (!users.length) { el.innerHTML = ''; return; }
    const names = users.map(u => u.name.split(' ')[0]).join(', ');
    const label = users.length === 1 ? `${x(names)} is typing` : `${x(names)} are typing`;
    el.innerHTML = `<div class="m-typing"><span class="m-typing-dots"><span></span><span></span><span></span></span><span class="m-typing-text">${label}</span></div>`;
}

// Default departments are abolished — all groups come from room_settings
// (_customGroups). DEPTS is kept as an empty list so the many [...DEPTS, ...]
// spreads throughout the file keep working without change.
function _buildDepts() { return []; }
let DEPTS = _buildDepts();
function _refreshDeptNames() { DEPTS = _buildDepts(); }

// Group lookup helpers (all groups now live in _customGroups).
function _findGroup(id) { return _customGroups.find(g => g.id === id); }
// Exact DM-participant check — split on '_' so a uuid only matches a full segment.
function _isDmMine(room) {
    return typeof room === 'string' && room.startsWith('dm_') && room.split('_').includes(_uid);
}

function _showOfflineBanner(show) {
    let el = document.getElementById('mOfflineBanner');
    if (!el && show) {
        el = document.createElement('div');
        el.id = 'mOfflineBanner';
        el.style.cssText = 'background:#f59e0b;color:#fff;font-size:11px;font-weight:700;' +
            'text-align:center;padding:3px 10px;border-radius:8px;white-space:nowrap;flex-shrink:0;';
        el.textContent = '⚡ Offline';
        document.getElementById('mSB')?.appendChild(el);
    }
    if (el) el.style.display = show ? 'flex' : 'none';
}
window.addEventListener('offline', () => { _isOffline = true;  _showOfflineBanner(true);  try { _setConnState(false); } catch(e){} });
window.addEventListener('online',  () => { _isOffline = false; _showOfflineBanner(false); _flushOfflineQueue(); try { _setConnState(true); } catch(e){} });

function _getOfflineQueue() { try { return JSON.parse(localStorage.getItem('mob_send_queue')||'[]'); } catch { return []; } }
function _saveOfflineQueue(q) { try { localStorage.setItem('mob_send_queue', JSON.stringify(q)); } catch {} }

async function _flushOfflineQueue() {
    const q = _getOfflineQueue();
    if (!q.length) return;
    const failed = [];
    for (const item of q) {
        const { data: m, error } = await sb.from('messages').insert(item.payload).select().single();
        if (error) { failed.push(item); continue; }
        // Replace pending bubble with real one
        const pending = document.getElementById('pending-'+item.pendingId);
        if (pending) {
            const realHtml = _bubbleHTML(m, {});
            pending.outerHTML = realHtml;
        }
        // Update room cache
        const cached = _loadRoomCache(item.payload.room_id) || [];
        cached.push(m);
        _saveRoomCache(item.payload.room_id, cached);
    }
    _saveOfflineQueue(failed);
    if (!failed.length) console.log('[mob-offline] queue flushed OK');
    else console.log('[mob-offline] '+failed.length+' items still pending');
}

// iOS fix: #mobileApp is position:fixed;inset:0, so when the soft keyboard opens
// iOS does NOT shrink the fixed element — the bottom composer ends up hidden behind
// the keyboard and the input feels unusable. The visualViewport API reports the
// actually-visible region; pin the app to it so the composer stays above the keyboard.
let _kbApplyRaf = 0;
function _initKeyboardHandling() {
    const vv = window.visualViewport;
    const app = _el('mobileApp');
    if (!vv || !app) return;
    const apply = () => {
        _kbApplyRaf = 0;
        app.style.top = vv.offsetTop + 'px';
        app.style.height = vv.height + 'px';
        app.style.bottom = 'auto';
    };
    const schedule = () => { if (!_kbApplyRaf) _kbApplyRaf = requestAnimationFrame(apply); };
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    // Keep the focused composer in view when it gains focus (keyboard opening).
    app.addEventListener('focusin', e => {
        if (!e.target.closest?.('.m-ce, .m-inp, input, textarea')) return;
        setTimeout(() => { try { e.target.scrollIntoView({ block:'center', behavior:'smooth' }); } catch {} }, 250);
    });
    apply();
}

// Fill an image-preview placeholder with a signed URL from the private bucket
// (mirrors _openTaskFile's path handling). Runs once per <img data-imgpath>.
// A per-path signed-URL cache ensures re-renders reuse the SAME url string so the
// browser serves it from its HTTP cache instead of re-downloading — no more flashing
// while scrolling / on _pendingRefresh.
const _imgUrlCache = {};
function _signImg(img) {
    if (!img) return;
    const path = img.getAttribute('data-imgpath');
    if (!path) return;
    if (_imgUrlCache[path]) {
        img.dataset.hydrated = '1';
        if (img.getAttribute('src') !== _imgUrlCache[path]) img.src = _imgUrlCache[path];
        return;
    }
    if (img.dataset.hydrated) return;
    img.dataset.hydrated = '1';
    sb.storage.from('task-proofs').createSignedUrl(path, 3600)
        .then(({ data }) => { if (data?.signedUrl) { _imgUrlCache[path] = data.signedUrl; img.src = data.signedUrl; } })
        .catch(() => {});
}
// Watch the shell for any image previews added by any render path and hydrate them.
function _initImgHydration() {
    const app = _el('mobileApp'); if (!app) return;
    app.querySelectorAll('img[data-imgpath]').forEach(_signImg);
    try {
        new MutationObserver(muts => {
            for (const mu of muts) for (const n of mu.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.matches?.('img[data-imgpath]')) _signImg(n);
                n.querySelectorAll?.('img[data-imgpath]').forEach(_signImg);
            }
        }).observe(app, { childList:true, subtree:true });
    } catch (e) {}
}

// ── Mobile theme: System (default) / Light / Dark ─────────────────────────
// Uses theme.css's [data-theme="dark"] token set; 'system' follows the OS.
function _applyMobTheme() {
    let mode = 'system';
    try { mode = localStorage.getItem('mob_theme') || 'system'; } catch (e) {}
    const dark = mode === 'dark' ||
        (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
    try {
        if (dark) document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
        // Keep the gutter lock in sync (kills the ocean-teal green margin, both modes).
        const appbg = dark ? '#000000' : '#eef0f8';
        document.documentElement.style.background = appbg;
        if (document.body) document.body.style.background = appbg;
        const lock = document.getElementById('mobBgLock');
        if (lock) lock.textContent = 'html,body{background:' + appbg + ' !important;margin:0 !important;}';
    } catch (e) {}
    const b = _el('mSBTheme');
    if (b) {
        const ic = { system:'fa-circle-half-stroke', light:'fa-sun', dark:'fa-moon' }[mode];
        b.innerHTML = '<i class="fa-solid ' + ic + '"></i>';
        b.title = 'Theme: ' + mode.charAt(0).toUpperCase() + mode.slice(1);
    }
}
window._cycleMobTheme = function() {
    const order = ['system', 'light', 'dark'];
    let mode = 'system';
    try { mode = localStorage.getItem('mob_theme') || 'system'; } catch (e) {}
    const next = order[(order.indexOf(mode) + 1) % order.length];
    try { localStorage.setItem('mob_theme', next); } catch (e) {}
    _applyMobTheme();
    _toast('Theme: ' + next.charAt(0).toUpperCase() + next.slice(1));
};
try { window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => _applyMobTheme()); } catch (e) {}

window.initMobileApp = async function() {
    if (!(window.isMobileView?.() ?? (window.innerWidth <= MOB))) return;
    // Eruda is a heavy debug console (~100KB from CDN). Load it ONLY when explicitly
    // debugging (?debug in the URL or localStorage.mobDebug='1') so it no longer taxes
    // every production launch.
    const _wantDebug = /[?&]debug\b/.test(location.search) || localStorage.getItem('mobDebug') === '1';
    if (_wantDebug && !window.__erudaLoaded) {
        window.__erudaLoaded = true;
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/eruda';
        s.onload = () => eruda.init();
        document.head.appendChild(s);
    }
    _el('root')?.style.setProperty('display', 'none', 'important');
    window.unreadCounts = window.unreadCounts || {};
    _applyMobTheme();   // System (default) / Light / Dark — user-controlled from the top bar
    _injectCSS();
    _buildShell();
    _initKeyboardHandling();
    _initImgHydration();
    // Hydrate the room-message mirror from IndexedDB in parallel with the
    // context load — chats then open instantly with up to 150 cached messages.
    await Promise.all([_ctx(), _hydrateRoomCaches()]);
    // NAME FIX: the shell (header) was built BEFORE _ctx resolved the display name
    // from profiles, so repaint the name label now that window.currentUser.full_name
    // is synced — verbatim, preserving the inline connection chip.
    try {
        const _u = _el('mSBInfo')?.querySelector('.m-sb-user');
        const _nm = window.currentUser?.full_name || _uname(_uid) || window.currentUser?.email?.split('@')[0] || 'User';
        if (_u) _u.innerHTML = x(_nm) + '<span id="mConnState" class="m-conn"></span>';
    } catch (e) {}
    // Principals/admins get a toggle to the Admin Panel (permission known after _ctx).
    if (window.currentPermissions?.admin_panel) _el('mSBAdmin')?.style.setProperty('display','flex');
    // Resume where the user left off last session (#7). Falls back to home if the
    // saved screen is missing/invalid or the chat no longer exists.
    let _resumed = false;
    try {
        const last = JSON.parse(localStorage.getItem('mob_last_nav') || 'null');
        if (last && last.screen) {
            if (last.screen === 'groupChat' && last.room && _findGroup(last.room)) {
                const g = _findGroup(last.room);
                await _navTo('home', null, true);
                await _navTo('groupChat', { room:g.id, name:g.name, color:g.col });
                _resumed = true;
            } else if (last.screen === 'dm' && last.room && last.uid) {
                await _navTo('home', null, true);
                await _navTo('dm', { uid:last.uid, name:last.name || _uname(last.uid), room:last.room });
                _resumed = true;
            } else if (['home','activity','tasks','marks'].includes(last.screen)) {
                await _navTo(last.screen);
                _resumed = true;
            }
        }
    } catch (e) {}
    if (!_resumed) await _navTo('home');
    window._hideSplash?.();   // first screen painted — drop the boot splash
    _initRealtime();
    try { _setConnState(); } catch(e){}   // paint the initial Online/Offline chip
    // Deep-link: open a specific chat from a push tap (?room=…) or SW message.
    _openRoomFromUrl();
    // Web Share Target: content shared into the app from the OS share sheet.
    _handleShareTarget();
    try {
        navigator.serviceWorker?.addEventListener('message', (e) => {
            if (e.data?.type === 'open-room' && e.data.room) _openRoomByRoom(e.data.room);
        });
    } catch (e) {}
    if (_notifFallbackInterval) clearInterval(_notifFallbackInterval);
    if (_fallbackTimer) clearTimeout(_fallbackTimer);
    _scheduleFallback();   // ADAPTIVE poll (see below) — faster catch-up when the socket is dead
    // Real-time safety net for the Activity screen: realtime already refreshes it,
    // but the mobile socket flaps. While the Activity screen is open, reload it
    // every 12s so it stays live regardless of socket health (matches web).
    if (_activityPoll) clearInterval(_activityPoll);
    _activityPoll = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        if (Date.now() - _lastScrollTs < 1200) return;   // don't refresh mid-scroll
        const t = _stack[_stack.length-1];
        // Refresh the open feed every 12s as a safety net — the mobile socket silently
        // drops events while reporting 'joined', so live-refresh alone MISSES items.
        // This is flicker-free now: the card entrance animation is gone and _render's
        // sig-cache / innerHTML guard skips the DOM swap when nothing changed.
        if (t?.screen === 'activity' || t?.screen === 'notifications') { try { _render(t.screen, t.params, 'none'); } catch(e){} }
    }, 12000);
    _showOfflineBanner(_isOffline);
    // Auto-refresh displayed timestamps every 60s + update last_seen heartbeat
    if (_tsInterval) clearInterval(_tsInterval);
    _tsInterval = setInterval(() => {
        // Skip the tick while backgrounded — no DOM to update, and the last_seen
        // heartbeat shouldn't burn network/battery when the app isn't visible.
        if (document.visibilityState !== 'visible') return;
        document.querySelectorAll('.m-bmeta[data-ts]').forEach(el => {
            el.textContent = el.dataset.label + ' · ' + _ago(el.dataset.ts);
        });
        if (_uid) sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', _uid).then(() => {});
        _ensureRealtimeAlive();   // heal silently-dead realtime channels
        _refreshPresence();       // re-fetch everyone's last_seen so online dots stay live even if realtime flapped
        // DIAGNOSTIC (crash hunt): log JS-heap MB + total DOM node count each minute.
        // If either climbs steadily before the 5-8 min restart, it's a memory leak /
        // DOM growth; if they stay flat and it still crashes, it points at the
        // Tailwind CDN observer / external memory. One line/min — negligible.
        try {
            const mem = performance?.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : '?';
            const nodes = document.getElementsByTagName('*').length;
            console.log('[mem] heapMB='+mem+' domNodes='+nodes);
        } catch (e) {}
    }, 60000);
    window.addEventListener('resize', () => {
        const m = window.isMobileView?.() ?? (window.innerWidth <= MOB);
        _el('mobileApp')?.style.setProperty('display', m ? 'flex' : 'none', 'important');
        if (m) _el('root')?.style.setProperty('display', 'none', 'important');
    }, { passive: true });
    // Native resume behavior: coming back from the background silently refreshes the
    // unread badge AND verifies the realtime channels are actually alive. Backgrounded
    // sockets can die WITHOUT emitting CLOSED — replies/reactions then stop applying
    // until a manual reopen. If any channel isn't 'joined', rebuild them.
    // FULL foreground resync (advisor fix #1): when the app returns to view, don't
    // just check the socket — pull the DB truth for badges, per-chat unread, the
    // OPEN chat, and the Activity feed, so a screen that went stale while the socket
    // was dead catches up instantly instead of waiting for the next poll tick.
    const _foregroundResync = () => {
        refreshNotificationUI();                       // bell + unread + app badge + feed, together
        try { _pendingRefresh?.(); } catch (e) {}      // re-pull the currently open chat
        _ensureRealtimeAlive();
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _foregroundResync();
    });
    // Android fires these where visibilitychange is sometimes missed — same healing.
    window.addEventListener('focus',  _foregroundResync, { passive:true });
    window.addEventListener('online', _foregroundResync, { passive:true });
};

// Verify realtime health; silently rebuild the channels if the socket died quietly.
function _ensureRealtimeAlive() {
    try {
        const dead = c => c && c.state !== 'joined' && c.state !== 'joining';
        if (!_rtChannel || dead(_rtChannel)) {
            _refreshRtAuth();   // freshen the token before rebuilding on wake
            _rtIntentionalClose = true;
            try { if (_rtChannel) sb.removeChannel(_rtChannel); } catch (e) {}
            _rtChannel = null;
            _rtIntentionalClose = false;
            _initRealtime();
        }
    } catch (e) {}
}

let _isOffline = !navigator.onLine;
let _pendingRefresh = null;
let _refreshGen = 0;

// Per-room message cache: in-memory mirror (sync reads, no render stalls) +
// write-through to IndexedDB via LocalDB (150 msgs/room, hydrated at boot) +
// localStorage (50 msgs/room) as the always-available fallback.
const _memRoomCache = {};
async function _hydrateRoomCaches() {
    try {
        const map = await window.LocalDB?.allRooms?.();
        if (map) for (const [rid, msgs] of Object.entries(map)) {
            if (!_memRoomCache[rid]) _memRoomCache[rid] = msgs;
        }
    } catch (e) {}
}
function _saveRoomCache(roomId, msgs) {
    _memRoomCache[roomId] = msgs.slice(-150);
    _lsSet('mob_msgs_'+roomId, JSON.stringify(msgs.slice(-50)));
    window.LocalDB?.putRoom?.(roomId, _memRoomCache[roomId]);   // fire-and-forget
}
function _loadRoomCache(roomId) {
    if (_memRoomCache[roomId]) return _memRoomCache[roomId];
    try { return JSON.parse(_lsGet('mob_msgs_'+roomId)||'null'); } catch { return null; }
}
function _loadReactionsCache() {
    try { return JSON.parse(_lsGet('mob_reactions')||'{}'); } catch { return {}; }
}
// Users-list cache (tenant staff) so the home/DM list paints instantly on launch
// instead of waiting for the profiles round-trip. We cache WITH avatars so the first
// paint is complete and the background refresh usually finds no change → no second
// re-render (no flash). If the payload is too big for the quota, retry without avatars.
function _saveUsersCache(tid, users) {
    if (!tid || !users?.length) return;
    try {
        localStorage.setItem('mob_users_'+tid, JSON.stringify(users));
    } catch {
        try {
            const slim = users.map(({ avatar_url, ...rest }) => rest);
            localStorage.setItem('mob_users_'+tid, JSON.stringify(slim));
        } catch {}
    }
}
function _loadUsersCache(tid) {
    try { return JSON.parse(localStorage.getItem('mob_users_'+tid)||'null'); } catch { return null; }
}
// Cheap signature of what the home/DM list actually shows, so we only re-render when
// something visible changed (new/removed staff, renamed, avatar added/changed).
function _usersSig(list) {
    return (list||[]).map(u => u.id+'|'+(u.full_name||'')+'|'+(u.designation||'')+'|'+(u.avatar_url ? (u.avatar_url.length + ':' + u.avatar_url.slice(0,32)) : '')).sort().join(',');
}
async function _refreshUsers(tid) {
    try {
        const before = _usersSig(_users);
        // PERF (Phase 2.1): select ONLY the light columns needed to render names,
        // roles, presence. avatar_url holds a base64 data-URL (tens of KB each) —
        // pulling it for every tenant member here made the home load transfer
        // hundreds of KB and blocked first paint. Avatars are hydrated separately,
        // off the critical path, by _hydrateAvatars() below.
        const { data } = await sb.from('profiles')
            .select('id,full_name,email,designation,department,last_seen,last_login,tenant_id,deleted_at')
            .eq('tenant_id',tid).is('deleted_at',null);
        if (data?.length) {
            // Preserve any avatar_url already hydrated into the previous list so a
            // light refresh doesn't blank out avatars that were fetched earlier.
            const avById = {};
            (_users||[]).forEach(u => { if (u.avatar_url) avById[u.id] = u.avatar_url; });
            data.forEach(u => { if (avById[u.id]) u.avatar_url = avById[u.id]; });
            _users = data;
            window.globalUsersCache = _users;
            _saveUsersCache(tid, _users);
            try { localStorage.setItem('mob_users_ts_'+tid, String(Date.now())); } catch (e) {}
            // Only re-render if the visible data actually changed — avoids the launch
            // "flash twice" when the cached list already matches the server.
            if (_usersSig(data) !== before) {
                const top = _stack[_stack.length-1];
                if (top?.screen === 'home') { try { _render('home', top.params, 'none'); } catch {} }   // silent, no slide
            }
            _hydrateAvatars(tid);   // fetch base64 avatars off the critical path
        }
    } catch {}
}
// PERF (Phase 2.2): fetch avatar_url separately, AFTER the light user list has
// rendered, then merge in and re-render once. Keeps the heavy base64 payload off
// the blocking home-load path. Runs at most once per session-refresh; cheap when
// avatars are already present in memory.
let _avatarsHydrated = false;
async function _hydrateAvatars(tid) {
    if (_avatarsHydrated) return;
    try {
        const { data } = await sb.from('profiles')
            .select('id,avatar_url').eq('tenant_id',tid).is('deleted_at',null)
            .not('avatar_url','is',null);
        if (!data?.length) return;   // no avatars set — leave unlatched so a later refresh retries
        _avatarsHydrated = true;
        let changed = false;
        const byId = {}; data.forEach(r => { byId[r.id] = r.avatar_url; });
        (_users||[]).forEach(u => { if (byId[u.id] && u.avatar_url !== byId[u.id]) { u.avatar_url = byId[u.id]; changed = true; } });
        if (changed) {
            window.globalUsersCache = _users;
            try { _saveUsersCache(tid, _users); } catch (e) {}
            const top = _stack[_stack.length-1];
            if (top && (top.screen === 'home' || top.screen === 'dm' || top.screen === 'groupChat')) {
                try { _render(top.screen, top.params, 'none'); } catch {}   // silent, no second slide-in
            }
        }
    } catch {} finally { /* allow a later re-hydrate if users list is rebuilt */ }
}
function _saveReactionEntry(msgId, value, type, userId, isDelete) {
    try {
        const cache = _loadReactionsCache();
        if (!cache[msgId]) cache[msgId] = [];
        if (isDelete) {
            cache[msgId] = cache[msgId].filter(r => !(r.value===value && r.user_id===userId));
        } else {
            if (!cache[msgId].find(r => r.value===value && r.user_id===userId)) {
                cache[msgId].push({ message_id:msgId, value, type, user_id:userId });
            }
        }
        _lsSet('mob_reactions', JSON.stringify(cache));
    } catch {}
}

let _usersLoaded = false;
async function _ctx() {
    _uid = window.currentUser?.id;
    _tid = window.currentTenantId;
    if (!_usersLoaded) _users = window.globalUsersCache || [];
    if (!_uid) {
        try {
            const { data: { user } } = await sb.auth.getUser();
            _uid = user?.id;
            window.currentUser = user;
        } catch { /* offline and no prior session — stay on login */ }
    }
    if (_uid && (!_tid || (!_usersLoaded && !_users.length))) {
        if (!_tid) {
            try {
                const { data: p } = await sb.from('profiles').select('tenant_id').eq('id',_uid).single();
                _tid = p?.tenant_id;
                window.currentTenantId = _tid;
            } catch { /* offline — _tid stays null */ }
        }
        if (_tid && !_usersLoaded && !_users.length) {
            // Cache-first: if we have a persisted staff list, use it immediately so the
            // first paint is instant, and refresh from the network in the background.
            const cached = _loadUsersCache(_tid);
            if (cached?.length) {
                _users = cached;
                window.globalUsersCache = _users;
                // The full profiles fetch carries base64 avatars (~1MB). Refresh at
                // most every 15 min — realtime events still deliver live changes.
                const lastFetch = Number(localStorage.getItem('mob_users_ts_'+_tid) || 0);
                if (Date.now() - lastFetch > 15*60*1000) _refreshUsers(_tid);
                // Cache is slimmed (no base64 avatars) — hydrate them off-path so
                // avatars appear even when the 15-min light refresh is skipped.
                _hydrateAvatars(_tid);
            } else {
                try {
                    // PERF (Phase 2.1): light columns only — avatars hydrate off-path.
                    const { data } = await sb.from('profiles')
                        .select('id,full_name,email,designation,department,last_seen,last_login,tenant_id,deleted_at')
                        .eq('tenant_id',_tid).is('deleted_at',null);
                    _users = data || [];
                    window.globalUsersCache = _users;
                    _saveUsersCache(_tid, _users);
                    try { localStorage.setItem('mob_users_ts_'+_tid, String(Date.now())); } catch (e) {}
                    _hydrateAvatars(_tid);
                } catch {
                    _users = window.globalUsersCache || [];
                }
            }
        }
    }
    if (_users.length) _usersLoaded = true;
    // NAME FIX: window.currentUser is the Supabase AUTH user (no full_name), so the
    // header fell back to the email prefix and reverted on every reload. Sync the
    // edited display name from the profiles-backed _users list onto currentUser so
    // the header shows the same verbatim name as the message bubbles (_uname).
    if (_uid && window.currentUser) {
        const me = _users.find(u => u.id === _uid);
        if (me?.full_name) window.currentUser.full_name = me.full_name;
    }
    if (!_tid) {
        console.error('[mob] No tenant_id found for user — aborting session');
        _toast('Account configuration error. Please contact your administrator.', 'err');
        return;
    }
    // Pull the tenant's admin-configured quick-reply tags so they show in the
    // reaction/insert menus on this device too (DB → localStorage).
    window.syncQuickTags?.();

    // These four lookups are independent of each other — run them in PARALLEL
    // instead of four serial awaits so startup does one round-trip's worth of
    // waiting, not four.
    const _tasks = [];

    // Detect orphaned tenant (tenant_id with no tenants row) once, so group
    // creation surfaces a clear message instead of a raw FK error. Skipped if the
    // web auth flow already set the flag.
    if (window._tenantOrphaned === undefined && _tid) {
        _tasks.push((async () => {
            try {
                const { data: t } = await sb.from('tenants').select('id').eq('id', _tid).maybeSingle();
                window._tenantOrphaned = !t;
            } catch { /* network error — leave undefined, don't block */ }
        })());
    }
    // Load RBAC role if not already set by web auth flow
    if (_tid && _uid && !window.currentRole) {
        _tasks.push((async () => {
            try {
                const { data: ur } = await sb.from('user_roles')
                    .select('*, role:roles(name, display_name, permissions)')
                    .eq('user_id', _uid).eq('tenant_id', _tid).single();
                if (ur?.role?.name) window.currentRole = ur.role.name;
                if (ur?.role?.display_name) window.currentRoleName = ur.role.display_name;
                if (ur?.role?.permissions) window.currentPermissions = ur.role.permissions;
            } catch {}
        })());
    }
    // Load all user roles for role badge display
    if (_tid) {
        _tasks.push((async () => {
            try {
                const { data: allRoles } = await sb.from('user_roles')
                    .select('user_id, role:roles(name)').eq('tenant_id', _tid);
                _userRoles = {};
                (allRoles||[]).forEach(r => { if (r.role?.name) _userRoles[r.user_id] = r.role.name; });
            } catch {}
        })());
    }
    // Sync room names from DB → localStorage → DEPTS; also collect custom groups
    _tasks.push(_syncRoomSettings());

    await Promise.all(_tasks);
}

// Fetch room_settings from DB, sync names/colors to localStorage, and rebuild _customGroups.
// Called at startup (_ctx) and on live group_photo broadcasts so new groups appear without reload.
async function _syncRoomSettings() {
    if (!_tid) return;
    try {
        // Try to include members (DB column may not exist yet — fall back gracefully).
        let rs = null;
        const withMembers = await sb.from('room_settings')
            .select('room_id,name,color,archived,members,admins').eq('tenant_id', _tid);
        if (withMembers.error) {
            const basic = await sb.from('room_settings')
                .select('room_id,name,color,archived').eq('tenant_id', _tid);
            rs = basic.data;
        } else {
            rs = withMembers.data;
        }
        if (rs?.length) {
            rs.forEach(r => {
                if (r.name)  _lsSet('dept_name_'+r.room_id, r.name);
                if (r.color) _lsSet('dept_color_'+r.room_id, r.color);
                // Hydrate members from DB so counts match across devices/users
                if (Array.isArray(r.members)) _lsSet('dept_members_'+r.room_id, JSON.stringify(r.members));
                if (Array.isArray(r.admins))  _lsSet('dept_admins_'+r.room_id, JSON.stringify(r.admins));
            });
            _refreshDeptNames();
            // Every non-archived, non-DM room is a group (no more hard-coded defaults).
            _customGroups = rs
                .filter(r => !r.archived && !r.room_id.startsWith('dm_'))
                .map(r => ({ id:r.room_id, name:r.name||r.room_id, col:r.color||'#8b5cf6', photo:_lsGet('dept_photo_'+r.room_id)||'' }));
        } else {
            _customGroups = [];
        }
        // No default group — a new school starts empty; the principal creates the first.
        // Pull group photos from storage (signed URL) so photos set on other devices show.
        await Promise.all(_customGroups.map(async g => {
            const ts = parseInt(_lsGet('dept_photo_ts_'+g.id)||'0');
            const noneTs = parseInt(_lsGet('dept_photo_none_'+g.id)||'0');
            if (g.photo && ts && (Date.now()-ts < 1800000)) return;          // fresh cache
            if (!g.photo && noneTs && (Date.now()-noneTs < 86400000)) return; // known "no photo"
            try {
                const { data: sd, error } = await sb.storage.from('task-proofs')
                    .createSignedUrl(`group-photos/${_tid}/${g.id}.jpg`, 3600);
                if (!error && sd?.signedUrl) {
                    g.photo = sd.signedUrl;
                    _lsSet('dept_photo_'+g.id, sd.signedUrl);
                    _lsSet('dept_photo_ts_'+g.id, String(Date.now()));
                } else {
                    _lsSet('dept_photo_none_'+g.id, String(Date.now()));
                }
            } catch(e){}
        }));
    } catch {}
}

// Upsert room_settings including members + co-admins; retries with fewer optional
// columns if a column doesn't exist yet (graceful pre-migration degradation).
async function _upsertRoomSettings(base, members, admins) {
    const hasM = Array.isArray(members), hasA = Array.isArray(admins);
    if (hasM || hasA) {
        const full = { ...base };
        if (hasM) full.members = members;
        if (hasA) full.admins = admins;
        const r1 = await sb.from('room_settings').upsert(full, { onConflict:'room_id,tenant_id' });
        if (!r1.error) return;
    }
    if (hasM) {   // admins column may be missing — retry with members only
        const r2 = await sb.from('room_settings').upsert({ ...base, members }, { onConflict:'room_id,tenant_id' });
        if (!r2.error) return;
    }
    await sb.from('room_settings').upsert(base, { onConflict:'room_id,tenant_id' });
}
// True if the current user may manage THIS department: a tenant-wide group manager,
// OR a co-admin named on that department (room_settings.admins → dept_admins_<id>).
function _isDeptAdmin(gid) {
    if (window.canManageGroups?.() ?? window.canSeeGroupGear?.()) return true;
    try { return JSON.parse(_lsGet('dept_admins_'+gid) || '[]').includes(_uid); } catch (e) { return false; }
}
window._isDeptAdmin = _isDeptAdmin;
// True if the user is a co-admin of ANY department (so they get the Manage entry
// even without the tenant-wide group-manager role).
function _isAnyDeptAdmin() {
    return [...DEPTS, ..._customGroups].some(d => {
        try { return JSON.parse(_lsGet('dept_admins_'+d.id) || '[]').includes(_uid); } catch (e) { return false; }
    });
}

// Staff picker for the create/edit department sheets: alphabetical, shows each
// person's designation, and a "Select all" master checkbox. Real members are the
// .gm-mem checkboxes (the master is excluded when reading the selection).
function _memberPickerHTML(selected, admins) {
    const sel = new Set(selected || []);
    const adm = new Set(admins || []);
    const sorted = [..._users].sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '', undefined, { sensitivity: 'base' }));
    const allOn = _users.length && _users.every(u => sel.has(u.id));
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer;border-bottom:1px solid var(--border-color);font-weight:700;background:var(--surface,#f8fafc);">
        <input type="checkbox" id="gmSelectAll" ${allOn?'checked':''} onchange="window._gmToggleAll(this.checked)" style="accent-color:#6366f1;">
        <span style="font-size:13px;">Select all staff</span>
      </label>
      ${sorted.map(u => `<label style="display:flex;align-items:center;gap:9px;padding:7px 10px;cursor:pointer;">
        <input type="checkbox" class="gm-mem" value="${u.id}" ${sel.has(u.id)?'checked':''} style="accent-color:#6366f1;flex:0 0 auto;">
        <span style="display:flex;flex-direction:column;line-height:1.25;min-width:0;flex:1;">
          <span style="font-size:13.5px;font-weight:600;">${x(u.full_name || u.email?.split('@')[0] || '')}</span>
          ${u.designation ? `<span style="font-size:11px;color:var(--text-secondary);">${x(u.designation)}</span>` : ''}
        </span>
        <button type="button" class="gm-crown${adm.has(u.id)?' on':''}" data-uid="${u.id}"
          onclick="window._gmToggleCrown(event,this)" title="Make department admin"
          style="flex:0 0 auto;border:none;background:none;font-size:16px;cursor:pointer;opacity:${adm.has(u.id)?'1':'.28'};filter:${adm.has(u.id)?'none':'grayscale(1)'};">👑</button>
      </label>`).join('')}`;
}
window._gmToggleAll = function(on) {
    document.querySelectorAll('#gmMemberList .gm-mem').forEach(cb => { cb.checked = on; });
};
window._gmToggleCrown = function(e, btn) {
    e.preventDefault(); e.stopPropagation();
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    btn.style.opacity = on ? '1' : '.28';
    btn.style.filter = on ? 'none' : 'grayscale(1)';
    // Marking someone an admin implies they're a member — tick the member box.
    if (on) { const cb = btn.closest('label')?.querySelector('.gm-mem'); if (cb) cb.checked = true; }
};

function _buildShell() {
    if (_el('mobileApp')) return;
    // Bottom nav: Chats · Tasks · Activity · Saved · More.
    // Reminders, Schedule, Dashboard & Settings live in the More sheet (role-gated).
    const canTask = window.canSeeTaskHub?.() ?? true;
    const tabs = [
        { id:'home',      icon:'fa-comments',   lbl:'Messages', action:"window._navTo('home')" },
        ...(canTask ? [{ id:'tasks', icon:'fa-list-check', lbl:'Tasks', action:"window._navTo('tasks')" }] : []),
        { id:'activity',  icon:'fa-bolt',       lbl:'Activity', action:"window._navTo('activity')" },
        { id:'marks',     icon:'fa-bookmark',   lbl:'Saved',    action:"window._navTo('marks')" },
        { id:'more',      icon:'fa-ellipsis',   lbl:'More',     action:"window._openMoreSheet()" },
    ];
    const app = document.createElement('div');
    app.id = 'mobileApp';
    app.innerHTML = `
      <div id="mSB">
        <div id="mSBInfo" class="m-sb-info" onclick="window._navTo('home')">
          <div class="m-sb-user">${x(window.currentUser?.full_name || window.currentUser?.email?.split('@')[0] || 'User')}<span id="mConnState" class="m-conn"></span></div>
          <div class="m-sb-school-card">${x(window.currentSchoolName || 'School')} <span onclick="window._copyLogs()" title="Tap to copy console logs" style="font-size:9px;opacity:.5;font-weight:700;letter-spacing:.5px;cursor:pointer;">${window.APP_VER || _MOB_VER}</span></div>
        </div>
        <div id="mSBSearch" class="m-sb-search" style="display:none;">
          <input id="mSBSearchInp" placeholder="Search messages, staff…">
        </div>
        <button class="m-sb-icon" id="mSBAdmin" title="Switch to Admin Panel" onclick="window.location.href='/admin.html'" style="display:none;color:var(--accent,#6366f1);"><i class="fa-solid fa-user-shield"></i></button>
        <button class="m-sb-icon" id="mSBLens" title="Search" onclick="window._toggleInlineSearch()"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-sb-icon" id="mSBTheme" title="Theme: System / Light / Dark" onclick="window._cycleMobTheme()"><i class="fa-solid fa-circle-half-stroke"></i></button>
        <button class="m-sb-icon" id="mSBDnd" title="Do Not Disturb" data-action="toggleDND" style="${(window._isDND?.())?'color:#ef4444;':''}">
          <i class="fa-solid ${(window._isDND?.())?'fa-volume-xmark':'fa-volume-high'}"></i>
        </button>
        <button class="m-sb-icon" id="mSBBell" title="Notifications" data-action="openNotifs" style="position:relative;">
          <i class="fa-solid fa-bell"></i>
          <span id="mNotifBadge" class="m-notif-badge" style="display:none;"></span>
        </button>
        <button class="m-sb-icon" title="Sign out" onclick="window._confirmLogout()"><i class="fa-solid fa-right-from-bracket"></i></button>
        <div id="mSBResults"></div>
      </div>
      <div id="mStage"></div>
      <div id="mNav">
        ${tabs.map(t=>`
          <button class="mn-btn" id="mnt-${t.id}" onclick="${t.action}" style="position:relative;">
            <i class="fa-solid ${t.icon}"></i>
            ${t.id==='activity'?`<span class="mn-badge" id="mnActBadge" style="display:none;"></span>`:''}
            <span class="mn-lbl">${t.lbl}</span>
          </button>`).join('')}
      </div>
      <div id="mSheet"><div id="mSheetInner"></div></div>
      <input type="file" id="mDeptPhotoInput" style="display:none;" accept="image/*">
      <div id="mFmtPopup" class="m-fmt-popup">
        <button data-fmt="bold"><i class="fa-solid fa-bold"></i></button>
        <button data-fmt="italic"><i class="fa-solid fa-italic"></i></button>
        <button data-fmt="underline"><i class="fa-solid fa-underline"></i></button>
      </div>
      <div id="mToast"></div>`;
    document.body.appendChild(app);

    _el('mFmtPopup').addEventListener('mousedown', e => {
        const btn = e.target.closest('[data-fmt]');
        if (!btn) return;
        e.preventDefault();
        document.execCommand(btn.dataset.fmt, false, null);
    });

    _el('mSheet').addEventListener('click', e => {
        if (e.target.id === 'mSheet') window._closeSheet();
    });
    _el('mSheetInner').addEventListener('click', _onSheetClick);
    _el('mSheetInner').addEventListener('focusin', e => {
        if (e.target.matches('input,select,textarea')) {
            setTimeout(() => e.target.scrollIntoView({ block:'center', behavior:'smooth' }), 300);
        }
    });
    // A thrown error inside any tap action must never leave the shell wedged —
    // catch, log, and surface a soft toast instead of dying silently.
    app.addEventListener('click', (e) => {
        Promise.resolve(_onShellClick(e)).catch(err => {
            console.error('[mob] action failed:', err?.message || err);
            _toast('Something went wrong — try again', 'err');
        });
    });
    app.addEventListener('pointerdown', _onPressStart);
    app.addEventListener('pointerup', _onPressEnd);
    app.addEventListener('pointerleave', _onPressEnd);
    app.addEventListener('pointercancel', _onPressEnd);
    app.addEventListener('pointermove', _onPressMove, { passive:true });
    // NOTE: do NOT cancel the long-press on raw touchmove — a resting finger emits
    // touchmove constantly, which killed the 550ms hold before it could fire (the
    // "no menu" bug). Movement is governed by _onPressMove (14px tolerance) instead.
    // Only a real scroll of the message list cancels the press.
    app.addEventListener('scroll', _onPressEnd, { passive:true, capture:true });
    // Stamp the last scroll time so background refreshes can hold off while the user
    // is actively scrolling a list (keeps the Activity feed / chat scroll smooth).
    app.addEventListener('scroll', () => { _lastScrollTs = Date.now(); }, { passive:true, capture:true });
    document.addEventListener('selectionchange', _onSelectionChange);
    // Suppress native copy/cut/paste toolbar when our format bar is active
    document.addEventListener('contextmenu', e => {
        if (e.target.closest('.m-ce')) { e.preventDefault(); return; }
        const row = e.target.closest('.m-bubble-row');
        if (row && row.id.startsWith('row-')) {
            e.preventDefault();
            // Fallback trigger: some devices deliver contextmenu instead of completing
            // the pointer-hold — open the same message action sheet.
            const id = row.id.replace('row-','');
            const me = row.classList.contains('snt');
            const text = row.querySelector('.m-btext')?.textContent || '';
            const time = row.dataset.time || '';
            const params = _stack[_stack.length-1]?.params || {};
            window._showMsgActions({ id, text, me, time, room: params.room||'', rname: params.name||'', rcol: params.color||'' });
            navigator.vibrate?.(35);
        }
    }, true);

    // Broadcast typing indicator on input in any chat composer
    app.addEventListener('input', e => {
        const ce = e.target.closest('.m-ce');
        if (!ce) return;
        _detectMention(ce);   // @mention picker
        const top = _stack[_stack.length-1];
        const room = top?.params?.room;
        if (!room || !_rtChannel) return;
        const now = Date.now();
        if (now - _typingThrottle < 2000) return;
        _typingThrottle = now;
        _bcSend('typing', { room, uid:_uid, name:_uname(_uid) });
    });

    // Swipe-right-to-reply gesture. Direction-locking: the first ~10px of movement
    // decides horizontal vs vertical; once locked horizontal, a natural finger arc
    // (dy up to 40px) no longer cancels the swipe — this is what made it feel
    // unresponsive before (any 15px of vertical drift aborted the gesture).
    let _swipeLocked = null;   // null=undecided, 'h'=horizontal (reply), 'v'=vertical (scroll)
    app.addEventListener('touchstart', e => {
        const row = e.target.closest('.m-bubble-row');
        if (!row || !row.id.startsWith('row-')) return;
        _swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        _swipeRow = row; _swipeTriggered = false; _swipeLocked = null;
    }, { passive: true });
    app.addEventListener('touchmove', e => {
        if (!_swipeStart || !_swipeRow) return;
        const dx = e.touches[0].clientX - _swipeStart.x;
        const dy = Math.abs(e.touches[0].clientY - _swipeStart.y);
        if (_swipeLocked === null && (Math.abs(dx) > 10 || dy > 10)) {
            _swipeLocked = (dx > 0 && dx >= dy) ? 'h' : 'v';
        }
        if (_swipeLocked === 'v' || (dy > 40 && !_swipeTriggered)) {
            _swipeRow.style.transform = ''; _swipeRow = null; _swipeLocked = null; return;
        }
        if (_swipeLocked === 'h' && dx > 0) {
            // Feel: 20px dead-zone before the bubble starts moving, gentle resistance
            // past the trigger, fires at ~70px with a haptic tick (once, on crossing).
            const START = 20, TRIGGER = 70, MAX = 84;
            const shift = Math.min(Math.max(0, dx - START), MAX);
            _swipeRow.style.transform = `translateX(${shift}px)`;
            _swipeRow.style.transition = 'none';
            const nowTrig = dx >= TRIGGER;
            if (nowTrig && !_swipeTriggered) { try { navigator.vibrate?.(12); } catch(e){} }
            _swipeTriggered = nowTrig;
        }
    }, { passive: true });
    const _swipeEnd = () => {
        if (!_swipeRow) { _swipeStart = null; _swipeLocked = null; return; }
        _swipeRow.style.transition = 'transform .28s cubic-bezier(.22,1,.36,1)';   // smooth spring-back
        _swipeRow.style.transform = '';
        if (_swipeTriggered) {
            const msgId = _swipeRow.id.replace('row-','');
            const btext = _swipeRow.querySelector('.m-btext')?.textContent?.substring(0,120)||'';
            const bmeta = _swipeRow.querySelector('.m-bmeta')?.textContent||'';
            const top = _stack[_stack.length-1];
            const room = top?.params?.room||''; const rname = top?.params?.name||''; const rcol = top?.params?.color||'';
            _navTo('thread',{id:msgId,text:btext,sender:bmeta,time:'',room,rname,rcol});
        }
        _swipeRow = null; _swipeStart = null; _swipeTriggered = false; _swipeLocked = null;
    };
    app.addEventListener('touchend', _swipeEnd);
    app.addEventListener('touchcancel', _swipeEnd);
    // Swipe-left-to-clear on Activity / Notification cards (#4).
    app.addEventListener('touchstart', _feedSwipeStart, { passive:true });
    app.addEventListener('touchmove',  _feedSwipeMove,  { passive:true });
    app.addEventListener('touchend',   _feedSwipeEnd);
    app.addEventListener('touchcancel',_feedSwipeEnd);

    const lensInp = _el('mSBSearchInp');
    let st;
    lensInp.addEventListener('input', () => { clearTimeout(st); st = setTimeout(()=>_runInlineSearch(lensInp.value), 300); });
}

window._toggleInlineSearch = function() {
    _searchMode = !_searchMode;
    _el('mSBInfo').style.display   = _searchMode ? 'none' : 'flex';
    _el('mSBSearch').style.display = _searchMode ? 'flex' : 'none';
    _el('mSBLens').innerHTML = _searchMode ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-magnifying-glass"></i>';
    if (_searchMode) { _el('mSBSearchInp').value=''; _el('mSBSearchInp').focus(); }
    else { _el('mSBResults').innerHTML=''; _el('mSBResults').classList.remove('open'); }
};
window._confirmLogout = async function() {
    if (!confirm('Sign out of Noted For Action?')) return;
    if (_tsInterval) clearInterval(_tsInterval);
    if (_notifFallbackInterval) { clearInterval(_notifFallbackInterval); _notifFallbackInterval = null; }
    if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    if (_rtReconnectTimer) { clearTimeout(_rtReconnectTimer); _rtReconnectTimer = null; }
    if (_rtOutageTimer) { clearTimeout(_rtOutageTimer); _rtOutageTimer = null; }
    _rtToastShown = false;
    // Untrack presence so everyone sees me go offline immediately on sign-out.
    try { if (_presenceChannel) { await sb.removeChannel(_presenceChannel); _presenceChannel = null; } } catch (e) {}
    _onlineSet.clear();
    // Also drop this device's push token so its next owner doesn't inherit my pushes.
    try { const _t = window.__lastPushToken; if (_t && _uid) await sb.from('push_tokens').delete().eq('token', _t).eq('user_id', _uid); } catch (e) {}
    // Clear all tenant-scoped localStorage data
    if (_tid) {
        const prefix = _tid+'_';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
    await sb.auth.signOut();
    window.location.href = '/';
};

// Swipe-left-to-clear for Activity / Notification cards (#4). A left drag past a
// threshold deletes that notification row (same as the × button); short drags snap back.
let _fsw = null;
function _feedSwipeStart(e) {
    const card = e.target.closest('.af-card, .nf-row');
    if (!card) { _fsw = null; return; }
    if (e.target.closest('.af-clear, .nf-clear, button')) { _fsw = null; return; }  // let button taps work
    const nid = card.querySelector('[data-nid]')?.getAttribute('data-nid');
    const t = e.touches[0];
    _fsw = { el: card, sx: t.clientX, sy: t.clientY, nid, moved: false };
}
function _feedSwipeMove(e) {
    if (!_fsw) return;
    const t = e.touches[0];
    const dx = t.clientX - _fsw.sx, dy = t.clientY - _fsw.sy;
    if (!_fsw.moved && Math.abs(dy) > Math.abs(dx)) { _fsw = null; return; }   // vertical scroll wins
    if (dx < 0) {
        _fsw.moved = true;
        _fsw.el.style.transform = 'translateX(' + Math.max(dx, -140) + 'px)';
        _fsw.el.style.opacity = String(Math.max(1 - Math.abs(dx) / 180, .25));
    }
}
function _feedSwipeEnd(e) {
    if (!_fsw) return;
    const { el, nid, sx, moved } = _fsw; _fsw = null;
    const dx = (e.changedTouches?.[0]?.clientX ?? sx) - sx;
    if (moved && dx < -80 && nid) {
        el.style.transition = 'transform .18s ease,opacity .18s ease';
        el.style.transform = 'translateX(-100%)'; el.style.opacity = '0';
        setTimeout(() => {
            try { sb.from('notifications').delete().eq('id', nid).eq('user_id', _uid).then(() => { refreshNotificationUI(); }); } catch (e) {}
            el.remove();
        }, 180);
    } else if (moved) {
        el.style.transition = 'transform .15s ease,opacity .15s ease';
        el.style.transform = ''; el.style.opacity = '';
        setTimeout(() => { el.style.transition = ''; }, 160);
    }
}
function _sameParams(a, b) {
    a = a || {}; b = b || {};
    return (a.room||'')===(b.room||'') && (a.id||'')===(b.id||'') && (a.uid||'')===(b.uid||'') && (a.filter||'')===(b.filter||'');
}
window._navTo = async function(screen, params, replace = false) {
    // Native-app feel: tapping the tab/screen you're already on does nothing instead
    // of re-rendering and flashing the screen. (Scroll the list back to top instead.)
    const cur = _stack[_stack.length-1];
    if (!replace && cur && cur.screen === screen && _sameParams(cur.params, params)) {
        const sc = _el('mStage')?.querySelector('.mScr, .m-msgs, .ma-body');
        if (sc) sc.scrollTo({ top:0, behavior:'smooth' });
        return;
    }
    if (_searchMode) window._toggleInlineSearch();
    // Native tab semantics: switching between ROOT tabs is lateral, not stacked —
    // otherwise hopping tabs ten times means pressing back ten times to exit.
    const ROOT_TABS = ['home','activity','tasks','remind','settings'];
    if (!replace && cur && ROOT_TABS.includes(cur.screen) && ROOT_TABS.includes(screen)) {
        replace = true;
    }
    // Opening a chat marks it read — clear its unread badge, recompute the bell/
    // activity badge from the REMAINING unread chats (sync across all surfaces),
    // and persist "read" for this room's notifications so the DB poll agrees.
    if ((screen === 'groupChat' || screen === 'dm') && params?.room) {
        // Clear this room instantly, AND persist the read at the DB (room_reads) so
        // the reconcile floor agrees and it stays cleared across reload/reconnect.
        console.log('[ROOM READ]', params.room);
        window.unreadCounts = window.unreadCounts || {};
        window.unreadCounts[params.room] = 0;
        delete _liveUnreadTs[params.room];
        try { sb.from('room_reads').upsert({ user_id:_uid, room_id:params.room, tenant_id:_tid, last_read_at:new Date().toISOString() }, { onConflict:'user_id,room_id' }).then(()=>{}); } catch(e){}
        refreshNotificationUI();   // reconcile derives the correct counts (open room forced to 0)
        // Do NOT clobber _bellCount with _sumUnread() here: _sumUnread counts only
        // MESSAGE unread, so it would wrongly wipe the count coming from reaction/
        // reply/mention notifications (which have no per-chat unread), then the 60s
        // poll would bring it back — the badge "flicker / won't clear" bug. Instead
        // mark this room's notifications read in the DB and recompute the bell from
        // the DB truth (max of DB unread and message unread).
        _markRoomNotifsRead(params.room);   // marks read → then refreshes the badge
    }
    if (replace) _stack.pop();
    _stack.push({ screen, params });
    if (replace) history.replaceState({ mobDepth:_stack.length }, '', location.href);
    else history.pushState({ mobDepth:_stack.length }, '', location.href);
    await _render(screen, params, 'forward');
    _setTab(screen);
    // Remember where the user is so the next app launch resumes here (#7). Only
    // restorable, non-transient screens (a chat or a main tab), with minimal params.
    if (['home','activity','tasks','marks','groupChat','dm'].includes(screen)) {
        try {
            const p = params || {};
            localStorage.setItem('mob_last_nav', JSON.stringify({
                screen, room:p.room||'', name:p.name||'', color:p.color||'', uid:p.uid||'',
            }));
        } catch (e) {}
    }
};
let _lastBackAt = 0;
window._back = function() {
    if (_stack.length > 1) { history.back(); return; }
    const now = Date.now();
    if (now - _lastBackAt < 2000) {
        if (window.IS_NATIVE && typeof window.__nativeExitApp === 'function') {
            window.__nativeExitApp();
            return;
        }
        window.close();
        setTimeout(() => { window.location.href = 'about:blank'; }, 100);
    } else {
        _lastBackAt = now;
        _toast('Press back again to exit');
    }
};
window.addEventListener('popstate', () => {
    if (_stack.length > 1) {
        _stack.pop();
        const prev = _stack[_stack.length-1];
        _render(prev.screen, prev.params, 'back');
        _setTab(prev.screen);
    } else {
        // Hardware back at root — re-push state to prevent browser exit, then show toast
        history.pushState({ mobDepth: 1 }, '', location.href);
        const now = Date.now();
        if (now - _lastBackAt < 2000) {
            window.close();
            setTimeout(() => { window.location.href = 'about:blank'; }, 100);
        } else {
            _lastBackAt = now;
            _toast('Press back again to exit');
        }
    }
});
async function _render(screen, params, dir='forward') {
    _applyMobTheme();   // keep the user's chosen mobile theme (web layer may have overwritten it)
    const stage = _el('mStage');
    if (!stage) return;
    const fns = {
        home: _home, activity: _activity, notifications: _activity, tasks: _tasks, remind: _reminders,
        marks: _bookmarks, scheduled: _scheduled,
        settings: _settings, dashboard: _dashboard, groupMgmt: _groupMgmt,
        groupChat: _groupChat, thread: _thread,
        dm: _dm, taskDetail: _taskDetail, remindEdit: _remindEdit, scheduledEdit: _scheduledEdit,
    };
    // Render-race guard: if the user navigates again while this screen's data is
    // still loading, the SLOWER older render must not overwrite the newer screen.
    const myNavGen = ++_navGen;
    const immersive = screen === 'thread' || screen === 'groupChat' || screen === 'dm';
    const slideClass = dir === 'none' ? ''
        : screen === 'thread'
            ? (dir==='back' ? 'slide-down' : 'slide-up')
            : (dir==='back' ? 'slide-back' : 'slide-fwd');

    // INSTANT FEEDBACK (fixes the "tap a tab → hangs for a moment" lag): for a real
    // navigation (not a silent background refresh), paint the sliding frame with a
    // lightweight skeleton IMMEDIATELY — before awaiting the screen's DB query — so
    // the tap feels responsive like WhatsApp/Slack. The real content then fills the
    // SAME frame in place (no second slide) once the query resolves.
    let frame = null;
    if (dir !== 'none') {
        _setTab(screen);   // highlight the tapped tab right away
        _el('mSB')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
        _el('mNav')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
        frame = document.createElement('div');
        frame.className = `mScr ${slideClass}`.trim();
        frame.dataset.screen = screen;
        frame.innerHTML = _skeleton(screen);
        stage.innerHTML = '';
        stage.appendChild(frame);
        _scrollTop('mStage');
    }

    const html = await (fns[screen]?.(params) || Promise.resolve('<div style="padding:40px;text-align:center;">Coming soon</div>'));
    if (myNavGen !== _navGen) return;   // user navigated again mid-load — abandon

    if (frame) {
        // Fill the already-visible (skeleton) frame in place — no new slide.
        frame.innerHTML = html;
    } else {
        // dir==='none' silent refresh: build off-DOM and swap atomically.
        const scr = document.createElement('div');
        scr.className = 'mScr';
        scr.dataset.screen = screen;
        scr.innerHTML = html;
        const cur = stage.firstElementChild;
        // ANTI-FLICKER: if the fresh markup matches what's shown, don't touch the DOM.
        if (cur && cur.dataset.screen === screen && cur.innerHTML === html) return;
        // Preserve the scroll position across a silent swap so a background refresh
        // never jerks the list back to the top mid-scroll (WhatsApp-smooth).
        const prevScroll = cur?.querySelector('.mScr-inner')?.scrollTop
                        || cur?.querySelector('.af-feed')?.scrollTop || 0;
        if (cur) stage.replaceChild(scr, cur); else stage.appendChild(scr);
        if (prevScroll) {
            const ni = scr.querySelector('.mScr-inner') || scr.querySelector('.af-feed');
            if (ni) ni.scrollTop = prevScroll;
        }
        frame = scr;
        _el('mSB')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
        _el('mNav')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
    }

    _wireScreen(screen, params, frame);
    _scrollTop('mStage');

    if (params?.scrollTo) _scrollAndGlow(params.scrollTo);

    if (_pendingRefresh) {
        const fn = _pendingRefresh; _pendingRefresh = null;
        Promise.resolve(fn()).then(() => {
            // The background refresh may have replaced the message area innerHTML,
            // wiping the highlighted row — re-apply the glow after it settles.
            if (params?.scrollTo) _scrollAndGlow(params.scrollTo);
        });
    }
}
// Lightweight per-screen placeholder shown for the split-second before a screen's
// data query resolves — a header bar + a few shimmer rows. Keeps navigation feeling
// instant instead of a frozen tap. Immersive chat screens skip the header bar.
function _skeleton(screen) {
    const titles = { home:'Chats', activity:'Activity', notifications:'Notifications',
        tasks:'Tasks', remind:'Reminders', marks:'Bookmarks', scheduled:'Scheduled',
        settings:'Settings', dashboard:'Dashboard', groupMgmt:'Manage Groups' };
    const bar = titles[screen] ? `<div class="m-hdr m-hdr-plain"><div class="m-htitle">${titles[screen]}</div></div>` : '';
    const rows = Array.from({length:6}).map(() =>
        `<div class="m-skrow"><div class="m-skav"></div><div class="m-sklines"><div class="m-skl"></div><div class="m-skl short"></div></div></div>`).join('');
    return `<div class="mScr-inner">${bar}<div class="m-sk">${rows}</div></div>`;
}
function _scrollAndGlow(msgId, attempt=0) {
    const row = document.getElementById('row-'+msgId);
    if (!row) { if (attempt<24) setTimeout(()=>_scrollAndGlow(msgId,attempt+1), 180); return; }  // ~4.3s window — covers cross-room loads
    const card = row.querySelector('.m-bubble') || row;
    row.scrollIntoView({ behavior:'smooth', block:'center' });
    setTimeout(() => card.classList.add('m-highlight'), 50);
    setTimeout(() => card.classList.remove('m-highlight'), 3050);   // highlight 3s
}
function _setTab(screen) {
    const map = { home:'home', groupChat:'home', thread:'home', dm:'home',
                  tasks:'tasks', taskDetail:'tasks',
                  activity:'activity', search:'activity',
                  marks:'marks',
                  // More-sheet destinations highlight the More tab
                  scheduled:'more', scheduledEdit:'more', remind:'more', remindEdit:'more',
                  settings:'more', dashboard:'more', groupMgmt:'more' };
    const active = map[screen] || null;
    document.querySelectorAll('.mn-btn').forEach(b => b.classList.toggle('active', active && b.id === 'mnt-'+active));
}
window._toggleChatSearch = function(areaId) {
    const bar = _el('mChatSearchBar');
    const inp = _el('mChatSearchInp');
    if (!bar) return;
    const open = bar.style.display === 'none';
    bar.style.display = open ? 'block' : 'none';
    if (open) { inp?.focus(); } else { if (inp) inp.value = ''; window._filterChatMsgs('', areaId); }
};
window._filterChatMsgs = function(q, areaId) {
    const area = _el(areaId); if (!area) return;
    const term = (q||'').trim().toLowerCase();
    area.querySelectorAll('.m-bubble-row').forEach(row => {
        row.style.display = !term || (row.textContent||'').toLowerCase().includes(term) ? '' : 'none';
    });
};
window._showRoomMenu = function(roomId, roomName) {
    const sheet = _el('mSheetInner');
    const isDM = String(roomId).startsWith('dm_');
    // A DM has no group photo and no "manage" surface — you cannot set another
    // person's profile photo. Only group-photo/manage/staff are gated to admins;
    // for a DM the menu is Mute only.
    const canManage = !isDM && ((window.canSeeGroupGear?.() ?? false) || _isDeptAdmin(roomId));
    const members = isDM ? [] : (() => { try { return JSON.parse(_lsGet('dept_members_'+roomId)||'[]'); } catch { return []; } })();
    const isMuted = _lsGet('muted_'+roomId) === '1';
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">${x(roomName)}</div>
      <div style="display:flex;flex-direction:column;gap:2px;padding:0 8px 20px;">
        <div class="m-sheet-row" data-action="toggleMute" data-room="${roomId}">
          <i class="fa-solid ${isMuted?'fa-bell':'fa-bell-slash'}" style="color:#6366f1;"></i>
          ${isMuted ? 'Unmute notifications' : 'Mute notifications'}
        </div>
        ${members.length ? `<div class="m-sheet-row" data-action="viewMembersSheet" data-room="${roomId}">
          <i class="fa-solid fa-users" style="color:#0ea5e9;"></i> Staff (${members.length})
        </div>` : ''}
        ${canManage ? `<div class="m-sheet-row" data-action="setDeptPhoto" data-dept="${roomId}">
          <i class="fa-solid fa-camera" style="color:#10b981;"></i> Change group photo
        </div>` : ''}
        ${canManage ? `<div class="m-sheet-row" data-action="navMore" data-screen="groupMgmt">
          <i class="fa-solid fa-pen" style="color:#f59e0b;"></i> Manage group
        </div>` : ''}
      </div>`;
    _openSheet();
};
window._openMoreSheet = function() {
    const sheet = _el('mSheetInner');
    // ROLE-WISE: Bookmarks + Profile are for everyone; Scheduled Messages only for
    // roles allowed to schedule; Dashboard (scorecard + school overview) for senior
    // staff / admins. Gate each row so juniors don't see management surfaces.
    const canSched = window.canSchedule?.() ?? false;
    const canDash  = (window.isSeniorStaff?.() || window.canAccessAdmin?.()) ?? false;
    const row = (screen, icon, color, label) =>
        `<div class="m-sheet-row" data-action="navMore" data-screen="${screen}"><i class="fa-solid ${icon}" style="color:${color};width:22px;"></i> ${label}</div>`;
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">More</div>
      <div style="padding:0 8px 16px;display:flex;flex-direction:column;gap:2px;">
        ${row('remind','fa-bell','#ef4444','Reminders')}
        ${canSched ? row('scheduled','fa-clock','#6366f1','Scheduled Messages') : ''}
        ${canDash  ? row('dashboard','fa-chart-bar','#16a34a','Dashboard') : ''}
        ${row('settings','fa-gear','#6b7280','Profile & Settings')}
      </div>`;
    _openSheet();
};

async function _home() {
    const others  = _users.filter(u=>u.id!==_uid);
    const canGear = window.canSeeGroupGear?.() ?? true;

    // Try cached last-messages
    const cachedLast = (() => { try { return JSON.parse(localStorage.getItem('mob_home_last')||'null'); } catch { return null; } })();
    const last = cachedLast || {};

    // Schedule background refresh of last-message previews
    _pendingRefresh = async () => {
        if (_isOffline) return;
        try {
            const { data: lastMsgs } = await sb.from('messages')
                .select('room_id,text,created_at,sender_id')
                .eq('tenant_id',_tid).is('deleted_at',null)
                .order('created_at',{ascending:false}).limit(200);
            const fresh = {};
            (lastMsgs||[]).forEach(m => { if(!fresh[m.room_id]) fresh[m.room_id]=m; });
            try { localStorage.setItem('mob_home_last', JSON.stringify(fresh)); } catch {}
            // Patch subtitle rows in place
            Object.entries(fresh).forEach(([roomId, lm]) => {
                const el = document.getElementById('home-sub-'+roomId);
                if (el) {
                    const sn = lm.sender_id === _uid ? 'You' : (_uname(lm.sender_id)||'').split(' ')[0];
                    el.textContent = (sn ? sn+': ' : '')+_snip(lm.text,32)+' · '+_ago(lm.created_at);
                }
            });
        } catch {}
    };

    const _mgrRole = window.canManageGroups?.() ?? false;
    const _canMng = _mgrRole || _isAnyDeptAdmin();   // role manager OR a department co-admin
    return `<div class="mScr-inner">
      <div class="m-sl" style="display:flex;align-items:center;justify-content:space-between;">
        <span>DEPARTMENTS</span>
        ${_canMng ? `<button data-action="navGroupMgmt" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-users-gear"></i> Manage</button>` : ''}
      </div>
      ${_customGroups.length === 0 ? `<div class="m-empty">${_canMng ? '<button data-action="navGroupMgmt" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-plus"></i> Create your first group</button>' : 'No groups yet. Ask your principal to create one.'}</div>` : ''}
      ${[...DEPTS, ..._customGroups].map(d => {
        const lm = last[d.id];
        const unread = window.unreadCounts?.[d.id] || 0;
        const isMuted = _lsGet('muted_'+d.id) === '1';
        const sn = lm ? (lm.sender_id === _uid ? 'You' : (_uname(lm.sender_id)||'').split(' ')[0]) : '';
        const subtext = lm ? (sn ? sn+': ' : '')+_snip(lm.text,32)+' · '+_ago(lm.created_at) : 'No messages yet';
        return `
        <div class="m-row">
          ${_avatarHTML(d.photo, d.name, d.col, 'm-av sq')}
          <div class="m-ri" data-action="groupChat" data-room="${d.id}" data-name="${x(d.name)}" data-color="${d.col}">
            <div class="m-rn">${x(d.name)}${isMuted ? ' <span style="font-size:12px;opacity:.6;">🔕</span>' : ''}</div>
            <div class="m-rs" id="home-sub-${d.id}">${subtext}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${unread > 0 ? `<span class="m-unread-badge">${unread > 99 ? '99+' : unread}</span>` : '<i class="fa-solid fa-chevron-right m-chv"></i>'}
          </div>
        </div>`; }).join('')}

      <div class="m-sl" style="margin-top:4px;">DIRECT MESSAGES</div>
      ${others.length ? others.map(u => {
        const dm = _dmRoom(u.id);
        const lm = last[dm];
        const nm = u.full_name||u.email.split('@')[0];
        const unread = window.unreadCounts?.[dm] || 0;
        const sn = lm ? (lm.sender_id === _uid ? 'You' : nm.split(' ')[0]) : '';
        const subtext = lm ? (sn ? sn+': ' : '')+_snip(lm.text,32)+' · '+_ago(lm.created_at) : x(u.designation||'Staff');
        return `
        <div class="m-row" data-action="dm"
             data-uid="${u.id}" data-name="${x(nm)}" data-room="${dm}">
          <div style="position:relative;flex-shrink:0;">
            ${_avatarHTML(u.avatar_url, nm, 'var(--accent)')}
            ${_onlineDot(u.id)}
          </div>
          <div class="m-ri">
            <div class="m-rn">${x(nm)} ${_roleChip(u.id)}</div>
            <div class="m-rs" id="home-sub-${dm}">${subtext}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${unread > 0 ? `<span class="m-unread-badge">${unread > 99 ? '99+' : unread}</span>` : '<i class="fa-solid fa-chevron-right m-chv"></i>'}
          </div>
        </div>`; }).join('') : '<div class="m-empty">No staff added yet</div>'}
    </div>`;
}

function _fmtDateTime(ds){ try { const d=new Date(_normTs(ds)); return _istFmtDate.format(d)+', '+_istFmt12.format(d); } catch { return ''; } }
async function _activity(p) {
    // TWO surfaces share this renderer (3-surface model):
    //   • mode 'attention'  = the BELL → Notifications: only items aimed at ME
    //     (mentions/replies/reactions/tasks/reminders). Opening it MARKS them read
    //     and clears the bell. Does NOT touch chat-row unread or the Activity dot.
    //   • mode 'timeline' (default) = the bottom ACTIVITY tab → team timeline of ALL
    //     recent messages + tasks. Browsing it clears only the "new" DOT — it does
    //     NOT mark attention read (bell stays) and does NOT clear chat-row unread.
    const mode = (p && p.mode === 'attention') ? 'attention' : 'timeline';
    const filter = window._afFilter || 'all';
    const senderFilter = window._afSender || '';
    // Items seen at/before this time render dimmed (~40%); newer ones stay full.
    // Per-surface "last opened" timestamp, captured BEFORE we stamp the new one.
    const _seenKey = mode === 'attention' ? 'bell_seen_ts' : 'activity_seen_ts';
    let _prevSeen = 0;
    try { _prevSeen = new Date(_normTs(localStorage.getItem(_seenKey) || 0)).getTime() || 0; } catch(e){}
    try { localStorage.setItem(_seenKey, new Date().toISOString()); } catch(e){}
    if (mode !== 'attention') {
        // Opening the timeline tab clears the subtle "new" dot.
        _activityHasNew = false;
        _el('mnActBadge')?.style.setProperty('display','none');
    }

    // Shared feed core (Phase 7): the fetch + merge (messages + task_trails +
    // notifications) + dedup + normalize now lives in js/core/feed.js, used by
    // BOTH shells so this logic can never diverge again (the root of the "works
    // on web, broken on mobile" feed bugs). Rendering below stays mobile-specific.
    const _roomLabel = (rid) => {
        if (!rid) return '';
        if (rid.startsWith('dm_')) {
            const other = rid.replace('dm_','').split('_').find(id => id !== _uid);
            return other ? _uname(other) : 'Direct message';
        }
        return _findGroup(rid)?.name || _lsGet('dept_name_'+rid,'') || rid;
    };
    const { items: _feed, unread } = await window.NFA_buildActivity(sb, {
        uid: _uid, tid: _tid,
        resolveName: _uname, resolveRoom: _roomLabel, snippet: _snip,
        // Only the BELL (attention) marks notifications read on open. Browsing the
        // timeline must NOT clear the bell, so it fetches without marking read.
        markRead: mode === 'attention',
        logError: (m, d) => window.logger?.sb?.(m, d),
    });

    // v199: merge locally-stored reaction notifications (DB-independent) and sort by time.
    const _feedAll = _feed.concat(_localReactFeedItems())
        .sort((a, b) => new Date(_normTs(b.n.created_at)).getTime() - new Date(_normTs(a.n.created_at)).getTime());
    if (mode === 'attention') _markLocalReactRead();   // opening the bell clears their unread count
    // ATTENTION view = notification-sourced items only (mentions/replies/reactions/
    // tasks/reminders). Timeline view = everything (also raw messages + task trails,
    // which NFA_buildActivity tags with 'msg:'/'trail:' id prefixes).
    const _all = mode === 'attention'
        ? _feedAll.filter(it => { const id = String(it.n?.id || ''); return !id.startsWith('msg:') && !id.startsWith('trail:'); })
        : _feedAll;

    let items = _all.filter(it => filter==='all' || it.cat===filter);
    // Distinct senders present in the (category-filtered) feed, for the sender chips.
    const senders = [...new Set(items.map(it=>it.sender).filter(Boolean))].sort();
    if (senderFilter) items = items.filter(it => it.sender === senderFilter);

    const today = _istFmtDate.format(new Date());
    const yest  = _istFmtDate.format(new Date(Date.now()-86400000));
    const dayLabel = (ds) => { const d=_istFmtDate.format(new Date(_normTs(ds))); return d===today?'Today':d===yest?'Yesterday':d; };

    const groups = [];
    let curL=null, cur=null;
    items.forEach(it => { const l=dayLabel(it.n.created_at); if(l!==curL){curL=l;cur={label:l,items:[]};groups.push(cur);} cur.items.push(it); });

    const pills = [['all','All'],['chats','💬 Chats'],['tasks','📋 Tasks'],['reminders','⏰ Reminders'],['system','🛠 System']];

    // Two DISTINCT looks (Slack-style separation):
    //  • attention (BELL) → a compact "notification list": icon + text + time, unread
    //    rows highlighted with a blue rail + dot. Tapping opens the item AND marks it
    //    read (the badge shrinks). Cleared automatically as items are handled.
    //  • timeline (ACTIVITY) → a "feed" of coloured rail cards on a timeline; items
    //    PERSIST until the user clears them (× per card / Clear all), like Slack.
    const openData = (it) => it.act ? (it.act.k==='task'
        ? `data-action="goToTaskNotif" data-tid="${it.act.id}" data-nid="${it.n.id}"`
        : `data-action="goToMsgNotif" data-mid="${it.act.id}" data-nid="${it.n.id}"`) : '';

    const notifRow = (it) => {
        const n = it.n;
        const seen = n.is_read || (_prevSeen && (new Date(_normTs(n.created_at)).getTime() <= _prevSeen));
        return `<div class="nf-row ${n.is_read?'':'unread'}${seen?' seen':''}" ${openData(it)}>
            <span class="nf-ic ${it.cls}">${it.emoji||'🔔'}</span>
            <div class="nf-body">
              <div class="nf-title">${x(_snip(n.message,80))}</div>
              <div class="nf-time">${_ago(n.created_at)}</div>
            </div>
            ${n.is_read?'':'<span class="nf-dot"></span>'}
            <button class="nf-clear" data-action="afClear" data-nid="${n.id}" title="Clear"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    };
    const timelineCard = (it) => {
        const n = it.n;
        const seen = _prevSeen && (new Date(_normTs(n.created_at)).getTime() <= _prevSeen);
        const btn = it.act ? (it.act.k==='task'
            ? `<button class="af-btn primary" ${openData(it)}>📂 View Task</button>`
            : `<button class="af-btn primary" ${openData(it)}>🚀 Open</button>`) : '';
        return `<div class="af-card ${it.cls}${seen?' seen':''}" ${openData(it)}>
            <button class="af-clear" data-action="afClear" data-nid="${n.id}" title="Clear"><i class="fa-solid fa-xmark"></i></button>
            <span class="af-badge ${it.cls}">${it.badge}</span>
            <div class="af-title">${x(_snip(n.message,70))}</div>
            <div class="af-meta"><i class="fa-regular fa-clock"></i> ${_ago(n.created_at)}${it.sender?` · <span class="af-by">${x(it.sender)}</span>`:''} · ${_fmtDateTime(n.created_at)}</div>
            ${btn?`<div class="af-actions">${btn}</div>`:''}
        </div>`;
    };
    const card = mode === 'attention' ? notifRow : timelineCard;

    const feed = groups.length ? groups.map(g => `
        <div class="af-div"><span>${mode==='attention'?'':'🔵 '}${g.label}</span><div class="ln"></div></div>
        ${g.items.map(card).join('')}`).join('')
      : `<div class="af-empty"><div class="em">${mode==='attention'?'🔔':'🚀'}</div><div class="t">All caught up!</div>
           <div style="margin-top:6px;">${filter!=='all' ? 'Nothing matches this filter.' : (mode==='attention' ? 'No mentions, replies, reactions, tasks or reminders for you yet.' : 'Team activity — messages, tasks and reminders — will appear here.')}</div></div>`;

    const hasAny = _all.length > 0;
    const html = `<div class="mScr-inner ${mode==='attention'?'nf-mode':'af-mode'}">
      <div class="m-hdr m-hdr-plain" style="display:flex;align-items:center;justify-content:space-between;">
        <div class="m-htitle">${mode==='attention'?'🔔 Notifications':'🗞️ Activity'} ${(mode==='attention'&&unread)?`<span style="background:#2563eb;color:#fff;font-size:10px;font-weight:600;padding:2px 8px;border-radius:30px;margin-left:6px;vertical-align:middle;">${unread} new</span>`:''}</div>
        <div style="display:flex;gap:6px;">
          ${mode==='attention' && unread?`<button class="m-hdr-action" data-action="markAllRead" title="Mark all read"><i class="fa-solid fa-check-double"></i></button>`:''}
          ${mode!=='attention' && hasAny?`<button class="m-hdr-action" data-action="afClearAll" title="Clear all"><i class="fa-solid fa-trash-can"></i></button>`:''}
        </div>
      </div>
      <div class="af-filters af-selrow">
        <select class="af-select" data-action="afFilterSel" onchange="window._mobAfFilter(this.value)">
          ${pills.map(([k,l])=>`<option value="${k}" ${filter===k?'selected':''}>${l}</option>`).join('')}
        </select>
        <select class="af-select" data-action="afSenderSel" onchange="window._mobAfSender(this.value)" ${senders.length?'':'disabled'}>
          <option value="" ${senderFilter?'':'selected'}>👥 Everyone</option>
          ${senders.map(s=>`<option value="${x(s)}" ${senderFilter===s?'selected':''}>${x(s)}</option>`).join('')}
        </select>
      </div>
      <div class="af-feed">${feed}</div>
    </div>`;
    // ANTI-FLICKER (WhatsApp-style stable list): a background refresh (12s poll /
    // live event) rebuilds this feed, but the ONLY thing that changed is usually the
    // relative time ("2m"→"3m") — which made the HTML differ every tick and the DOM
    // swap, so the list flickered. Key a cache on the actual DATA (mode/filter/sender
    // + each item's id+read state). When the data is unchanged, return the PREVIOUS
    // html verbatim → _render's innerHTML-equality guard skips the swap entirely →
    // no flicker. Times refresh lazily when the item set next changes, like WhatsApp.
    const sig = mode+'|'+filter+'|'+senderFilter+'|'+items.map(it=>it.n.id+':'+(it.n.is_read?1:0)).join(',');
    if (_afCache.sig === sig) return _afCache.html;
    _afCache = { sig, html };
    return html;
}
let _afCache = { sig: null, html: '' };
// Re-render whichever feed surface is open (timeline 'activity' or bell
// 'notifications'), preserving its mode/params — so filters/clears never flip
// the user from the bell list to the timeline.
window._mobRerenderActivity = () => {
    const t = _stack[_stack.length-1];
    const s = (t && t.screen === 'notifications') ? 'notifications' : 'activity';
    return _render(s, t?.params, 'forward');
};
// Live-refresh the Activity screen ONLY when it's the one on-screen (debounced so
// a burst of notifications/messages doesn't thrash it). Wired to the notifications
// realtime INSERT + incoming messages so the feed updates without a manual reload.
let _actRefreshTimer = null;
function _liveRefreshActivity() {
    const top = _stack[_stack.length-1];
    if (top?.screen !== 'activity' && top?.screen !== 'notifications') return;
    clearTimeout(_actRefreshTimer);
    _actRefreshTimer = setTimeout(function go() {
        // Hold off while the user is actively scrolling — re-check shortly so the
        // update still lands the moment they stop (no jerk mid-scroll).
        if (Date.now() - _lastScrollTs < 1200) { _actRefreshTimer = setTimeout(go, 700); return; }
        const t = _stack[_stack.length-1];
        // Re-render whichever of the two surfaces is open, preserving its mode.
        if (t?.screen === 'activity' || t?.screen === 'notifications') _render(t.screen, t.params, 'none');
    }, 600);
}
window._mobAfFilter = function(v){ window._afFilter = v; window._afSender = ''; window._mobRerenderActivity(); };
window._mobAfSender = function(v){ window._afSender = v || ''; window._mobRerenderActivity(); };

async function _runInlineSearch(q) {
    const box = _el('mSBResults');
    if (!box) return;
    if (!q || q.trim().length < 2) { box.classList.remove('open'); box.innerHTML=''; return; }
    box.classList.add('open');
    box.innerHTML = '<div class="m-empty">Searching…</div>';

    const [{ data: msgs }, staffMatches] = await Promise.all([
        sb.from('messages').select('id,room_id,text,created_at,sender_id')
          .eq('tenant_id',_tid).is('deleted_at',null).ilike('text',`%${q}%`)
          .order('created_at',{ascending:false}).limit(20),
        Promise.resolve(_users.filter(u => (u.full_name||u.email||'').toLowerCase().includes(q.toLowerCase()) && u.id!==_uid)),
    ]);

    const rows = [];
    staffMatches.forEach(u => rows.push(`
        <div class="m-row" data-action="dm" data-uid="${u.id}" data-name="${x(u.full_name||u.email)}" data-room="${_dmRoom(u.id)}">
          <div class="m-av" style="background:var(--accent);">${_init(u.full_name||u.email)}</div>
          <div class="m-ri"><div class="m-rn">${x(u.full_name||u.email)}</div><div class="m-rs">Staff member</div></div>
        </div>`));
    (msgs||[]).forEach(m => {
        const isDept = !!_findGroup(m.room_id);
        const isMyDM = _isDmMine(m.room_id);
        if (!isDept && !isMyDM) return;
        const dept = _findGroup(m.room_id);
        rows.push(`
        <div class="m-row" data-action="${isDept?'groupChat':'dm'}" data-room="${m.room_id}"
             data-name="${x(dept?.name||'')}" data-color="${dept?.col||''}" data-scroll="${m.id}">
          <div class="m-av ${isDept?'sq':''}" style="background:${dept?.col||'var(--accent)'};">${isDept?dept.name[0]:'💬'}</div>
          <div class="m-ri"><div class="m-rn">${x(_uname(m.sender_id))}</div><div class="m-rs">${_snip(m.text,46)}</div></div>
        </div>`);
    });
    box.innerHTML = rows.length ? rows.join('') : '<div class="m-empty">No results found</div>';
}

async function _fetchReactions(msgIds) {
    if (!msgIds.length) return {};
    // Start with localStorage cache (includes other users' reactions from broadcast)
    const cache = _loadReactionsCache();
    const map = {};
    msgIds.forEach(id => { if (cache[id]?.length) map[id] = [...cache[id]]; });
    // Merge DB reactions via the shared core (authoritative). The localStorage
    // cache above (other users' reactions from broadcast) is layered under it.
    const dbMap = await window.NFA_fetchReactions(sb, msgIds, _tid,
        err => console.error('[mob-react] _fetchReactions error=' + (err?.message || err)));
    Object.keys(dbMap).forEach(id => {
        if (!map[id]) map[id] = [];
        dbMap[id].forEach(r => { if (!map[id].find(x => x.value===r.value && x.user_id===r.user_id)) map[id].push(r); });
    });
    return map;
}
const TAG_COLORS = { 'Thank You':'#16a34a','Noted':'#2563eb','Copied':'#7c3aed','Yes Sir':'#ea580c','Yes Madam':'#db2777' };
// Patch just the reaction chips of one already-rendered row from a reactions map
// (no DB call, no scroll) — used by the anti-flash path when the message set is
// unchanged on a background refresh.
function _refreshChipsFromMap(msgId, reactionsMap) {
    const row = document.getElementById('row-'+msgId);
    if (!row) return;
    const html = _chipsHTML(msgId, reactionsMap);
    const existing = row.querySelector('.m-chips');
    if (existing) { if (existing.outerHTML !== html) existing.outerHTML = html || ''; }
    else if (html) { const bt = row.querySelector('.m-btext'); if (bt) bt.insertAdjacentHTML('afterend', html); }
}
function _chipsHTML(msgId, reactionsMap) {
    const list = (reactionsMap||{})[msgId] || [];
    if (!list.length) return '';
    const grouped = {};
    list.forEach(r => {
        const key = r.type+'|'+r.value;
        grouped[key] = grouped[key] || { value:r.value, type:r.type, count:0, mine:false };
        grouped[key].count++;
        if (r.user_id === _uid) grouped[key].mine = true;
    });
    return `<div class="m-chips">${Object.values(grouped).map(g => {
        if (g.type === 'tag') {
            const c = TAG_COLORS[g.value] || 'var(--accent)';
            return `<button class="m-chip m-chip-tag ${g.mine?'mine':''}" ${g.mine?'data-mine="1"':''} style="color:${c};border-color:${c};"
                data-action="toggleReaction" data-id="${msgId}" data-value="${x(g.value)}" data-type="tag">${x(g.value)}</button>`;
        }
        return `<button class="m-chip ${g.mine?'mine':''}" ${g.mine?'data-mine="1"':''} data-action="toggleReaction" data-id="${msgId}" data-value="${g.value}" data-type="emoji">${g.value} <span class="m-chip-cnt">${g.count}</span></button>`;
    }).join('')}</div>`;
}
async function _toggleReaction(msgId, value, type, isMine=false) {
    console.log('[mob-react] _toggleReaction msgId='+msgId+' value='+value+' type='+type+' isMine='+isMine+' _uid='+_uid+' _tid='+_tid);
    if (!_uid || !_tid) { console.log('[mob-react] ABORTED: no uid/tid'); return; }
    const isDelete = isMine;
    window.logger?.logReact(isDelete ? 'remove' : 'add', { msg: msgId, val: value, type });
    let error, res;
    if (isDelete) {
        res = await sb.from('reactions').delete().eq('message_id',msgId).eq('value',value).eq('user_id',_uid).eq('tenant_id',_tid);
        error = res.error;
        console.log('[mob-react] deleted reaction error='+error?.message);
    } else {
        // UPSERT (not insert) so a fast double-tap / realtime race is idempotent
        // instead of throwing 23505 duplicate-key (which used to pop an error toast
        // and abort before the chip refreshed — reaction looked added but wasn't).
        // Matches the web path (messages.js). onConflict = the unique index.
        res = await sb.from('reactions').upsert(
            { message_id:msgId, user_id:_uid, tenant_id:_tid, value, type },
            { onConflict:'message_id,user_id,value', ignoreDuplicates:true });
        error = res.error;
        console.log('[mob-react] upserted reaction error='+error?.message);
    }
    window.logger?.sb(isDelete ? 'reactions.delete' : 'reactions.upsert', res, { msg: msgId, val: value });
    // 23505 (duplicate) is NOT a failure here — the reaction already exists, which is
    // exactly the desired end state; fall through to render it rather than error.
    if (error && error.code !== '23505') { _toast('Could not save reaction: '+error.message, 'err'); return; }
    // Persist to localStorage cache (own reaction)
    _saveReactionEntry(msgId, value, type, _uid, isDelete);
    // Broadcast to all users via dedicated broadcast channel (bypasses RLS on postgres_changes)
    _bcSend('reaction', { message_id:msgId, value, type, user_id:_uid, tenant_id:_tid, isDelete });
    // Notify the message author that someone reacted (only on ADD, never on remove,
    // and never for reacting to your own message). Mirrors the reply-notify path so
    // the bell + Activity feed surface reactions like a standard chat app.
    if (!isDelete) {
        (async () => {
            try {
                const { data: msg } = await sb.from('messages').select('sender_id').eq('id', msgId).single();
                if (msg && msg.sender_id && msg.sender_id !== _uid) {
                    const me = _users.find(u=>u.id===_uid);
                    const myName = me ? (me.full_name || me.email?.split('@')[0]) : 'Someone';
                    const nres = await sb.from('notifications').insert({
                        user_id: msg.sender_id, type:'reaction',
                        message: `${value} ${myName} reacted to your message`,
                        message_id: msgId, tenant_id:_tid, is_read:false
                    });
                    // Surface RLS-blocked notification inserts (silent failure class).
                    window.logger?.sb('notifications.insert[reaction]', nres, { to: msg.sender_id, msg: msgId });
                    window.logger?.logNotif('react→author', { to: msg.sender_id, ok: !nres.error });
                }
            } catch(e) { window.logger?.logError?.(e, { at:'reactNotify' }); }
        })();
    }
    await _refreshChips(msgId, { value, type, isDelete });
}
async function _refreshChips(msgId, optimistic) {
    console.log('[mob-react] _refreshChips start msgId='+msgId+' _refreshGen='+_refreshGen);
    _refreshGen++;
    const row = document.getElementById('row-'+msgId);
    console.log('[mob-react] row found='+!!row+' new _refreshGen='+_refreshGen);
    if (!row) return;
    let map = await _fetchReactions([msgId]);
    console.log('[mob-react] fetchReactions='+JSON.stringify(map));
    // Always merge optimistic delta on top of DB result (handles timing race where DB hasn't committed yet)
    if (optimistic) {
        console.log('[mob-react] merging optimistic isDelete='+optimistic.isDelete+' onto db result len='+(map[msgId]?.length||0));
        const list = [...(map[msgId] || [])];
        const oUid = optimistic.user_id || _uid;   // receiver path passes the reactor's id
        if (!optimistic.isDelete) {
            if (!list.some(r => r.value === optimistic.value && r.user_id === oUid))
                list.push({ message_id:msgId, value:optimistic.value, type:optimistic.type, user_id:oUid });
        } else {
            for (let i = list.length-1; i >= 0; i--) {
                if (list[i].value === optimistic.value && list[i].user_id === oUid) { list.splice(i,1); break; }
            }
        }
        if (list.length) map = { [msgId]: list };
        else map = {};
    }
    const existingEl = row.querySelector('.m-chips');
    const html = _chipsHTML(msgId, map);
    console.log('[mob-react] chipsHTML length='+(html?.length||0));
    if (existingEl) existingEl.outerHTML = html || '';
    else if (html) {
        // Insert the chips in the SAME spot the canonical renderer uses (right after
        // .m-btext), not appended past the status row, so the live view matches a
        // re-entry exactly.
        const btext = row.querySelector('.m-btext');
        if (btext) btext.insertAdjacentHTML('afterend', html);
        else row.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend', html);
    }
    // The new chip makes the bubble taller; if the reacted message sits at the bottom
    // of the list, the chip can land BEHIND the composer (in the DOM but not visible —
    // which is why it only showed after leaving and re-entering). Reveal it if hidden.
    row.scrollIntoView({ block: 'nearest' });
    console.log('[mob-react] DOM patched');
}

function _bubbleHTML(m, reactionsMap, maxLen=150, replyMap={}, roomCtx={}) {
    const me = m.sender_id === _uid;
    const nm = me ? 'You' : _uname(m.sender_id);
    const cl = _renderLinkPills(m.text || '');
    const sender = !me ? _users.find(u=>u.id===m.sender_id) : null;
    const rc = (replyMap||{})[m.id];
    const rCtx = roomCtx || {};
    const threadBtn = rc ? `<button class="m-thread-link" data-action="thread" data-n="${rc}"
        data-id="${m.id}" data-text="${x((m.text||'').substring(0,120))}"
        data-sender="${x(nm)}" data-time="${_ago(m.created_at)}"
        data-room="${rCtx.room||''}" data-rname="${x(rCtx.name||'')}" data-rcol="${rCtx.color||''}">
        💬 ${rc} repl${rc===1?'y':'ies'} ›</button>` : '';
    // Message status ticks for own messages
    let statusTick = '';
    if (me && rCtx.room) {
        const isPending = (m.id||'').startsWith('pending-');
        const otherRead = _lsGet('last_read_other_'+rCtx.room);
        const isRead = !isPending && otherRead && otherRead > (m.created_at||'');
        // Text status (per request): maroon "Sent" → dark-green "Seen".
        if (isPending) statusTick = '<span class="m-tick pending">Sending…</span>';
        else if (isRead) statusTick = '<span class="m-tick read">Seen</span>';
        else statusTick = '<span class="m-tick sent">Sent</span>';
    }
    const roleChip = (!me && rCtx.room) ? _roleChip(m.sender_id) : '';
    return `
      <div class="m-bubble-row ${me?'snt':'rcv'}" id="row-${m.id}" data-time="${m.created_at}">
        ${!me ? _avatarHTML(sender?.avatar_url, nm, 'var(--accent)', 'm-av-tiny') : ''}
        <div class="m-bubble ${me?'snt':'rcv'}">
          <div class="m-bmeta" data-ts="${m.created_at}" data-label="${x(nm)}">${x(nm)} · ${_ago(m.created_at)}${m.updated_at && m.updated_at > (m.created_at||'').replace(/\..*$/,'.005Z') ? ' <span class="m-edited">edited</span>' : ''}</div>
          ${roleChip ? `<div style="margin:-2px 0 4px;">${roleChip}</div>` : ''}
          <div class="m-btext">${cl}</div>
          ${_chipsHTML(m.id, reactionsMap)}
          ${threadBtn}
          ${statusTick ? `<div class="m-status-row">${statusTick}</div>` : ''}
        </div>
      </div>`;
}
// WhatsApp-style file card for non-image attachments (icon + name + type). Takes the
// tap-action attributes (openTaskFile/openFile) so it works for both bucket files and links.
function _fileCardHTML(actionAttrs, name, ext) {
    ext = (ext || '').toLowerCase().split('?')[0];
    let icon='fa-file', col='#6b7280', label='File';
    if (ext==='pdf'){icon='fa-file-pdf';col='#dc2626';label='PDF';}
    else if (['doc','docx'].includes(ext)){icon='fa-file-word';col='#2563eb';label='Word';}
    else if (['xls','xlsx','csv'].includes(ext)){icon='fa-file-excel';col='#16a34a';label='Excel';}
    else if (['ppt','pptx'].includes(ext)){icon='fa-file-powerpoint';col='#ea580c';label='PowerPoint';}
    else if (['zip','rar','7z'].includes(ext)){icon='fa-file-zipper';col='#7c3aed';label='Archive';}
    else if (['mp4','mov','webm','mkv'].includes(ext)){icon='fa-file-video';col='#db2777';label='Video';}
    else if (['mp3','wav','m4a','ogg'].includes(ext)){icon='fa-file-audio';col='#0891b2';label='Audio';}
    else if (['txt','md'].includes(ext)){icon='fa-file-lines';col='#64748b';label='Text';}
    return `<div class="m-file-card" ${actionAttrs} style="display:flex;align-items:center;gap:11px;background:var(--bg-sidebar,#f6f8fa);border:1px solid var(--border-color,#e5e7eb);border-radius:13px;padding:9px 11px;margin:4px 0;cursor:pointer;width:270px;max-width:100%;box-sizing:border-box;">
        <div style="width:40px;height:40px;border-radius:10px;background:${col}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid ${icon}" style="color:${col};font-size:19px;"></i></div>
        <div style="min-width:0;flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${x(name)}</div>
            <div style="font-size:10.5px;color:var(--text-secondary,#6b7280);font-weight:600;margin-top:1px;">${label} · Tap to open</div>
        </div>
        <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-secondary,#9ca3af);font-size:12px;flex-shrink:0;"></i>
    </div>`;
}
// Turn bare http(s):// URLs (typed as plain text) into link-pill anchors so they
// render as clickable pills / image previews — WITHOUT touching URLs already inside
// an <a> tag (existing links, secure-file/link-pill schemes).
function _autoLink(html) {
    if (!html) return html;
    return html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi).map(seg => {
        if (/^<a\b/i.test(seg)) return seg;
        return seg.replace(/(https?:\/\/[^\s<]+)/gi, (u) => {
            const mt = u.match(/^(.*?)([.,!?;:)\]]*)$/);
            const url = mt[1], tail = mt[2] || '';
            // Masked label — the raw URL is hidden; the pill reads "Link · Click to open"
            // (image URLs still render as a preview via the renderer's image branch).
            return `<a href="https://link-pill.local/${encodeURIComponent('Link' + '|||' + url)}">Link</a>${tail}`;
        });
    }).join('');
}
function _renderLinkPills(html) {
    let safe = (html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
    safe = _autoLink(safe);
    // Path-based secure files (private bucket) — open via a signed URL on tap.
    safe = safe.replace(
        /<a\s+href="https:\/\/secure-file\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
        (m, path, label) => {
            const p = String(path).replace(/"/g, '%22');
            const name = (label || 'File').replace(/^📎\s*/, '');
            // WhatsApp-style inline preview for image attachments. The private-bucket
            // signed URL is async, so render a placeholder <img data-imgpath> and let
            // the hydration observer fill in .src after render. Tap opens the full file.
            const clean = String(path).split('?')[0];
            if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(clean)) {
                // Reuse the cached signed URL if we already have one so the image doesn't
                // reload (flash) on re-render/scroll.
                const preSrc = _imgUrlCache[p] ? ` src="${x(_imgUrlCache[p])}"` : '';
                return `<div class="m-img-preview" data-action="openTaskFile" data-path="${p}" style="cursor:pointer;margin:4px 0;">
                    <img data-imgpath="${p}"${preSrc} alt="${x(name)}" loading="lazy"
                        style="width:100%;max-height:340px;min-height:140px;border-radius:12px;display:block;object-fit:cover;background:var(--bg-sidebar,#eef1f5);border:1px solid var(--border-color,#e5e7eb);">
                </div>`;
            }
            const ext = (clean.split('.').pop() || '');
            return _fileCardHTML(`data-action="openTaskFile" data-path="${p}"`, name, ext);
        });
    return safe.replace(
        /<a\s+href="https:\/\/link-pill\.local\/([^"]+)"[^>]*>([^<]*)<\/a>/g,
        (match, encoded, anchorText) => {
            try {
                const decoded = decodeURIComponent(encoded);
                const sepIdx  = decoded.indexOf('|||');
                const name = sepIdx > -1 ? decoded.substring(0, sepIdx) : (anchorText || decoded);
                const url  = sepIdx > -1 ? decoded.substring(sepIdx + 3) : decoded;
                const imgExts = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i;
                const fileExts = /\.(pdf|doc|docx|xlsx|xls|ppt|pptx|zip|rar|mp4|mp3)$/i;
                const fixedUrl = url.replace('/object/public/chat-attachments/', '/object/public/task-proofs/');
                const safeUrl = fixedUrl.replace(/'/g, '%27');
                if (imgExts.test(url.split('?')[0])) {
                    return `<div class="m-img-preview" data-action="openFile" data-url="${encodeURIComponent(safeUrl)}" style="cursor:pointer;margin:4px 0;">
                        <img src="${x(fixedUrl)}" alt="${x(name)}" style="width:100%;max-height:340px;border-radius:12px;display:block;object-fit:cover;" loading="lazy"
                            onerror="this.parentElement.innerHTML='<button class=&quot;m-link-pill&quot; data-action=&quot;openFile&quot; data-url=&quot;${encodeURIComponent(safeUrl)}&quot; style=&quot;display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;border:none;cursor:pointer;&quot;><i class=&quot;fa-solid fa-image&quot; style=&quot;font-size:9px;&quot;></i><span>${x(name)}</span></button>'">
                    </div>`;
                }
                // A file URL → rich file card; a plain web link → masked "Link · Click to open" pill.
                if (fileExts.test(url.split('?')[0])) {
                    const ext = (url.split('?')[0].split('.').pop() || '');
                    return _fileCardHTML(`data-action="openFile" data-url="${encodeURIComponent(safeUrl)}"`, name || 'File', ext);
                }
                const shown = name && name !== url ? name : 'Link';
                return `<button class="m-link-pill" data-action="openFile" data-url="${encodeURIComponent(safeUrl)}" title="${x(fixedUrl)}"
                    style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:700;border:none;text-decoration:none;cursor:pointer;margin:2px 0;box-shadow:0 2px 8px rgba(99,102,241,.35);white-space:nowrap;vertical-align:middle;max-width:100%;overflow:hidden;">
                    <i class="fa-solid fa-link" style="font-size:10px;flex-shrink:0;"></i><span style="overflow:hidden;text-overflow:ellipsis;">${x(shown)}</span>
                    <span style="font-size:9px;opacity:.8;border-left:1px solid rgba(255,255,255,.35);padding-left:7px;margin-left:3px;">Click to open</span>
                </button>`;
            } catch(e) { return match; }
        }
    );
}
window._mobOpenFile = function(url) {
    if (!url) { _toast('File URL missing', 'err'); return; }
    window.open(url, '_blank');
};

function _composerHTML(ceId, placeholder, sendAction, sendData) {
    const showSchedule = window.canSchedule?.() ?? false;
    const showUpload = window.canUpload?.() ?? true;
    const expired = !!window._trialExpired;
    return `
    <div class="m-composer">
      <div class="m-ce-wrap">
        ${showSchedule ? `<button class="m-cic" data-caction="schedule" data-target="${ceId}" ${expired?'disabled':''}><i class="fa-solid fa-clock"></i></button>` : ''}
        <div class="m-ce" id="${ceId}" contenteditable="${expired?'false':'true'}" data-placeholder="${x(expired ? 'Trial expired — contact developer to upgrade' : placeholder)}" style="${expired?'opacity:.5;':''}"></div>
        ${showUpload ? `<button class="m-cic" data-caction="attach" data-target="${ceId}" ${expired?'disabled':''}><i class="fa-solid fa-paperclip"></i></button>` : ''}
      </div>
      <button class="m-sendbtn" data-action="${sendAction}" data-target="${ceId}" ${sendData} ${expired?'disabled style="opacity:.4;"':''}>
        <i class="fa-solid fa-paper-plane"></i>
      </button>
    </div>`;
}
function _ceHTML(id) {
    const el = _el(id); if (!el) return '';
    const html = el.innerHTML.trim();
    return (html==='' || html==='<br>') ? '' : html;
}
function _ceClear(id) { const el = _el(id); if (el) el.innerHTML=''; }

// ── @mentions ───────────────────────────────────────────────────────────────
// Detect an "@query" being typed at the caret, show a member picker, and insert
// a mention chip (<span class="mention" data-uid="…">@Name</span>) on select.
// The server (send-push) parses data-uid to fire high-priority "mentioned you"
// notifications; bubbles render the chip highlighted.
let _mentionCE = null;
function _mentionCandidates(room) {
    let ids = [];
    try { ids = JSON.parse(_lsGet('dept_members_'+room) || '[]'); } catch (e) {}
    if (room?.startsWith('dm_')) ids = room.replace('dm_','').split('_');
    let list = _users.filter(u => (ids.length ? ids.includes(u.id) : true) && u.id !== _uid);
    if (!list.length) list = _users.filter(u => u.id !== _uid);
    return list;
}
function _detectMention(ce) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return _closeMentionPicker();
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3) return _closeMentionPicker();   // must be in a text node
    const textBefore = node.textContent.slice(0, sel.anchorOffset);
    const mmatch = textBefore.match(/(^|\s)@([\p{L}\p{N}_]{0,20})$/u);
    if (!mmatch) return _closeMentionPicker();
    const query = mmatch[2].toLowerCase();
    const top = _stack[_stack.length-1];
    const cand = _mentionCandidates(top?.params?.room)
        .filter(u => (u.full_name || u.email || '').toLowerCase().includes(query))
        .slice(0, 6);
    if (!cand.length) return _closeMentionPicker();
    _mentionCE = ce;
    _showMentionPicker(cand, node, sel.anchorOffset, mmatch[2].length);
}
function _showMentionPicker(cand, node, offset, qlen) {
    let box = _el('mMentionBox');
    if (!box) { box = document.createElement('div'); box.id = 'mMentionBox'; document.getElementById('mobileApp')?.appendChild(box); }
    box.innerHTML = cand.map(u => {
        const nm = _uname(u.id);
        return `<div class="m-mention-item" data-uid="${u.id}" data-name="${x(nm)}">
            ${_avatarHTML(u.avatar_url, nm, 'var(--accent)', 'm-av-tiny')}<span>${x(nm)}</span></div>`;
    }).join('');
    box.querySelectorAll('.m-mention-item').forEach(it => {
        it.onclick = () => _insertMention(it.dataset.uid, it.dataset.name, node, offset, qlen);
    });
    box.classList.add('show');
}
function _closeMentionPicker() { _el('mMentionBox')?.classList.remove('show'); _mentionCE = null; }
function _insertMention(uid, name, node, offset, qlen) {
    try {
        // Remove the "@query" text (including the @).
        const start = offset - qlen - 1;
        const range = document.createRange();
        range.setStart(node, Math.max(0, start));
        range.setEnd(node, offset);
        range.deleteContents();
        // Insert the mention chip + a trailing space, place caret after it.
        const chip = document.createElement('span');
        chip.className = 'mention'; chip.dataset.uid = uid; chip.contentEditable = 'false';
        chip.textContent = '@' + name;
        range.insertNode(chip);
        const sp = document.createTextNode(' ');
        chip.after(sp);
        const sel = window.getSelection();
        sel.removeAllRanges();
        const r2 = document.createRange(); r2.setStartAfter(sp); r2.collapse(true);
        sel.addRange(r2);
    } catch (e) {}
    _closeMentionPicker();
}
function _ceInsertText(targetId, value) {
    const el = _el(targetId);
    if (!el) return;
    el.appendChild(document.createTextNode(value + ' '));
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

async function _groupChat(p) {
    if (!_users.length) await _ctx();
    const cached = _loadRoomCache(p.room);

    _pendingRefresh = async () => {
        const myGen = ++_refreshGen;
        if (_isOffline) return;
        try {
            const { data: rawMsgs } = await sb.from('messages')
                .select('id,text,sender_id,created_at,updated_at,parent_message_id')
                .eq('room_id',p.room).eq('tenant_id',_tid)
                .is('deleted_at',null).is('parent_message_id',null)
                .order('created_at',{ascending:false}).limit(30);
            if (!rawMsgs) return;
            const msgs = rawMsgs.reverse();  // oldest → newest for display
            _oldestTs[p.room] = msgs[0]?.created_at || null;
            _allLoaded[p.room] = rawMsgs.length < 30;
            _saveRoomCache(p.room, msgs);
            const msgIds = msgs.map(m=>m.id);
            const [reactionsMap, replyData] = await Promise.all([
                _fetchReactions(msgIds),
                sb.from('messages').select('parent_message_id').in('parent_message_id', msgIds).eq('tenant_id',_tid).is('deleted_at',null)
            ]);
            const replyMap = {};
            (replyData.data||[]).forEach(r => { replyMap[r.parent_message_id] = (replyMap[r.parent_message_id]||0)+1; });
            _replyMapCache[p.room] = replyMap;   // cache for instant shell render next time
            if (myGen !== _refreshGen) { return; }
            const area = document.getElementById('mMsgArea');
            if (area) {
                // Preserve only genuinely NEWER live rows (realtime/optimistic) that the
                // latest-50 fetch hasn't caught yet. Rows OLDER than the newest DB message
                // (e.g. ones paginated in via scroll-up) must NOT be re-appended at the
                // bottom — that's what made older messages show below the latest.
                const dbIds = new Set(msgs.map(m=>m.id));
                const newestDbTs = msgs.length ? msgs[msgs.length-1].created_at : '';
                // Anti-flash: if the cached shell already rendered EXACTLY these rows in
                // the same order, don't wholesale-replace innerHTML (that repaint is the
                // "flash with lag" on open). Just refresh reaction chips in place.
                const shownIds = [...area.querySelectorAll('.m-bubble-row[id^="row-"]')].map(el => el.id.replace('row-',''));
                const sameSet = shownIds.length === msgs.length && shownIds.every((id,i) => id === msgs[i].id);
                if (sameSet) {
                    msgs.forEach(m => _refreshChipsFromMap(m.id, reactionsMap));
                } else {
                    const liveRows = [...area.querySelectorAll('.m-bubble-row[id^="row-"]')]
                        .filter(el => !dbIds.has(el.id.replace('row-','')))
                        .filter(el => (el.querySelector('.m-bmeta[data-ts]')?.dataset.ts || '') > newestDbTs)
                        .map(el => el.outerHTML);
                    area.innerHTML = msgs.map(m=>_bubbleHTML(m,reactionsMap,140,replyMap,p)).join('') || '<div class="m-empty">No messages yet. Send the first one!</div>';
                    liveRows.forEach(html => area.insertAdjacentHTML('beforeend', html));
                    area.scrollTop = area.scrollHeight;
                }
            }
        } catch {}
    };

    const shellMsgs = cached || [];
    const memberCount = (() => { try { const m=JSON.parse(_lsGet('dept_members_'+p.room)||'[]'); return m.length || ''; } catch { return ''; } })();
    // Broadcast room_read and record our own read timestamp
    setTimeout(() => {
        _bcSend('room_read', { room:p.room, uid:_uid, ts:new Date().toISOString() });
        _lsSet('last_read_'+p.room, new Date().toISOString());
        try { sb.from('room_reads').upsert({ user_id:_uid, room_id:p.room, tenant_id:_tid, last_read_at:new Date().toISOString() }, { onConflict:'user_id,room_id' }).then(()=>{}); } catch(e){}
    }, 500);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        ${_avatarHTML(DEPTS.find(d=>d.id===p.room)?.photo || _customGroups.find(g=>g.id===p.room)?.photo, p.name, p.color, 'm-av-sm sq')}
        <div class="m-htitle-wrap" data-action="viewMembersSheet" data-room="${p.room}" style="cursor:pointer;">
          <div class="m-htitle">${x(p.name)}</div>
          <div class="m-hsubtitle">${memberCount ? memberCount + ' members' : 'View members'} ›</div>
        </div>
        <button class="m-hdr-action" onclick="window._toggleChatSearch('mMsgArea')"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-hdr-menu" onclick="window._showRoomMenu('${p.room}','${window.escapeJs(p.name)}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      <div id="mChatSearchBar" style="display:none;padding:6px 12px;background:var(--surface);border-bottom:1px solid var(--border);">
        <input id="mChatSearchInp" type="search" placeholder="Search messages…" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;" oninput="window._filterChatMsgs(this.value,'mMsgArea')">
      </div>
      <div class="m-msgs" id="mMsgArea">
        ${shellMsgs.length ? (()=>{ const sr=_loadReactionsCache(); const rmap=_replyMapCache[p.room]||{}; return shellMsgs.map(m=>_bubbleHTML(m,sr,140,rmap,p)).join(''); })() : '<div class="m-empty" style="color:var(--text-secondary);padding:40px;text-align:center;">' + (cached ? 'No messages yet.' : '<div class="skel skel-bubble"></div><div class="skel skel-bubble r"></div><div class="skel skel-bubble"></div><div class="skel skel-bubble r"></div>') + '</div>'}
      </div>
      <button class="m-scrollfab m-scrollfab-top" id="mScrollTopFab" style="display:none;" onclick="document.getElementById('mMsgArea').scrollTo({top:0,behavior:'smooth'})"><i class="fa-solid fa-chevron-up"></i></button>
      <button class="m-scrollfab" id="mScrollFab" style="display:none;" onclick="document.getElementById('mMsgArea').scrollTo({top:9e9,behavior:'smooth'})"><i class="fa-solid fa-chevron-down"></i></button>
      <div class="m-typing-area" id="mTypingArea"></div>
      ${_composerHTML('mGCE', `Message ${p.name||''}…`, 'sendGroup', `data-room="${p.room}" data-name="${x(p.name)}" data-color="${p.color||''}"`)}
    </div>`;
}

async function _thread(p) {
    const { data: replies } = await sb.from('messages')
        .select('id,text,sender_id,created_at,updated_at')
        .eq('parent_message_id',p.id).eq('tenant_id',_tid)
        .is('deleted_at',null).order('created_at',{ascending:true});

    const reactionsMap = await _fetchReactions((replies||[]).map(m=>m.id));
    // Parent preview: sender + first line + 📎 for attachments; "Original message
    // unavailable" if it was deleted (instead of a blank/stale quote). Fetched fresh
    // so a since-deleted parent is reflected.
    let _pv;
    try {
        const { data: par } = await sb.from('messages').select('text,sender_id,deleted_at').eq('id', p.id).maybeSingle();
        if (!par || par.deleted_at) {
            _pv = { sender: p.sender || '', body: '<em style="opacity:.6;">Original message unavailable</em>' };
        } else {
            const plain = String(par.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            _pv = { sender: (_uname(par.sender_id) || p.sender || ''), body: plain ? x(_snip(plain, 140)) : '📎 Attachment' };
        }
    } catch (e) { _pv = { sender: p.sender || '', body: _renderLinkPills(p.text || '') }; }
    // Header reads "Reply to <Name>" (WhatsApp-style), not the generic "Thread".
    const _who = (p.sender || '').split('·')[0].split('•')[0].trim() || 'message';

    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div style="display:flex;flex-direction:column;gap:1px;">
          <div class="m-htitle">Reply to ${x(_who)}</div>
          ${p.rname ? `<div style="font-size:11px;color:var(--text-secondary);font-weight:600;">${x(p.rname)}</div>` : ''}
        </div>
      </div>
      <div class="m-msgs" id="mThreadArea">
        <div class="m-thread-parent">
          <div class="m-bmeta">${x(_pv.sender)}${p.time?` · ${p.time}`:''}</div>
          <div class="m-btext">${_pv.body}</div>
        </div>
        ${replies?.length ? `<div class="m-thread-sep">${replies.length} ${replies.length===1?'Reply':'Replies'}</div>` : ''}
        ${(replies||[]).map(m=>_bubbleHTML(m,reactionsMap,160)).join('')}
      </div>
      ${_composerHTML('mRCE', 'Write a reply…', 'sendReply', `data-pid="${p.id}" data-room="${p.room}" data-rname="${x(p.rname||'')}" data-rcol="${p.rcol||''}" data-text="${x(p.text||'')}" data-sender="${x(p.sender||'')}" data-time="${p.time||''}"`)}
    </div>`;
}

async function _dm(p) {
    const cached    = _loadRoomCache(p.room);
    const otherUser = _users.find(u=>u.id===p.uid);

    _pendingRefresh = async () => {
        const myGen = ++_refreshGen;
        if (_isOffline) return;
        try {
            const { data: rawMsgs } = await sb.from('messages')
                .select('id,text,sender_id,created_at,updated_at,parent_message_id')
                .eq('room_id',p.room).eq('tenant_id',_tid)
                .is('deleted_at',null).is('parent_message_id',null)
                .order('created_at',{ascending:false}).limit(30);
            if (!rawMsgs) return;
            const msgs = rawMsgs.reverse();  // oldest → newest for display
            _oldestTs[p.room] = msgs[0]?.created_at || null;
            _allLoaded[p.room] = rawMsgs.length < 30;
            _saveRoomCache(p.room, msgs);
            const msgIds = msgs.map(m=>m.id);
            const [reactionsMap, replyData] = await Promise.all([
                _fetchReactions(msgIds),
                sb.from('messages').select('parent_message_id').in('parent_message_id', msgIds).eq('tenant_id',_tid).is('deleted_at',null)
            ]);
            const replyMap = {};
            (replyData.data||[]).forEach(r => { replyMap[r.parent_message_id] = (replyMap[r.parent_message_id]||0)+1; });
            _replyMapCache[p.room] = replyMap;
            if (myGen !== _refreshGen) return;
            const area = document.getElementById('mDMArea');
            if (area) {
                const dbIds2 = new Set(msgs.map(m=>m.id));
                const newestDbTs2 = msgs.length ? msgs[msgs.length-1].created_at : '';
                // Anti-flash (see group path): skip the wholesale repaint when the shell
                // already shows exactly these rows.
                const shownIds2 = [...area.querySelectorAll('.m-bubble-row[id^="row-"]')].map(el => el.id.replace('row-',''));
                const sameSet2 = shownIds2.length === msgs.length && shownIds2.every((id,i) => id === msgs[i].id);
                if (sameSet2) {
                    msgs.forEach(m => _refreshChipsFromMap(m.id, reactionsMap));
                } else {
                    const liveRows2 = [...area.querySelectorAll('.m-bubble-row[id^="row-"]')]
                        .filter(el => !dbIds2.has(el.id.replace('row-','')))
                        .filter(el => (el.querySelector('.m-bmeta[data-ts]')?.dataset.ts || '') > newestDbTs2)
                        .map(el => el.outerHTML);
                    area.innerHTML = msgs.map(m=>_bubbleHTML(m,reactionsMap,160,replyMap,p)).join('') || `<div class="m-empty">Start a conversation with ${x(p.name)}</div>`;
                    liveRows2.forEach(html => area.insertAdjacentHTML('beforeend', html));
                    area.scrollTop = area.scrollHeight;
                }
            }
        } catch {}
    };

    const shellMsgs = cached || [];
    const onlineStat = _onlineStatus(p.uid);
    const roleTag = _roleChip(p.uid);
    // Broadcast room_read and record our own read timestamp
    setTimeout(() => {
        _bcSend('room_read', { room:p.room, uid:_uid, ts:new Date().toISOString() });
        _lsSet('last_read_'+p.room, new Date().toISOString());
        try { sb.from('room_reads').upsert({ user_id:_uid, room_id:p.room, tenant_id:_tid, last_read_at:new Date().toISOString() }, { onConflict:'user_id,room_id' }).then(()=>{}); } catch(e){}
    }, 500);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div style="position:relative;flex-shrink:0;">${_avatarHTML(otherUser?.avatar_url, p.name, 'var(--accent)', 'm-av-sm')}${_onlineDot(p.uid)}</div>
        <div class="m-htitle-wrap">
          <div class="m-htitle">${x(p.name)} ${roleTag}</div>
          <div class="m-hsubtitle" data-online-uid="${p.uid}">${onlineStat}</div>
        </div>
        <button class="m-hdr-action" onclick="window._toggleChatSearch('mDMArea')"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-hdr-menu" onclick="window._showRoomMenu('${p.room}','${window.escapeJs(p.name)}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      <div id="mChatSearchBar" style="display:none;padding:6px 12px;background:var(--surface);border-bottom:1px solid var(--border);">
        <input id="mChatSearchInp" type="search" placeholder="Search messages…" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;" oninput="window._filterChatMsgs(this.value,'mDMArea')">
      </div>
      <div class="m-msgs" id="mDMArea">
        ${shellMsgs.length ? (()=>{ const sr=_loadReactionsCache(); const rmap=_replyMapCache[p.room]||{}; return shellMsgs.map(m=>_bubbleHTML(m,sr,160,rmap,p)).join(''); })() : `<div class="m-empty" style="color:var(--text-secondary);padding:40px;text-align:center;">${cached ? `Start a conversation with ${x(p.name)}` : '<div class="skel skel-bubble"></div><div class="skel skel-bubble r"></div><div class="skel skel-bubble"></div><div class="skel skel-bubble r"></div>'}</div>`}
      </div>
      <button class="m-scrollfab m-scrollfab-top" id="mScrollTopFab" style="display:none;" onclick="document.getElementById('mDMArea').scrollTo({top:0,behavior:'smooth'})"><i class="fa-solid fa-chevron-up"></i></button>
      <button class="m-scrollfab" id="mScrollFab" style="display:none;" onclick="document.getElementById('mDMArea').scrollTo({top:9e9,behavior:'smooth'})"><i class="fa-solid fa-chevron-down"></i></button>
      <div class="m-typing-area" id="mTypingArea"></div>
      ${_composerHTML('mDCE', `Message ${p.name||''}…`, 'sendDM', `data-room="${p.room}" data-uid="${p.uid||''}" data-name="${x(p.name)}"`)}
    </div>`;
}

window._mobTaskFilter = (v) => { window._taskFilter = v; window._navTo('tasks', null, true); };
window._mobTaskSort   = (v) => { window._taskSort = v;   window._navTo('tasks', null, true); };
async function _tasks() {
    const filter = window._taskFilter || 'all';
    const sort   = window._taskSort   || 'new';
    // Merge tasks assigned TO me (with my per-assignee status) and tasks created BY
    // me, keyed by task id, so a single list can be filtered By/For me etc.
    const byId = {};
    const assigneeMap = {};
    try {
        const [mine, created] = await Promise.all([
            sb.from('task_assignees')
                .select('status, tasks!inner(id,title,priority,deadline,created_at,require_proof,assigned_by,status)')
                .eq('assignee_id',_uid).eq('tenant_id',_tid)
                .order('created_at',{ascending:false,foreignTable:'tasks'}).limit(100),
            sb.from('tasks').select('id,title,priority,deadline,created_at,require_proof,assigned_by,status')
                .eq('tenant_id',_tid).eq('assigned_by',_uid)
                .order('created_at',{ascending:false}).limit(100),
        ]);
        (mine.data||[]).forEach(r => { const t=r.tasks; byId[t.id] = { ...t, myStatus:r.status, forMe:true }; });
        (created.data||[]).forEach(t => { byId[t.id] = { ...(byId[t.id]||{}), ...t, byMe:true, forMe:byId[t.id]?.forMe||false, myStatus:byId[t.id]?.myStatus }; });
        const ids = Object.keys(byId);
        if (ids.length) {
            const { data: aa } = await sb.from('task_assignees').select('task_id,assignee_id').eq('tenant_id',_tid).in('task_id',ids);
            (aa||[]).forEach(a => { (assigneeMap[a.task_id]=assigneeMap[a.task_id]||[]).push(_uname(a.assignee_id)); });
        }
        window.LocalDB?.kvSet?.('tasks_cache2_'+_uid, { byId, assigneeMap, ts:Date.now() });
    } catch (e) {
        const c = await window.LocalDB?.kvGet?.('tasks_cache2_'+_uid);
        if (c?.byId) { Object.assign(byId, c.byId); Object.assign(assigneeMap, c.assigneeMap||{}); }
    }

    const now = new Date();
    const todayStr = _istFmtDate.format(now);
    const isToday = (d) => d && _istFmtDate.format(new Date(_normTs(d))) === todayStr;
    const doneOf = (t) => (t.myStatus||t.status) === 'accepted';
    let list = Object.values(byId).filter(t => {
        switch (filter) {
            case 'pending':     return !doneOf(t);
            case 'done':        return doneOf(t);
            case 'today':       return isToday(t.deadline);
            case 'byme':        return t.byMe;
            case 'forme':       return t.forMe;
            case 'delegate':    return (t.myStatus||t.status||'').includes('deleg');
            case 'transferred': return (t.myStatus||t.status||'').includes('transfer');
            default:            return true;   // all
        }
    });
    list.sort((a,b) => {
        if (sort === 'deadline') return (new Date(_normTs(a.deadline||'2999')) - new Date(_normTs(b.deadline||'2999')));
        const ta = new Date(_normTs(a.created_at)).getTime(), tb = new Date(_normTs(b.created_at)).getTime();
        return sort === 'old' ? ta - tb : tb - ta;   // new = desc
    });

    const stMap = { pending_ack:{bg:'#fef9c3',fg:'#854d0e',lbl:'⏳ Needs Ack'},
                    in_progress:{bg:'#dbeafe',fg:'#1d4ed8',lbl:'🔄 In Progress'},
                    submitted:  {bg:'#ffedd5',fg:'#9a3412',lbl:'📬 Pending Review'},
                    needs_review:{bg:'#fee2e2',fg:'#991b1b',lbl:'🔄 Changes Needed'},
                    accepted:   {bg:'#dcfce7',fg:'#16a34a',lbl:'🎉 Done'},
                    overdue:    {bg:'#fee2e2',fg:'#b91c1c',lbl:'🔴 Overdue'} };
    const filters = [['all','All'],['pending','Pending'],['done','Done'],['today','Today'],['byme','By Me'],['forme','For Me'],['delegate','Delegated'],['transferred','Transferred']];
    const sorts   = [['new','Newest'],['old','Oldest'],['deadline','Deadline']];
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">My Tasks</div></div>
      <div class="af-filters af-selrow">
        <select class="af-select" onchange="window._mobTaskFilter(this.value)">
          ${filters.map(([k,l])=>`<option value="${k}" ${filter===k?'selected':''}>${l}</option>`).join('')}
        </select>
        <select class="af-select" onchange="window._mobTaskSort(this.value)">
          ${sorts.map(([k,l])=>`<option value="${k}" ${sort===k?'selected':''}>Sort: ${l}</option>`).join('')}
        </select>
      </div>
      ${list.length ? list.map(t => {
        const st0 = t.myStatus || t.status || 'pending_ack';
        const isOverdue = t.deadline && new Date(_normTs(t.deadline))<now && st0!=='accepted';
        const st = isOverdue ? stMap.overdue : (stMap[st0]||stMap.pending_ack);
        const assignees = (assigneeMap[t.id]||[]).join(', ');
        return `
        <div class="m-taskcard" data-action="taskDetail" data-id="${t.id}" data-title="${x(t.title)}">
          <div class="m-tc-top">
            <div class="m-tc-title">${x(t.title)}</div>
            <span class="m-badge" style="background:${st.bg};color:${st.fg};">${st.lbl}</span>
          </div>
          <div class="m-tc-meta">
            ${t.deadline ? `<span>📅 ${_fmtIST(t.deadline,false)}</span>` : ''}
            ${t.priority  ? `<span>⚡ ${t.priority}</span>` : ''}
            ${t.byMe ? `<span>✍️ By me</span>` : ''}
          </div>
          <div class="m-tc-people">
            <div>👤 Created by ${x(_uname(t.assigned_by))}</div>
            ${assignees ? `<div>👥 Assigned to ${x(assignees)}</div>` : ''}
            <div>🕐 ${_fmtIST(t.created_at)}</div>
          </div>
        </div>`; }).join('') : '<div class="m-empty">No tasks match this filter.</div>'}
    </div>`;
}

async function _taskDetail(p) {
    const [{ data: ta }, { data: trails }] = await Promise.all([
        sb.from('task_assignees').select('*, tasks(*)').eq('task_id',p.id).eq('assignee_id',_uid).single(),
        sb.from('task_trails').select('*').eq('task_id',p.id).order('created_at',{ascending:false}).limit(30),
    ]);
    const t = ta?.tasks || {};
    const status = ta?.status || 'pending_ack';
    const stLbl = { pending_ack:'⏳ Needs acknowledgement', in_progress:'🔄 In progress',
                    submitted:'📬 Submitted — pending review', needs_review:'🔄 Changes needed',
                    accepted:'🎉 Accepted — done' }[status] || status;
    const hasProof = (trails||[]).some(tr => tr.action==='FILE');
    const needsProofWarning = t.require_proof && !hasProof && status==='in_progress';

    return `<div class="mScr-inner" data-task-id="${p.id}">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Task Details</div>
        <button class="m-sb-icon" title="Download PDF" data-action="downloadTaskPdf" data-id="${p.id}"><i class="fa-solid fa-file-pdf"></i></button>
      </div>
      <div style="padding:16px;">
        <h2 style="font-size:20px;font-weight:800;margin-bottom:16px;">${x(t.title||p.title)}</h2>
        <div class="m-detail-row"><span class="m-detail-lbl">Status</span><span class="m-detail-val" id="mTaskStatusVal">${stLbl}</span></div>
        <div class="m-detail-row"><span class="m-detail-lbl">Priority</span><span class="m-detail-val">${x(t.priority||'Normal')}</span></div>
        <div class="m-detail-row"><span class="m-detail-lbl">Deadline</span><span class="m-detail-val">${t.deadline ? _fmtIST(t.deadline,false) : 'No deadline'}</span></div>
        ${t.require_proof ? `<div class="m-detail-row"><span class="m-detail-lbl">Proof required</span><span class="m-detail-val">${hasProof?'✅ Attached':'⚠️ Not yet attached'}</span></div>` : ''}
      </div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:10px;">
        ${status==='pending_ack' ? `
        <button class="m-action-btn" style="background:#16a34a;" data-action="mobTaskAction" data-task="${p.id}" data-act="ack">
          <i class="fa-solid fa-check-double"></i> Acknowledge Task
        </button>` : ''}
        ${(status==='in_progress'||status==='needs_review') ? `
        <div class="m-ce-wrap" style="border-radius:14px;"><div class="m-ce" id="mTNCE" contenteditable="true" data-placeholder="Add an update or comment…"></div></div>
        <button class="m-action-btn" style="background:#f59e0b;" data-action="mobTaskAction" data-task="${p.id}" data-act="update">
          <i class="fa-solid fa-comment"></i> Post Update
        </button>
        <button class="m-action-btn" style="background:#0ea5e9;" data-action="mobTaskAction" data-task="${p.id}" data-act="upload">
          <i class="fa-solid fa-upload"></i> Upload Proof / File
        </button>
        ${needsProofWarning ? `<div style="font-size:12px;color:#b91c1c;text-align:center;">⚠️ This task requires proof before you can submit</div>` : ''}
        <button class="m-action-btn" style="background:#6366f1;" data-action="mobTaskAction" data-task="${p.id}" data-act="submit">
          <i class="fa-solid fa-paper-plane"></i> ${status==='needs_review'?'Resubmit':'Submit for Review'}
        </button>
        <div style="display:flex;gap:10px;">
          <button class="m-action-btn" style="background:#8b5cf6;flex:1;" data-action="taskDelegateSheet" data-task="${p.id}">
            <i class="fa-solid fa-user-plus"></i> Delegate
          </button>
          <button class="m-action-btn" style="background:#64748b;flex:1;" data-action="taskTransferSheet" data-task="${p.id}">
            <i class="fa-solid fa-right-left"></i> Transfer
          </button>
        </div>` : ''}
        ${status==='submitted' ? `<div class="m-empty" style="padding:12px;">Waiting for the task creator to review your submission.</div>` : ''}
        ${status==='accepted' ? `<div class="m-empty" style="padding:12px;">🎉 This task is complete — no further action needed.</div>` : ''}
      </div>
      ${(trails||[]).length ? `
      <div style="padding:4px 16px 16px;">
        <div class="m-sl" style="padding:8px 0 6px;">Task Trail — latest first</div>
        ${trails.map((tr, _ti) => {
          const actLbl = { ACK:'Acknowledged', UPDATE:'Update', FILE:'File Attached', SUBMIT:'Submitted', ACCEPT:'Accepted', REWORK:'Rework Requested' }[tr.action] || (tr.action||'Update');
          return `
          <div style="padding:10px 0;border-bottom:1px solid var(--border-color);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <span style="font-size:11px;font-weight:800;color:var(--text-secondary,#9ca3af);">#${trails.length - _ti}</span>
              <span style="font-size:12.5px;font-weight:800;color:var(--accent,#6366f1);">${x(_uname(tr.user_id))}</span>
              <span style="font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:var(--bg-sidebar,#f1f5f9);border:1px solid var(--border-color,#e5e7eb);border-radius:20px;padding:2px 9px;color:var(--text-secondary,#6b7280);">${x(actLbl)}</span>
              <span style="font-size:11px;color:var(--text-secondary,#9ca3af);margin-left:auto;">${_fmtIST(tr.created_at)}</span>
            </div>
            <div style="font-size:14.5px;line-height:1.5;">
              ${tr.action==='FILE' ? `<button class="m-file-link" data-action="openTaskFile" data-path="${x((tr.comment||'').split('|')[1]||'')}">📎 ${x((tr.comment||'').split('|')[0])} <i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : x(tr.comment||'')}
            </div>
          </div>`; }).join('')}
      </div>` : ''}
      <input type="file" id="mFileInput" style="display:none;" accept="image/*,application/pdf">
    </div>`;
}

async function _reminders() {
    const { data } = await sb.from('reminders')
        .select('id,reminder_time,message_id,messages(text,room_id)')
        .eq('user_id',_uid).eq('triggered',false)
        .order('reminder_time',{ascending:true}).limit(30);

    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Reminders</div></div>
      ${(data||[]).length ? (data||[]).map(r => {
        const past = new Date(r.reminder_time) < new Date();
        const snippet = _snip(r.messages?.text || '(original message unavailable)', 60);
        return `
        <div class="m-row" style="gap:12px;">
          <div class="m-av" style="background:${past?'#9ca3af':'#f59e0b'};border-radius:12px;font-size:18px;">⏰</div>
          <div class="m-ri">
            <div class="m-rn" style="${past?'text-decoration:line-through;opacity:.6;':''}">${x(snippet)}</div>
            <div class="m-rs">${_fmtIST(r.reminder_time)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="m-icon-btn" data-action="editReminder" data-id="${r.id}" data-at="${r.reminder_time}" data-text="${x(snippet)}">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="m-icon-btn" style="color:#ef4444;" data-action="deleteReminder" data-id="${r.id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>`; }).join('') : '<div class="m-empty">No reminders set.</div>'}
    </div>`;
}
async function _remindEdit(p) {
    return `<div class="mScr-inner">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Edit Reminder</div>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <div class="m-field"><label class="m-label">Reminder for</label>
          <div style="font-size:14px;color:var(--text-secondary);">${x(p.text||'')}</div></div>
        <div class="m-field"><label class="m-label">Date & Time</label>
          <input class="m-inp" id="rAt" type="datetime-local" value="${p.at ? new Date(p.at).toISOString().slice(0,16) : ''}"></div>
        <button class="m-action-btn" style="background:#6366f1;" data-action="saveReminder" data-id="${p.id}">
          <i class="fa-solid fa-save"></i> Save Changes
        </button>
        <button class="m-action-btn" style="background:#ef4444;" data-action="deleteReminder" data-id="${p.id}">
          <i class="fa-solid fa-trash"></i> Delete Reminder
        </button>
      </div>
    </div>`;
}

async function _bookmarks() {
    const bms = JSON.parse(_lsGet('tf_bookmarks_'+_uid)||'[]');
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Bookmarks</div></div>
      ${bms.length ? bms.map((b,i) => `
        <div class="m-row">
          <div class="m-av" style="background:#f59e0b;border-radius:12px;font-size:20px;">🔖</div>
          <div class="m-ri" data-action="gotoBookmark"
               data-isdm="${b.room?.startsWith('dm_')?'1':'0'}" data-room="${b.room}" data-rname="${x(b.rname||'')}"
               data-rcol="${b.rcol||''}" data-uid="${b.uid||''}" data-scroll="${b.msgId}">
            <div class="m-rn">${x(b.text?.substring(0,40)||'Bookmarked message')}</div>
            <div class="m-rs">${x(b.rname||b.room)} · ${b.time}</div>
          </div>
          <button class="m-icon-btn" style="color:#ef4444;" data-action="removeBookmark" data-idx="${i}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`).join('') : '<div class="m-empty">No bookmarks yet.<br><small>Long-press a message in chat to bookmark it.</small></div>'}
    </div>`;
}

async function _scheduled() {
    const { data } = await sb.from('scheduled_messages')
        .select('id,message_text,room_id,scheduled_time').eq('tenant_id',_tid).eq('sender_id',_uid)
        .eq('status','pending').order('scheduled_time',{ascending:true}).limit(20);
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Scheduled Messages</div></div>
      ${(data||[]).length ? (data||[]).map(s => {
        const dept = _findGroup(s.room_id);
        const roomName = dept ? dept.name : (s.room_id?.startsWith('dm_') ? 'Direct message' : s.room_id);
        return `
        <div class="m-row">
          <div class="m-av" style="background:#6366f1;border-radius:12px;font-size:18px;">🕐</div>
          <div class="m-ri" data-action="editScheduled" data-id="${s.id}" data-text="${x(s.message_text)}" data-at="${s.scheduled_time}" data-room="${x(roomName)}">
            <div class="m-rn">${_snip(s.message_text,50)}</div>
            <div class="m-rs">${x(roomName)} · ${_fmtIST(s.scheduled_time)}</div>
          </div>
          <button class="m-icon-btn" data-action="editScheduled" data-id="${s.id}" data-text="${x(s.message_text)}" data-at="${s.scheduled_time}" data-room="${x(roomName)}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="m-icon-btn" style="color:#ef4444;" data-action="cancelScheduled" data-id="${s.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`; }).join('') : '<div class="m-empty">No scheduled messages.</div>'}
    </div>`;
}
async function _scheduledEdit(p) {
    return `<div class="mScr-inner">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Edit Scheduled Message</div>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <div class="m-field"><label class="m-label">To</label>
          <div style="font-size:15px;font-weight:600;">${x(p.room)}</div></div>
        <div class="m-field"><label class="m-label">Message</label>
          <textarea class="m-inp" id="sTxt" rows="4" style="resize:vertical;">${x(p.text)}</textarea></div>
        <div class="m-field"><label class="m-label">Send at</label>
          <input class="m-inp" id="sAt" type="datetime-local" value="${p.at ? new Date(p.at).toISOString().slice(0,16) : ''}"></div>
        <button class="m-action-btn" style="background:#6366f1;" data-action="saveScheduled" data-id="${p.id}">
          <i class="fa-solid fa-save"></i> Save Changes
        </button>
        <button class="m-action-btn" style="background:#ef4444;" data-action="cancelScheduled" data-id="${p.id}">
          <i class="fa-solid fa-trash"></i> Cancel Message
        </button>
      </div>
    </div>`;
}

async function _settings() {
    const { data: p } = await sb.from('profiles').select('*').eq('id',_uid).eq('tenant_id',_tid).single();
    const permState = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permLabel = { granted:'✅ Enabled', denied:'🚫 Blocked in browser settings', default:'⚠️ Not yet enabled', unsupported:'Not supported on this browser' }[permState];
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Profile & Settings</div></div>
      <div style="display:flex;flex-direction:column;align-items:center;padding:28px 20px 20px;">
        <div class="m-av-wrap m-av-wrap-lg" data-action="setMyPhoto">
          ${_avatarHTML(p?.avatar_url, p?.full_name||p?.email, 'var(--accent)', 'm-av m-av-lg')}
          <span class="m-av-cam"><i class="fa-solid fa-camera"></i></span>
        </div>
        <div style="font-size:18px;font-weight:700;margin-top:12px;">${x(p?.full_name||'')}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${x(p?.email||'')}</div>
        <div style="font-size:12px;color:var(--accent);margin-top:4px;font-weight:600;">${x(p?.designation||'Staff')}</div>
        <input type="file" id="mMyPhotoInput" style="display:none;" accept="image/*">
      </div>

      <!-- 1 · PROFILE -->
      <div class="m-sl">PROFILE</div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:12px;">
        <div class="m-field"><label class="m-label">Full Name</label>
          <input class="m-inp" id="sName" value="${x(p?.full_name||'')}" placeholder="Your name"></div>
        <div class="m-field"><label class="m-label">Designation</label>
          <input class="m-inp" id="sDesig" value="${x(p?.designation||'')}" placeholder="Your designation"></div>
        <div class="m-field"><label class="m-label">Department</label>
          <input class="m-inp" id="sDept" value="${x(p?.department||'')}" placeholder="Your department"></div>
      </div>

      <!-- 2 · SOUND SETTINGS -->
      <div class="m-sl">SOUND</div>
      <div style="padding:0 16px 8px;">
        <div class="m-detail-row" style="margin-top:2px;">
          <span class="m-detail-lbl">Incoming message sound</span>
          <button data-action="toggleSoundIn" style="background:${(window._isSoundInOff?.())?'#9ca3af':_ONLINE_GREEN};color:#fff;border:none;border-radius:20px;padding:5px 16px;font-size:12px;font-weight:700;cursor:pointer;min-width:52px;">${(window._isSoundInOff?.())?'Off':'On'}</button>
        </div>
        <div class="m-detail-row" style="margin-top:10px;">
          <span class="m-detail-lbl">Outgoing (send) sound</span>
          <button data-action="toggleSoundOut" style="background:${(window._isSoundOutOff?.())?'#9ca3af':_ONLINE_GREEN};color:#fff;border:none;border-radius:20px;padding:5px 16px;font-size:12px;font-weight:700;cursor:pointer;min-width:52px;">${(window._isSoundOutOff?.())?'Off':'On'}</button>
        </div>
        ${window.IS_NATIVE ? '' : `
        <div class="m-detail-row" style="margin-top:10px;">
          <span class="m-detail-lbl">Browser notifications</span><span class="m-detail-val">${permLabel}</span>
        </div>
        ${permState !== 'granted' ? `<button class="m-action-btn" style="background:#6366f1;margin-top:8px;" data-action="enablePush">
          <i class="fa-solid fa-bell"></i> Enable notifications on this device
        </button>` : ''}
        <button class="m-action-btn" style="background:#0ea5e9;margin-top:8px;" data-action="testSound">
          <i class="fa-solid fa-volume-high"></i> Play test sound
        </button>`}
      </div>

      <!-- Bookmarks / Scheduled / Dashboard now live in the bottom-nav "More"
           sheet (role-gated) — removed from here to avoid duplicate entry points. -->

      <!-- 4 · BUTTONS -->
      <div class="m-sl">ACTIONS</div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:12px;">
        <button class="m-action-btn" style="background:#6366f1;" data-action="saveProfile">
          <i class="fa-solid fa-save"></i> Save Profile
        </button>
        <button class="m-action-btn" style="background:transparent;color:var(--text-secondary);border:1px solid var(--border-color);" data-action="changePassword">
          <i class="fa-solid fa-key"></i> Change Password
        </button>
        <button class="m-action-btn" style="background:#ef4444;" data-action="confirmLogout">
          <i class="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    </div>`;
}

async function _dashboard(p={}) {
    const filter = p?.filter || 'this_month';
    const now = new Date();
    const pad = n => String(n).padStart(2,'0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
    let p_from, p_to = ymd(now), periodLabel;

    if (filter === 'this_month') {
        p_from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
        periodLabel = now.toLocaleString('en-IN', {month:'long', year:'numeric'});
    } else if (filter === 'last_month') {
        const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
        p_from = ymd(lm);
        p_to   = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
        periodLabel = lm.toLocaleString('en-IN', {month:'long', year:'numeric'});
    } else if (filter === 'this_quarter') {
        const q = Math.floor(now.getMonth()/3);
        p_from = ymd(new Date(now.getFullYear(), q*3, 1));
        periodLabel = 'Q' + (q+1) + ' ' + now.getFullYear();
    } else {
        p_from = ymd(new Date(now.getFullYear(), 0, 1));
        periodLabel = 'Year ' + now.getFullYear();
    }

    const [scoreRes, { data: recent }] = await Promise.all([
        sb.rpc('get_staff_scorecard', { p_tenant_id: _tid, p_from, p_to }),
        sb.from('profiles').select('id,full_name,avatar_url,last_login').eq('tenant_id',_tid).is('deleted_at',null).order('last_login',{ascending:false}).limit(5),
    ]);

    const s = (scoreRes?.data||[]).find(r => r.user_id === _uid) || null;
    const grade  = s?.grade || 'N/A';
    const gColors = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c','N/A':'#64748b'};
    const gc     = gColors[grade] || '#64748b';
    const score  = s?.score != null ? s.score : 0;
    const barC   = score >= 90 ? '#16a34a' : score >= 65 ? '#f59e0b' : '#ef4444';
    const ackR   = s && s.msgs_received > 0 ? Math.round(s.acknowledged / s.msgs_received * 100) + '%' : '—';

    const filters = [
        {id:'this_month',label:'This Month'},
        {id:'last_month',label:'Last Month'},
        {id:'this_quarter',label:'Quarter'},
        {id:'this_year',label:'Year'},
    ];

    const sBox = (label, val, color) =>
        `<div style="background:var(--bg-body,#f8fafc);border:1px solid var(--border-color);border-radius:10px;padding:10px 6px;text-align:center;">
          <div style="font-size:18px;font-weight:800;color:${color};">${val}</div>
          <div style="font-size:9px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;">${label}</div>
        </div>`;

    const dimBar = (label, val, weight) => {
        const v = val != null ? Math.round(val) : 0;
        const c = v >= 80 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#ef4444';
        return `<div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:var(--text-primary);">${label}</span>
            <span style="font-size:12px;font-weight:700;color:${c};">${val!=null?v+'%':'N/A'} <span style="font-size:10px;color:var(--text-secondary);">×${weight}</span></span>
          </div>
          <div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;">
            <div style="width:${Math.min(100,v)}%;height:100%;background:${c};border-radius:6px;transition:width .8s;"></div>
          </div>
        </div>`;
    };

    const gradeLegend = [['A+','#16a34a'],['A','#1d4ed8'],['B','#854d0e'],['C','#c2410c'],['D','#b91c1c']]
        .map(([g,c]) => `<span style="font-size:10px;padding:1px 8px;border-radius:20px;font-weight:700;background:${c}18;color:${c};">${g}</span>`).join('');

    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Dashboard</div></div>
      <div style="padding:16px;">

        <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;scrollbar-width:none;">
          ${filters.map(f=>`<button onclick="window._mobDash('${f.id}')" style="flex-shrink:0;padding:6px 14px;border-radius:20px;border:1px solid ${filter===f.id?'#6366f1':'var(--border-color)'};background:${filter===f.id?'#6366f1':'transparent'};color:${filter===f.id?'#fff':'var(--text-secondary)'};font-size:12px;font-weight:600;cursor:pointer;">${f.label}</button>`).join('')}
        </div>

        <div class="m-sl">MY SCORECARD — ${periodLabel}</div>
        ${!s ? `<div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:24px 0;">No scorecard data for ${periodLabel}.</div>` : `
        <div style="background:var(--card-bg,#fff);border:1px solid var(--border-color);border-radius:14px;padding:16px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="width:56px;height:56px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${gc}15;border:3px solid ${gc}40;flex-shrink:0;">
              <div style="font-size:22px;font-weight:900;color:${gc};line-height:1;">${grade}</div>
              <div style="font-size:8px;font-weight:700;color:${gc};letter-spacing:1px;text-transform:uppercase;">Grade</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:36px;font-weight:900;color:${barC};line-height:1;">${score}%</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Overall Score</div>
              <div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;width:120px;margin:6px 0 0 auto;">
                <div style="width:${Math.min(100,score)}%;height:100%;background:${barC};border-radius:6px;"></div>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
            ${gradeLegend}
            <span style="font-size:10px;color:var(--text-secondary);">A+≥90 A≥80 B≥65 C≥50 D&lt;50</span>
          </div>

          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Task Performance (40%)</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;">
            ${sBox('Total', s.tasks_total||0, '#6366f1')}
            ${sBox('On Time', s.tasks_on_time||0, '#16a34a')}
            ${sBox('Delayed', s.tasks_delayed||0, '#f59e0b')}
            ${sBox('Pending', s.tasks_pending||0, '#ef4444')}
            ${sBox('Transferred', s.tasks_transferred||0, '#8b5cf6')}
          </div>

          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Communication · Responsiveness · Presence</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:14px;">
            ${sBox('Msgs Sent', s.msgs_sent||0, '#0ea5e9')}
            ${sBox('Msgs Rcvd', s.msgs_received||0, '#64748b')}
            ${sBox('Ack Rate', ackR, '#10b981')}
            ${sBox('Active Days', s.active_days||0, '#f59e0b')}
          </div>

          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:10px;">Score Breakdown</div>
          ${dimBar('Task Delivery', s.score_task, '40%')}
          ${dimBar('Communication', s.score_comm, '25%')}
          ${dimBar('Responsiveness', s.score_resp, '20%')}
          ${dimBar('Presence', s.score_presence, '15%')}
        </div>`}

        <div class="m-sl">RECENTLY ACTIVE</div>
        ${(recent||[]).map(u=>`
          <div class="m-row" style="padding:10px 0;">
            ${_avatarHTML(u.avatar_url, u.full_name, 'var(--accent)', 'm-av-sm')}
            <div class="m-ri"><div class="m-rn">${x(u.full_name||'Staff')}</div><div class="m-rs">${u.last_login?_ago(u.last_login):'Never logged in'}</div></div>
          </div>`).join('')}
      </div>
    </div>`;
}
window._mobDash = async (f) => { await window._navTo('dashboard', {filter:f}, true); };

async function _groupMgmt() {
    const PRESET_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6'];

    window._openGroupCreateSheet = function() {
        const sheet = _el('mSheetInner');
        sheet.innerHTML = `
          <div class="m-sheet-handle"></div>
          <div class="m-sheet-title">Create Department</div>
          <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:12px;">
            <div class="m-field"><label class="m-label">Department Name</label>
              <input class="m-inp" id="gmCreateName" placeholder="e.g. Science Department"></div>
            <div class="m-field"><label class="m-label">Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="gmColorRow">
                ${PRESET_COLORS.map(c=>`<div onclick="window._gmPickColor('${c}')" data-col="${c}"
                  style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;"></div>`).join('')}
              </div>
              <input type="hidden" id="gmCreateColor" value="${PRESET_COLORS[0]}">
            </div>
            <div class="m-field"><label class="m-label">Staff</label>
              <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:0 0 4px;" id="gmMemberList">
                ${_memberPickerHTML([])}
              </div>
            </div>
            <button class="m-action-btn" style="background:#6366f1;" onclick="window._doCreateGroup()">
              <i class="fa-solid fa-plus"></i> Create Department
            </button>
          </div>`;
        _openSheet();
        window._gmPickColor(PRESET_COLORS[0]);
    };

    window._gmPickColor = function(col) {
        document.querySelectorAll('#gmColorRow [data-col]').forEach(el => {
            el.style.border = el.dataset.col === col ? '3px solid #fff' : '3px solid transparent';
            el.style.boxShadow = el.dataset.col === col ? `0 0 0 2px ${el.dataset.col}` : 'none';
        });
        const inp = _el('gmCreateColor') || _el('gmEditColor');
        if (inp) inp.value = col;
    };

    window._doCreateGroup = async function() {
        if (window.guardManageGroups?.()) return;
        if (window._tenantOrphaned) { _toast('School account still being set up — contact support to finish setup.','err'); return; }
        const name  = (_el('gmCreateName')?.value||'').trim();
        const color = _el('gmCreateColor')?.value || '#6366f1';
        if (!name) { _toast('Enter a group name','err'); return; }
        const slug  = name.toLowerCase().replace(/[^a-z0-9]/g,'_').substring(0,20);
        const roomId = 'grp_'+slug+'_'+Date.now().toString(36);
        const selectedIds = [...document.querySelectorAll('#gmMemberList .gm-mem:checked')].map(el=>el.value);
        const adminIds = [...document.querySelectorAll('#gmMemberList .gm-crown.on')].map(b=>b.dataset.uid).filter(id=>selectedIds.includes(id));
        _lsSet('dept_name_'+roomId, name);
        _lsSet('dept_color_'+roomId, color);
        if (selectedIds.length) _lsSet('dept_members_'+roomId, JSON.stringify(selectedIds));
        _lsSet('dept_admins_'+roomId, JSON.stringify(adminIds));
        try {
            await _upsertRoomSettings({ room_id:roomId, tenant_id:_tid, name, color, updated_at:new Date().toISOString() }, selectedIds, adminIds);
            await sb.from('messages').insert({ room_id:roomId, tenant_id:_tid, sender_id:_uid, text:`<p>📢 <strong>${x(name)}</strong> group created.</p>`, created_at:new Date().toISOString() });
            _bcSend('group_photo', { room_id:roomId, name, color });
        } catch(e) { _toast('DB error: '+e.message, 'err'); }
        _customGroups.push({ id:roomId, name, col:color, photo:'' });
        _refreshDeptNames();
        window._closeSheet();
        _toast('Group "'+name+'" created!');
        await _render('groupMgmt', null, 'forward');
    };

    window._openGroupEditSheet = function(gid, gname, gcol) {
        const sheet = _el('mSheetInner');
        const currentMembers = JSON.parse(_lsGet('dept_members_'+gid)||'[]');
        const currentAdmins  = (()=>{ try { return JSON.parse(_lsGet('dept_admins_'+gid)||'[]'); } catch { return []; } })();
        sheet.innerHTML = `
          <div class="m-sheet-handle"></div>
          <div class="m-sheet-title">Edit Department</div>
          <input type="hidden" id="gmEditId" value="${gid}">
          <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:12px;">
            <div class="m-field"><label class="m-label">Department Name</label>
              <input class="m-inp" id="gmEditName" value="${x(gname)}" placeholder="Department name"></div>
            <button class="m-action-btn" style="background:#10b981;" data-action="setDeptPhoto" data-dept="${gid}">
              <i class="fa-solid fa-camera"></i> Change Department Photo
            </button>
            <div class="m-field"><label class="m-label">Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="gmColorRow">
                ${PRESET_COLORS.map(c=>`<div onclick="window._gmPickColor('${c}')" data-col="${c}"
                  style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;"></div>`).join('')}
              </div>
              <input type="hidden" id="gmEditColor" value="${gcol||'#6366f1'}">
            </div>
            <div class="m-field"><label class="m-label">Staff</label>
              <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:0 0 4px;" id="gmMemberList">
                ${_memberPickerHTML(currentMembers, currentAdmins)}
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">👑 = department co-admin (can edit this department).</div>
            </div>
            <button class="m-action-btn" style="background:#6366f1;" onclick="window._doSaveGroup()">
              <i class="fa-solid fa-save"></i> Save Changes
            </button>
          </div>`;
        _openSheet();
        window._gmPickColor(gcol||'#6366f1');
    };

    window._doSaveGroup = async function() {
        const gid   = _el('gmEditId')?.value;
        // Allow a tenant-wide group manager OR a co-admin of THIS department.
        if (!_isDeptAdmin(gid)) { _toast('You are not allowed to edit this department','err'); return; }
        const name  = (_el('gmEditName')?.value||'').trim();
        const color = _el('gmEditColor')?.value || '#6366f1';
        if (!gid || !name) { _toast('Invalid','err'); return; }
        const selectedIds = [...document.querySelectorAll('#gmMemberList .gm-mem:checked')].map(el=>el.value);
        const adminIds = [...document.querySelectorAll('#gmMemberList .gm-crown.on')].map(b=>b.dataset.uid).filter(id=>selectedIds.includes(id));
        _lsSet('dept_name_'+gid, name);
        _lsSet('dept_color_'+gid, color);
        _lsSet('dept_members_'+gid, JSON.stringify(selectedIds));
        _lsSet('dept_admins_'+gid, JSON.stringify(adminIds));
        try {
            await _upsertRoomSettings({ room_id:gid, tenant_id:_tid, name, color, updated_at:new Date().toISOString() }, selectedIds, adminIds);
            _bcSend('group_photo', { room_id:gid, name, color });
        } catch(e) { _toast('DB error: '+e.message, 'err'); }
        const cg = _customGroups.find(g=>g.id===gid);
        if (cg) { cg.name = name; cg.col = color; }
        _refreshDeptNames();
        window._closeSheet();
        _toast('Group updated!');
        await _render('groupMgmt', null, 'forward');
    };

    window._archiveGroup = async function(gid) {
        if (window.guardManageGroups?.()) return;
        // show confirmation inline instead of native confirm()
        if (!_el('mSheetInner')) return;
        const sheet = _el('mSheetInner');
        sheet.innerHTML = `
          <div class="m-sheet-handle"></div>
          <div class="m-sheet-title">Archive Group?</div>
          <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:14px;color:var(--text-secondary);">This group will be hidden from all users. You can restore it from the database if needed.</div>
            <button class="m-action-btn" style="background:#ef4444;" id="gmArchiveConfirm">Yes, Archive</button>
            <button class="m-action-btn" style="background:transparent;color:var(--text-secondary);border:1px solid var(--border-color);" onclick="window._closeSheet()">Cancel</button>
          </div>`;
        _openSheet();
        _el('gmArchiveConfirm').onclick = async () => {
            window._closeSheet();
            try {
                await sb.from('room_settings').upsert({ room_id:gid, tenant_id:_tid, archived:true, updated_at:new Date().toISOString() }, { onConflict:'room_id,tenant_id' });
                _bcSend('group_photo', { room_id:gid });  // live: other devices re-sync and drop the archived group
            } catch(e) { _toast('DB error: '+e.message,'err'); return; }
            const idx = _customGroups.findIndex(g=>g.id===gid);
            if (idx>=0) _customGroups.splice(idx,1);
            _toast('Group archived');
            await _render('groupMgmt', null, 'forward');
        };
    };
    window._restoreGroup = async function(gid) {
        if (window.guardManageGroups?.()) return;
        try {
            await sb.from('room_settings').upsert({ room_id:gid, tenant_id:_tid, archived:false, updated_at:new Date().toISOString() }, { onConflict:'room_id,tenant_id' });
            _bcSend('group_photo', { room_id:gid });   // live: other devices re-sync and show it again
        } catch(e) { _toast('DB error: '+e.message,'err'); return; }
        await _syncRoomSettings();
        _toast('Group restored');
        await _render('groupMgmt', null, 'forward');
    };

    // Fetch archived groups so the principal can restore them here (no DB needed).
    let archived = [];
    try {
        const { data } = await sb.from('room_settings')
            .select('room_id,name,color').eq('tenant_id',_tid).eq('archived',true);
        archived = (data||[]).filter(r => !r.room_id.startsWith('dm_'));
    } catch(e){}

    const _mgr = window.canManageGroups?.() ?? false;   // role manager: full CRUD
    return `<div class="mScr-inner">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Manage Departments</div>
      </div>
      <div style="padding:16px;">
        ${_mgr ? `<button class="m-action-btn" style="background:#7c3aed;margin-bottom:16px;" onclick="window._openGroupCreateSheet()">
          <i class="fa-solid fa-plus"></i> Create New Department
        </button>` : `<div class="m-empty" style="margin-bottom:12px;padding:10px;">You can edit the departments you co-administer 👑</div>`}

        <div class="m-sl">ACTIVE DEPARTMENTS</div>
        ${_customGroups.filter(d=>_isDeptAdmin(d.id)).length ? _customGroups.filter(d=>_isDeptAdmin(d.id)).map(d=>`
          <div class="m-row" style="padding:10px 0;">
            <div style="width:40px;height:40px;border-radius:12px;background:${d.col};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">${d.photo?`<img src="${d.photo}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`:'👥'}</div>
            <div class="m-ri"><div class="m-rn">${x(d.name)}</div><div class="m-rs" style="color:${d.col};">Department</div></div>
            <div style="display:flex;gap:6px;">
              <button onclick="window._openGroupEditSheet('${d.id}','${window.escapeJs(d.name)}','${d.col}')"
                style="padding:7px 13px;border-radius:9px;background:#6366f118;color:#6366f1;border:none;font-size:12.5px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-pen" style="margin-right:5px;"></i>Edit</button>
              ${_mgr ? `<button onclick="window._archiveGroup('${d.id}')"
                style="padding:7px 13px;border-radius:9px;background:#ef444418;color:#ef4444;border:none;font-size:12.5px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-box-archive" style="margin-right:5px;"></i>Archive</button>` : ''}
            </div>
          </div>`).join('') : '<div class="m-empty">No departments to manage yet.</div>'}

        ${archived.length ? `
        <div class="m-sl" style="margin-top:22px;"><i class="fa-solid fa-box-archive" style="margin-right:6px;color:#f59e0b;"></i>ARCHIVED GROUPS</div>
        ${archived.map(a=>`
          <div class="m-row" style="padding:10px 0;opacity:.75;">
            <div style="width:40px;height:40px;border-radius:12px;background:${a.color||'#94a3b8'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">📦</div>
            <div class="m-ri"><div class="m-rn">${x(a.name||a.room_id)}</div><div class="m-rs">Archived</div></div>
            <button onclick="window._restoreGroup('${a.room_id}')"
              style="padding:7px 13px;border-radius:9px;background:#16a34a18;color:#16a34a;border:none;font-size:12.5px;font-weight:700;cursor:pointer;"><i class="fa-solid fa-rotate-left" style="margin-right:5px;"></i>Restore</button>
          </div>`).join('')}` : ''}
      </div>
    </div>`;
}

function _openSheet()  {
    const el = _el('mSheet');
    window.logger?.logAction('openSheet', { found: !!el, theme: document.documentElement.getAttribute('data-theme') || 'light' });
    el?.classList.add('open');
}
window._closeSheet = () => _el('mSheet')?.classList.remove('open');

window._showMsgActions = function(params) {
    const isMe = params.me === 'true' || params.me === true;
    const ageMs = params.time ? (Date.now() - new Date(params.time).getTime()) : Infinity;
    const withinEditWindow = ageMs <= 30*60*1000;
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Message Actions</div>
      <div style="padding:0 8px 16px;display:flex;flex-direction:column;gap:2px;">
        <div class="m-sheet-row" data-action="addEmoji" data-id="${params.id}">
          <i class="fa-regular fa-face-smile" style="color:#f59e0b;"></i> Add Emoji Reaction
        </div>
        <div class="m-sheet-row" data-action="addTag" data-id="${params.id}">
          <i class="fa-solid fa-tag" style="color:#7c3aed;"></i> Quick Reply Tag
        </div>
        <div class="m-sheet-row" data-action="replyThread" data-id="${params.id}"
          data-text="${x(params.text)}" data-room="${params.room}"
          data-rname="${x(params.rname||'')}" data-rcol="${params.rcol||''}">
          <i class="fa-solid fa-reply" style="color:#6366f1;"></i> Reply in Thread
        </div>
        ${(window.canCreateTask?.() ?? false) ? `
        <div class="m-sheet-row" data-action="convertTask" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-list-check" style="color:#16a34a;"></i> Convert to Task
        </div>` : ''}
        <div class="m-sheet-row" data-action="setReminder" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-bell" style="color:#f59e0b;"></i> Set Reminder
        </div>
        <div class="m-sheet-row" data-action="forwardMsg" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-share" style="color:#0ea5e9;"></i> Forward Message
        </div>
        <div class="m-sheet-row" data-action="bookmarkMsg" data-id="${params.id}"
          data-text="${x(params.text)}" data-room="${params.room}"
          data-rname="${x(params.rname||'')}" data-rcol="${params.rcol||''}">
          <i class="fa-solid fa-bookmark" style="color:#f59e0b;"></i> Bookmark
        </div>
        ${isMe ? (withinEditWindow ? `
        <div class="m-sheet-row" data-action="editMsg" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-pen" style="color:#6366f1;"></i> Edit Message
        </div>
        <div class="m-sheet-row" style="color:#ef4444;" data-action="deleteMsg" data-id="${params.id}">
          <i class="fa-solid fa-trash" style="color:#ef4444;"></i> Delete Message
        </div>` : `
        <div class="m-sheet-row" style="opacity:.45;">
          <i class="fa-solid fa-lock" style="color:var(--text-secondary);"></i> Edit/Delete unavailable (30 min limit passed)
        </div>`) : ''}
      </div>`;
    _openSheet();
};

const EMOJI_LIST = ['👍','👎','❤️','😂','😮','😢','🙏','🔥','✅','⚡','💡','📌'];
const QUICK_TAGS  = ['Thank You','Noted','Copied','Yes Sir','Yes Madam'];

// Quick-reply tags — read the admin-configured list (same localStorage key the
// web app + admin panel use), so tags created in the Admin panel show here too.
// Falls back to the built-in defaults.
function _quickTagList() {
    try {
        const raw = localStorage.getItem('quickTags_' + (_tid || window.currentTenantId || 'default'));
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr) && arr.length)
                return arr.map(t => ({ v: t.v, c: t.c || TAG_COLORS[t.v] || '#2563eb' }));
        }
    } catch(e) {}
    return QUICK_TAGS.map(v => ({ v, c: TAG_COLORS[v] || '#2563eb' }));
}

function _showReactionEmojiPicker(msgId) {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Add Reaction</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;justify-content:center;">
        ${EMOJI_LIST.map(e=>`<button class="m-emoji-btn" data-action="reactEmoji" data-id="${msgId}" data-value="${e}">${e}</button>`).join('')}
      </div>`;
    _openSheet();
}
function _showReactionTagPicker(msgId) {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Quick Reply Tag</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;">
        ${_quickTagList().map(t=>`<button class="m-tag-btn" style="border-color:${t.c};color:${t.c};" data-action="reactTag" data-id="${msgId}" data-value="${x(t.v)}">${x(t.v)}</button>`).join('')}
      </div>`;
    _openSheet();
}
function _showInsertEmojiPicker(targetId) {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Insert Emoji</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;justify-content:center;">
        ${EMOJI_LIST.map(e=>`<button class="m-emoji-btn" data-action="insertEmoji" data-target="${targetId}" data-value="${e}">${e}</button>`).join('')}
      </div>`;
    _openSheet();
}
function _showInsertTagPicker(targetId) {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Insert Quick Tag</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;">
        ${_quickTagList().map(t=>`<button class="m-tag-btn" style="border-color:${t.c};color:${t.c};" data-action="insertTag" data-target="${targetId}" data-value="${x(t.v)}">${x(t.v)}</button>`).join('')}
      </div>`;
    _openSheet();
}
function _showScheduleSheet(targetId) {
    const text = _ceHTML(targetId);
    if (!text) { _toast('Type a message first','err'); return; }
    const top = _stack[_stack.length-1];
    const room = top?.params?.room;
    if (!room) { _toast('Could not determine which chat this is for','err'); return; }
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Schedule Message</div>
      <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:13px;color:var(--text-secondary);">${_snip(text,80)}</div>
        <input class="m-inp" id="schAt" type="datetime-local">
        <button class="m-action-btn" style="background:#6366f1;" data-action="confirmSchedule" data-target="${targetId}" data-room="${room}">
          <i class="fa-solid fa-clock"></i> Schedule
        </button>
      </div>`;
    _openSheet();
}
async function _confirmSchedule(targetId, room) {
    const at = _el('schAt')?.value;
    if (!at) { _toast('Pick a date and time','err'); return; }
    const message_text = _ceHTML(targetId);
    if (!message_text) { _toast('Message is empty','err'); return; }
    const { error } = await sb.from('scheduled_messages').insert({
        sender_id:_uid, room_id:room, tenant_id:_tid,
        message_text, scheduled_time:new Date(at).toISOString(), status:'pending'
    });
    if (error) { _toast('Could not schedule: '+error.message,'err'); return; }
    _ceClear(targetId);
    window._closeSheet();
    _toast('Message scheduled ✓ 🕐');
}
function _showReminderSheet(mid, text) {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Set Reminder</div>
      <div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;">
        <div style="font-size:13px;color:var(--text-secondary);">${_snip(text,80)}</div>
        <input class="m-inp" id="remAt" type="datetime-local">
        <button class="m-action-btn" style="background:#f59e0b;" data-action="confirmReminder" data-id="${mid}">
          <i class="fa-solid fa-bell"></i> Set Reminder
        </button>
      </div>`;
    _openSheet();
}
async function _confirmReminder(mid) {
    const at = _el('remAt')?.value;
    if (!at) { _toast('Pick a date and time','err'); return; }
    const { error } = await sb.from('reminders').insert({
        user_id:_uid, message_id:mid, tenant_id:_tid,
        reminder_time:new Date(at).toISOString(), triggered:false
    });
    if (error) { _toast('Could not set reminder: '+error.message,'err'); return; }
    window._closeSheet();
    _toast('Reminder set ✓ ⏰');
}
function _showForwardSheet(text, opts={}) {
    const title  = opts.title  || 'Forward to…';
    const action = opts.action || 'doForward';
    const sheet = _el('mSheetInner');
    const others = _users.filter(u=>u.id!==_uid).slice().sort((a,b)=>(a.full_name||a.email||'').localeCompare(b.full_name||b.email||''));
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">${x(title)}</div>
      <div style="max-height:50vh;overflow-y:auto;padding:0 8px 16px;">
        ${_customGroups.map(d=>`
          <div class="m-sheet-row" data-action="${action}" data-room="${d.id}" data-text="${x(text)}">
            <span class="m-av sq" style="width:30px;height:30px;font-size:13px;background:${d.col};">${(d.name||'?')[0]}</span> ${x(d.name)}
          </div>`).join('')}
        ${others.map(u=>`
          <div class="m-sheet-row" data-action="${action}" data-room="${_dmRoom(u.id)}" data-text="${x(text)}">
            <span class="m-av" style="width:30px;height:30px;font-size:12px;background:var(--accent);">${_init(u.full_name||u.email)}</span> ${x(u.full_name||u.email)}
          </div>`).join('')}
      </div>`;
    _openSheet();
}
window._openThemeSheet = function() {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Choose Theme</div>
      <div class="m-theme-grid" style="padding:4px 12px 20px;">
        ${(window.THEME_LIST||[]).map(t=>`
          <button class="m-theme-pill ${window.currentTheme===t.id?'active':''}" data-action="pickTheme" data-theme="${t.id}">
            <span class="m-theme-dot" style="background:${t.swatch};"></span>${t.label}
          </button>`).join('') || '<div class="m-empty">Theme system not loaded</div>'}
      </div>`;
    _openSheet();
};

function _showConvertTask(msgId, text) {
    const sheet = _el('mSheetInner');
    const others = _users.filter(u=>u.id!==_uid).slice().sort((a,b)=>(a.full_name||a.email||'').localeCompare(b.full_name||b.email||''));
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Convert to Task</div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:12px;">
        <input class="m-inp" id="ctTitle" value="${x(text?.substring(0,60)||'')}" placeholder="Task title">
        <input class="m-inp" id="ctDeadline" type="date">
        <select class="m-sel" id="ctPriority">
          <option value="normal">Normal Priority</option>
          <option value="high">⚡ High Priority</option>
          <option value="low">Low Priority</option>
        </select>
        <label class="m-label" style="margin-top:4px;">Assign to</label>
        <div style="max-height:140px;overflow-y:auto;border:1px solid var(--border-color);border-radius:10px;padding:6px;">
          ${others.map(u=>`
            <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:14px;">
              <input type="checkbox" class="ctAssignee" value="${u.id}"> ${x(u.full_name||u.email)}
            </label>`).join('')}
        </div>
        <button class="m-action-btn" style="background:#16a34a;" data-action="ctSaveTask" data-msgid="${msgId}">
          <i class="fa-solid fa-list-check"></i> Create Task
        </button>
      </div>`;
    _openSheet();
}
async function _saveConvertedTask(msgId) {
    const title    = _el('ctTitle')?.value?.trim(); if (!title) { _toast('Title required','err'); return; }
    const deadline = _el('ctDeadline')?.value || null;
    const priority = _el('ctPriority')?.value || 'normal';
    const aids = Array.from(document.querySelectorAll('.ctAssignee:checked')).map(cb=>cb.value);
    if (!aids.length) { _toast('Pick at least one assignee','err'); return; }

    const { data: task, error } = await sb.from('tasks').insert({
        title, deadline, priority, status:'pending', created_at:new Date().toISOString(),
        original_message_id: msgId, assigned_by: _uid, tenant_id: _tid
    }).select().single();
    if (error || !task) { _toast('Failed to create task','err'); return; }

    await sb.from('task_assignees').insert(aids.map(aid => ({
        task_id: task.id, assignee_id: aid, tenant_id: _tid, status:'pending_ack', state:'pending'
    })));
    await sb.from('task_trails').insert({ task_id: task.id, user_id:_uid, tenant_id:_tid, action:'UPDATE', comment:'Task Created' });
    if (window.notifyUser) for (const aid of aids) await window.notifyUser(aid, `📋 New Task Assigned: ${title}`, msgId, 'task', task.id);
    _closeSheet();
    _toast('✅ Task created!');
}

async function _onShellClick(e) {
    const ca = e.target.closest('[data-caction]');
    if (ca) { await _handleComposerIcon(ca.dataset.caction, ca.dataset.target); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset;
    switch (a.action) {
        case 'groupChat': await _navTo('groupChat',{room:a.room,name:a.name,color:a.color,scrollTo:a.scroll||undefined}); break;
        case 'dm':        await _navTo('dm',{uid:a.uid,name:a.name,room:a.room,scrollTo:a.scroll||undefined}); break;
        case 'thread':    await _navTo('thread',{id:a.id,text:a.text,sender:a.sender,time:a.time,room:a.room,rname:a.rname,rcol:a.rcol}); break;
        case 'taskDetail':await _navTo('taskDetail',{id:a.id,title:a.title}); break;
        case 'editReminder': await _navTo('remindEdit',{id:a.id,text:a.text,at:a.at}); break;
        case 'gotoBookmark':
            if (a.isdm === '1') await _navTo('dm',{uid:a.uid,name:a.rname,room:a.room,scrollTo:a.scroll});
            else await _navTo('groupChat',{room:a.room,name:a.rname,color:a.rcol,scrollTo:a.scroll});
            break;

        case 'toggleReaction': await _toggleReaction(a.id, a.value, a.type, a.mine === '1'); break;

        case 'sendGroup': await _doSendGroup(a); break;
        case 'sendReply': await _doSendReply(a); break;
        case 'sendDM':    await _doSendDM(a); break;

        case 'taskDelegateSheet': _showTaskReassignSheet(a.task, 'delegate'); break;
        case 'taskTransferSheet': _showTaskReassignSheet(a.task, 'transfer'); break;
        case 'mobTaskAction':
            if (a.act === 'upload') { _pendingUploadTaskId = a.task; _el('mFileInput')?.click(); }
            else await _mobTaskAction(a.task, a.act);
            break;

        case 'deleteReminder': await _deleteReminder(a.id); break;
        case 'saveReminder':   await _saveReminder(a.id); break;
        case 'removeBookmark': _removeBookmark(parseInt(a.idx)); break;
        case 'cancelScheduled': await _cancelScheduled(a.id); break;
        case 'editScheduled': await _navTo('scheduledEdit',{id:a.id,text:a.text,at:a.at,room:a.room}); break;
        case 'saveScheduled': await _saveScheduled(a.id); break;
        case 'openTaskFile': await _openTaskFile(a.path); break;
        case 'openNotifs': await _navTo('notifications', { mode:'attention' }); break;   // bell → attention list
        case 'openActivity': await _navTo('activity'); break;                             // bottom tab → timeline
        case 'goToMsgNotif':
            if (a.nid) { try { await sb.from('notifications').update({ is_read:true }).eq('id',a.nid).eq('user_id',_uid); } catch(e){} refreshNotificationUI(); }
            await _goToMessage(a.mid); break;
        case 'goToTaskNotif':
            if (a.nid) { try { await sb.from('notifications').update({ is_read:true }).eq('id',a.nid).eq('user_id',_uid); } catch(e){} refreshNotificationUI(); }
            await _goToTask(a.tid); break;
        case 'afFilter': window._afFilter = a.f; window._afSender = ''; await window._mobRerenderActivity(); break;
        case 'afSender': window._afSender = a.s || ''; await window._mobRerenderActivity(); break;
        case 'afClear': {
            if (String(a.nid).startsWith('lrn_')) _removeLRNById(a.nid);   // v199: local reaction card
            else { try { await sb.from('notifications').delete().eq('id',a.nid).eq('user_id',_uid); } catch(e){} }
            await refreshNotificationUI();
            await window._mobRerenderActivity();
            break;
        }
        case 'afClearAll': {
            try { _saveLRN([]); } catch(e){}   // v199: clear local reaction notifications too
            try { await sb.from('notifications').delete().eq('user_id',_uid).eq('tenant_id',_tid); } catch(e){}
            _clearBellBadge();
            await refreshNotificationUI();
            await window._mobRerenderActivity();
            break;
        }
        case 'markAllRead': {
            try {
                // user_id only (Phase 4.1) — consistent with the feed/badge reads.
                await sb.from('notifications').update({ is_read:true })
                    .eq('user_id',_uid).eq('is_read',false);
            } catch(e){}
            _clearBellBadge();
            await refreshNotificationUI();
            await window._mobRerenderActivity();
            break;
        }
        case 'goToTaskNotif': await _goToTask(a.tid); break;
        case 'navGroupMgmt':   _navTo('groupMgmt'); break;
        case 'saveProfile':    await _saveProfile(); break;
        case 'setMyPhoto':   _el('mMyPhotoInput')?.click(); break;
        case 'setDeptPhoto': {
            // Never allow a DM (setting another person's photo) or a non-admin.
            if (String(a.dept||'').startsWith('dm_')) { _toast('Not available for direct messages','err'); break; }
            if (!((window.canSeeGroupGear?.() ?? false) || _isDeptAdmin(a.dept))) { _toast('Only a group admin can change the photo','err'); break; }
            _pendingDeptPhoto = a.dept; _el('mDeptPhotoInput')?.click(); break;
        }
        case 'changePassword': await _changePassword(); break;
        case 'downloadTaskPdf':
            if (typeof window.downloadTaskPDF === 'function') await window.downloadTaskPDF(a.id);
            else _toast('PDF export not available','err');
            break;
        case 'openFile': {
            const u = decodeURIComponent(a.url||'');
            const match = u.match(/\/storage\/v1\/object\/(?:public\/)?(?:sign\/)?task-proofs\/(.+?)(?:\?.*)?$/);
            if (match) {
                await _openTaskFile(decodeURIComponent(match[1]));
            } else if (u.startsWith('http')) {
                window.open(u, '_blank', 'noopener');
            }
            break;
        }
        case 'confirmLogout': await window._confirmLogout(); break;
        case 'enablePush': {
            _toast('Enabling…');
            const ok = await window.subscribeToPush?.({ prompt: true });
            _toast(ok ? '🔔 Notifications enabled on this device' : 'Could not enable — allow notifications in browser settings', ok ? 'ok' : 'err');
            if (ok) { const top = _stack[_stack.length-1]; if (top?.screen === 'settings') await _render('settings', null, 'forward'); }
            break;
        }
        case 'toggleSoundIn': {
            const off = !(window._isSoundInOff?.());
            try { localStorage.setItem('mpgs_mute_incoming', off ? '1' : '0'); } catch(e){}
            _toast(off ? '🔇 Incoming sound off' : '🔔 Incoming sound on');
            { const top = _stack[_stack.length-1]; if (top?.screen === 'settings') await _render('settings', null, 'none'); }
            break;
        }
        case 'toggleSoundOut': {
            const off = !(window._isSoundOutOff?.());
            try { localStorage.setItem('mpgs_mute_outgoing', off ? '1' : '0'); } catch(e){}
            _toast(off ? '🔇 Send sound off' : '🔔 Send sound on');
            { const top = _stack[_stack.length-1]; if (top?.screen === 'settings') await _render('settings', null, 'none'); }
            break;
        }
        case 'testSound': {
            if (window._isSoundInOff?.()) { _toast('Incoming sound is off — turn it on first','err'); break; }
            if (window._isDND?.()) { _toast('Do Not Disturb is on','err'); break; }
            window._unlockSharedAudio?.();
            window.playSound?.('message');
            _toast('🔊 Test sound played');
            break;
        }
        case 'toggleDND': {
            const on = !(window._isDND?.());
            await window._setDND?.(on);
            _toast(on ? '🔕 Do Not Disturb ON — no sound, vibration or notifications' : '🔔 Do Not Disturb OFF');
            const b = _el('mSBDnd');
            if (b) { b.style.color = on ? '#ef4444' : ''; const ic = b.querySelector('i'); if (ic) ic.className = 'fa-solid ' + (on ? 'fa-volume-xmark' : 'fa-volume-high'); }
            break;
        }
        case 'pickTheme':
            if (typeof window.setTheme === 'function') window.setTheme(a.theme);
            window._closeSheet();
            { const top = _stack[_stack.length-1]; if (top) await _render(top.screen, top.params, 'forward'); }
            break;
    }
}

async function _handleComposerIcon(caction, targetId) {
    const ceEl = _el(targetId);
    switch (caction) {
        case 'schedule': _showScheduleSheet(targetId); break;
        case 'emoji': _showInsertEmojiPicker(targetId); break;
        case 'tag':   _showInsertTagPicker(targetId); break;
        case 'link': {
            const url = prompt('Paste a link:'); if (!url) return;
            const name = prompt('Link text (optional):', url) || url;
            ceEl?.focus();
            const encoded = encodeURIComponent(name + '|||' + url);
            document.execCommand('insertHTML', false, `<a href="https://link-pill.local/${encoded}">${x(name)}</a>&nbsp;`);
            break;
        }
        case 'attach': {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*,application/pdf';
            input.onchange = async () => {
                const file = input.files[0]; if (!file) return;
                _toast('Uploading…');
                const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_');
                const filePath = `chat/${_tid}/${Date.now()}_${safeName}`;
                const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
                if (error) { _toast('Upload failed: '+error.message,'err'); return; }
                ceEl?.focus();
                // Private bucket → store the PATH and open via signed URL (same format as web).
                document.execCommand('insertHTML', false, `<a href="https://secure-file.local/${filePath}">📎 ${x(file.name)}</a>&nbsp;`);
                _toast('Attached ✓');
            };
            input.click();
            break;
        }
    }
}

async function _onSheetClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset;
    switch (a.action) {
        case 'navMore': window._closeSheet(); await _navTo(a.screen); break;
        case 'doTaskReassign': await _doTaskReassign(a.task, a.mode); break;
        case 'toggleMute': {
            const wasMuted = _lsGet('muted_'+a.room) === '1';
            _lsSet('muted_'+a.room, wasMuted ? '0' : '1');
            window._closeSheet();
            _toast(wasMuted ? 'Notifications unmuted' : '🔕 Notifications muted');
            break;
        }
        case 'viewMembersSheet': {
            const mems = (() => { try { return JSON.parse(_lsGet('dept_members_'+a.room)||'[]'); } catch { return []; } })();
            const sheet = _el('mSheetInner');
            sheet.innerHTML = `<div class="m-sheet-handle"></div><div class="m-sheet-title">Members</div>
              <div style="padding:0 8px 20px;">${mems.map(uid => {
                const u = _users.find(u=>u.id===uid);
                if (!u) return '';
                const nm = u.full_name||u.email?.split('@')[0]||'User';
                return `<div class="m-sheet-row">${_avatarHTML(u.avatar_url,nm,'var(--accent)','m-av-tiny')} <span style="flex:1;">${x(nm)}</span>${_roleChip(uid)}</div>`;
              }).join('') || '<div class="m-empty">No members yet.</div>'}</div>`;
            _openSheet();
            break;
        }
        case 'addEmoji':    _showReactionEmojiPicker(a.id); break;
        case 'addTag':      _showReactionTagPicker(a.id); break;
        case 'reactEmoji':  await _toggleReaction(a.id, a.value, 'emoji'); window._closeSheet(); break;
        case 'reactTag':    await _toggleReaction(a.id, a.value, 'tag');   window._closeSheet(); break;
        case 'insertEmoji': case 'insertTag': {
            window._closeSheet();
            _ceInsertText(a.target, a.value);
            break;
        }
        case 'replyThread': window._closeSheet(); await _navTo('thread',{id:a.id,text:a.text,room:a.room,rname:a.rname,rcol:a.rcol,sender:'',time:''}); break;
        case 'convertTask': window._closeSheet(); _showConvertTask(a.id, a.text); break;
        case 'setReminder': _showReminderSheet(a.id, a.text); break;
        case 'confirmReminder': await _confirmReminder(a.id); break;
        case 'forwardMsg':  _showForwardSheet(a.text); break;
        case 'doForward':   await _doForward(a.room, a.text); break;
        case 'doShareFull': await _doShareFull(a.room); break;
        case 'confirmSchedule': await _confirmSchedule(a.target, a.room); break;
        case 'bookmarkMsg': {
            const bms = JSON.parse(_lsGet('tf_bookmarks_'+_uid)||'[]');
            bms.unshift({msgId:a.id,text:a.text,room:a.room,rname:a.rname,rcol:a.rcol,uid:a.room?.startsWith('dm_')?a.room.replace('dm_','').split('_').find(p=>p!==_uid):'',time:_ago(new Date().toISOString())});
            _lsSet('tf_bookmarks_'+_uid, JSON.stringify(bms.slice(0,50)));
            window._closeSheet(); _toast('🔖 Bookmarked!'); break;
        }
        case 'editMsg': {
            window._closeSheet();
            const newText = prompt('Edit message:', a.text);
            if (newText === null || !newText.trim()) break;
            await sb.from('messages').update({ text:`<p>${x(newText.trim())}</p>` }).eq('id',a.id).eq('tenant_id',_tid).eq('sender_id',_uid);
            _toast('Message updated ✓');
            { const top = _stack[_stack.length-1]; if (top) await _render(top.screen, top.params, 'forward'); }
            break;
        }
        case 'deleteMsg':
            window._closeSheet();
            await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',a.id).eq('tenant_id',_tid).eq('sender_id',_uid);
            _toast('Message deleted'); _back(); break;
        case 'ctSaveTask': await _saveConvertedTask(a.msgid); break;
        case 'pickTheme':
            if (typeof window.setTheme === 'function') window.setTheme(a.theme);
            window._closeSheet();
            { const top = _stack[_stack.length-1]; if (top) await _render(top.screen, top.params, 'forward'); }
            break;
    }
}

let _pressTimer = null, _pressRow = null, _pressX = 0, _pressY = 0;
function _onPressStart(e) {
    const card = e.target.closest('.m-bubble');
    if (!card) return;
    const row = card.closest('.m-bubble-row');
    if (!row) return;
    _pressRow = row;
    _pressX = e.clientX; _pressY = e.clientY;
    _pressTimer = setTimeout(() => {
        _pressTimer = null;
        window.logger?.logAction('longpress-fire', { theme: document.documentElement.getAttribute('data-theme') || 'light' });
        const id = row.id.replace('row-','');
        const me = row.classList.contains('snt');
        const text = row.querySelector('.m-btext')?.textContent || '';
        const time = row.dataset.time || '';
        const top = _stack[_stack.length-1];
        const params = top?.params || {};
        window._showMsgActions({ id, text, me, time, room: params.room||'', rname: params.name||'', rcol: params.color||'' });
        navigator.vibrate?.(35);
    }, 550);
}
function _onPressMove(e) {
    if (!_pressTimer) return;
    // 14px tolerance — a resting fingertip drifts a few px; 6px killed most presses.
    if (Math.abs(e.clientX-_pressX) > 14 || Math.abs(e.clientY-_pressY) > 14) {
        clearTimeout(_pressTimer); _pressTimer = null;
    }
}
function _onPressEnd() { clearTimeout(_pressTimer); _pressTimer = null; _pressRow = null; }

function _onSelectionChange() {
    const popup = _el('mFmtPopup');
    if (!popup) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { popup.style.display='none'; return; }
    const anchor = sel.anchorNode;
    const node = anchor && (anchor.nodeType===1 ? anchor : anchor.parentElement);
    const ceEl = node?.closest?.('.m-ce');
    if (!ceEl) { popup.style.display='none'; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width===0 && rect.height===0)) { popup.style.display='none'; return; }
    popup.style.display = 'flex';
    popup.style.top  = Math.max(8, rect.top - 46) + 'px';
    popup.style.left = Math.min(Math.max(8, rect.left), window.innerWidth-150) + 'px';
}

// Exponential backoff so a flaky signal doesn't produce a tight 5s reconnect loop
// (which fights Supabase's own transport recovery and churns the connection).
// Grows 3s → 6s → 12s → cap 15s, with ±30% jitter; reset to base on a successful
// SUBSCRIBED. Capped LOW (was 60s) because the log showed the socket flapping for
// minutes with the reconnect pushed out to 30-60s — far too long a miss window for
// live messages/reactions/replies. A 15s ceiling recovers ~4× faster; the adaptive
// fallback poll (20s when the socket is dead) catches anything missed in between.
let _rtBackoff = 3000;
const _RT_BACKOFF_MAX = 15000;
// UX (Phase 5.2): don't toast on brief flaps. Arm a timer on the first drop and
// only show "Reconnecting…" if the outage lasts >8s. "Connected ✓" then shows
// only if that warning was actually displayed — so a flapping signal that
// recovers within 8s stays completely silent (no toast flicker).
let _rtOutageTimer = null;
let _rtToastShown = false;
function _scheduleRtReconnect() {
    if (_rtReconnectTimer) return;
    _rtWasErrored = true;
    const jitter = _rtBackoff * (0.7 + Math.random() * 0.6);   // ±30%
    const delay = Math.round(jitter);
    // Arm the "sustained outage" toast once per outage (first drop = base backoff).
    if (_rtBackoff === 3000 && !_rtOutageTimer && !_rtToastShown) {
        _rtOutageTimer = setTimeout(() => {
            _rtOutageTimer = null;
            const healthy = _rtChannel && _rtChannel.state === 'joined';
            if (!healthy) { _rtToastShown = true; _toast('Reconnecting…', 'info'); }
        }, 8000);
    }
    console.log('[mob-rt] scheduling reconnect in ' + delay + 'ms (backoff ' + _rtBackoff + ')');
    _rtBackoff = Math.min(_rtBackoff * 2, _RT_BACKOFF_MAX);     // grow for next time
    _rtReconnectTimer = setTimeout(async () => {
        _rtReconnectTimer = null;
        // If the SDK's own recovery already brought the primary channel back while we
        // waited, skip the disruptive teardown entirely.
        if (_rtChannel && _rtChannel.state === 'joined') {
            console.log('[mob-rt] channel healthy on wake — skipping reconnect');
            return;
        }
        console.log('[mob-rt] reconnecting…');
        await _refreshRtAuth();   // freshen token so the rebuilt socket authenticates cleanly
        _rtIntentionalClose = true;
        if (_rtChannel) { try { await sb.removeChannel(_rtChannel); } catch {} _rtChannel = null; }
        if (_bridgeChannel) { try { await sb.removeChannel(_bridgeChannel); } catch {} _bridgeChannel = null; }
        _rtIntentionalClose = false;
        _initRealtime();
    }, delay);
}
function _initRealtime() {
  try {
    if (!_tid) { console.error('[mob-rt] Cannot init realtime without tenant_id'); return; }
    if (_rtChannel || _bridgeChannel) return;
    // Make sure the socket carries a fresh session token BEFORE we (re)subscribe, so
    // postgres_changes RLS keeps delivering after the 1h JWT would otherwise expire.
    _refreshRtAuth();
    // Broadcast handlers — declared before subscribe so the single channel can wire
    // both postgres_changes and broadcast in one .on() chain.
    const _hReaction = p => {
        // Diagnostic: log EVERY reaction broadcast received (before the guards) so a
        // log dump shows whether group members actually receive reaction events.
        const rowHere = p.payload?.message_id ? !!document.getElementById('row-'+p.payload.message_id) : false;
        window.logger?.logReact('recv', { msg: p.payload?.message_id, val: p.payload?.value,
            from: p.payload?.user_id, del: !!p.payload?.isDelete, rowOnScreen: rowHere });
        if (p.payload && p.payload.tenant_id && p.payload.tenant_id !== _tid) return;
        if (p.payload && p.payload.user_id === _uid) return;  // ignore own echo (shared channel)
        _onReactionChange(p.payload, p.payload?.isDelete ? 'DELETE' : 'INSERT');
    };
    const _hGroupPhoto = p => {
        // Bust the local photo cache so _syncRoomSettings re-fetches the new photo.
        if (p.payload?.room_id) {
            try {
                localStorage.removeItem(_lsKey('dept_photo_'+p.payload.room_id));
                localStorage.removeItem(_lsKey('dept_photo_ts_'+p.payload.room_id));
                localStorage.removeItem(_lsKey('dept_photo_none_'+p.payload.room_id));
            } catch(e){}
        }
        if (p.payload?.room_id && p.payload?.name) {
            _lsSet('dept_name_'+p.payload.room_id, p.payload.name);
            // Persist to DB so cold-start mobile users also get the correct name
            if (_tid) {
                const upsertData = { room_id:p.payload.room_id, tenant_id:_tid, name:p.payload.name, updated_at:new Date().toISOString() };
                if (p.payload.color) upsertData.color = p.payload.color;
                sb.from('room_settings').upsert(upsertData, { onConflict:'room_id,tenant_id' }).then(() => {});
            }
        }
        if (p.payload?.room_id && p.payload?.color) _lsSet('dept_color_'+p.payload.room_id, p.payload.color);
        // Rebuild custom groups from DB so a group created on another device appears live
        _syncRoomSettings().then(() => {
            const top = _stack[_stack.length-1];
            if (top?.screen === 'home') _render('home', null, 'none');   // silent, no slide
            if (top?.screen === 'groupChat' && top.params?.room === p.payload?.room_id) {
                const g = _findGroup(p.payload.room_id);
                _render('groupChat', { ...(top.params || {}), name:g?.name || top.params?.name, color:g?.col || top.params?.color }, 'none');
            }
        });
    };
    const _hTyping = p => {
        if (!p.payload || p.payload.uid === _uid) return;
        const r = p.payload.room;
        if (!_typingUsers[r]) _typingUsers[r] = {};
        _typingUsers[r][p.payload.uid] = { name: p.payload.name, ts: Date.now() };
        clearTimeout(_typingTimers[p.payload.uid]);
        _typingTimers[p.payload.uid] = setTimeout(() => {
            if (_typingUsers[r]) delete _typingUsers[r][p.payload.uid];
            _updateTypingUI(r);
        }, 3000);
        _updateTypingUI(r);
    };
    // Group-message broadcast bridge — belt-and-suspenders alongside postgres_changes
    // (de-duped by _seenMsgIds), so live delivery survives a flaky postgres channel.
    // DMs are NEVER broadcast (tenant-wide channel would leak them past RLS).
    const _hNewMessage = p => {
        const m = p.payload;
        if (!m || !m.id || m.room_id?.startsWith('dm_')) return;
        _onNewMessage(m);
    };
    const _hRoomRead = p => {
        if (!p.payload || p.payload.uid === _uid) return;
        _lsSet('last_read_other_'+p.payload.room, p.payload.ts);
        // Upgrade tick marks to blue (read) for visible sent messages in this room
        const top = _stack[_stack.length-1];
        if (top?.params?.room === p.payload.room) {
            document.querySelectorAll('.m-tick.sent').forEach(el => { el.className = 'm-tick read'; el.textContent = 'Seen'; });
        }
    };
    // Cross-platform broadcast bridge. This is the topic web/PWA listens to, so
    // group photos and DM profile photos move between platforms immediately.
    _bridgeChannel = sb.channel('taskflow-bc-'+_tid, { config: { broadcast: { self: false } } })
        .on('broadcast', { event:'new_message' }, _hNewMessage)
        .on('broadcast', { event:'reaction' }, _hReaction)
        .on('broadcast', { event:'group_photo' }, _hGroupPhoto)
        .on('broadcast', { event:'profile_update' }, _hProfileUpdate)
        .on('broadcast', { event:'typing' }, _hTyping)
        .on('broadcast', { event:'room_read' }, _hRoomRead)
        .subscribe(status => {
            console.log('[mob-bc] channel status='+status);
            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') && !_rtIntentionalClose) _scheduleRtReconnect();
        });

    // Primary mobile DB realtime channel. Keep postgres_changes off taskflow-bc so
    // web's shared broadcast channel cannot block mobile from registering DB events.
    _rtChannel = sb.channel('mobile-rt-'+_tid, { config: { broadcast: { self: false } } })
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`tenant_id=eq.${_tid}` }, p => {
            console.log('[RAW MESSAGE]', p.new?.room_id, p.new?.sender_id, p.new?.id);
            console.log('[MESSAGE]', { room: p.new?.room_id, sender: p.new?.sender_id, message: p.new?.id });
            if (p.new?.room_id) _seenRooms.add(p.new.room_id);   // ensure reconcile computes unread even for rooms not in DEPTS/_customGroups
            _onNewMessage(p.new);
        })
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'reactions', filter:`tenant_id=eq.${_tid}` }, p => _onReactionChange(p.new, 'INSERT'))
        .on('postgres_changes', { event:'DELETE', schema:'public', table:'reactions' }, p => _onReactionChange(p.old, 'DELETE'))
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'task_assignees', filter:`tenant_id=eq.${_tid}` }, p => _onTaskAssigneeUpdate(p.new))
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${_uid}` }, p => _onNotifInsert(p.new))
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles', filter:`tenant_id=eq.${_tid}` }, p => _onPresenceUpdate(p.new))
        .subscribe(status => {
            console.log('[mob-rt] channel status='+status); window.logger?.logRt('mobile-rt', status);
            try { _setConnState(); } catch(e){}   // reflect socket health in the top-bar Online/Offline chip
            if (status === 'SUBSCRIBED') {
                if (_rtReconnectTimer) { clearTimeout(_rtReconnectTimer); _rtReconnectTimer = null; }
                if (_rtOutageTimer) { clearTimeout(_rtOutageTimer); _rtOutageTimer = null; }  // recovered before the 8s warning fired
                _rtBackoff = 3000;   // healthy again — reset backoff to base
                if (_rtWasErrored) {
                    _rtWasErrored = false;
                    if (_rtToastShown) { _rtToastShown = false; _toast('Connected ✓'); }  // only if we warned
                    // CATCH-UP: broadcasts (reactions/replies) sent while disconnected are
                    // NOT replayed, so pull the DB truth for the open chat, presence,
                    // badges and per-chat unread. This is the automatic gap-fill that
                    // makes a socket drop invisible (WhatsApp/Slack model). Anti-flash
                    // keeps it silent when nothing actually changed.
                    try { _pendingRefresh?.(); } catch (e) {}
                    _refreshPresence();
                    refreshNotificationUI();   // reconcile → bell, in the synchronized order
                }
            }
            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') && !_rtIntentionalClose) _scheduleRtReconnect();
        });
    refreshNotificationUI();   // initial DB-derived per-chat unread + bell (synchronized order)
    // Realtime badge update already wired via postgres_changes INSERT on notifications — no polling needed
    _initPresence();
  } catch (e) {
    // Never let a realtime setup error crash app boot (v159 lesson). Log, drop any
    // half-built channel, and let the reconnect backoff retry — the poll keeps the
    // app functional meanwhile.
    console.error('[mob-rt] init failed:', e);
    try { if (_rtChannel) sb.removeChannel(_rtChannel); } catch (e2) {}
    try { if (_bridgeChannel) sb.removeChannel(_bridgeChannel); } catch (e3) {}
    _rtChannel = null;
    _bridgeChannel = null;
    if (!_rtIntentionalClose) _scheduleRtReconnect();
  }
}
// Poll everyone's last_seen (lightweight) and re-render presence dots. Realtime
// profile UPDATEs keep dots live when the channel is up, but on this school's
// flaky WiFi the channel drops often and those updates are missed — so other
// users' green dots vanished after 3 min and never came back. This re-fetch (on
// the 60s heartbeat + on realtime recovery) keeps them accurate regardless.
// Instant online/offline via a Supabase Presence channel. Joining the channel
// marks me online for everyone; the socket closing (app closed/killed/offline)
// makes the server emit a 'leave' so others see me go maroon in real time —
// something the 60s last_seen poll can't do. self-tracked with my uid.
function _hProfileUpdate(p) {
    const row = p?.payload || p;
    if (!row || row.src === 'm') return;
    _onPresenceUpdate(row);
}

function _initPresence() {
    if (!_tid || !_uid) return;
    try { if (_presenceChannel) { sb.removeChannel(_presenceChannel); _presenceChannel = null; } } catch (e) {}
    const applySync = () => {
        try {
            const st = _presenceChannel.presenceState();
            _onlineSet.clear();
            Object.keys(st).forEach(k => (st[k] || []).forEach(m => { if (m.uid) _onlineSet.add(m.uid); }));
            _repaintAllDots();
        } catch (e) {}
    };
    _presenceChannel = sb.channel('presence-' + _tid, { config: { presence: { key: _uid } } })
        .on('presence', { event: 'sync' }, applySync)
        .on('presence', { event: 'join' },  ({ newPresences }) => { (newPresences || []).forEach(p => p.uid && _onlineSet.add(p.uid)); _repaintAllDots(); })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => { (leftPresences || []).forEach(p => p.uid && _onlineSet.delete(p.uid)); _repaintAllDots(); })
        .subscribe(async status => {
            if (status === 'SUBSCRIBED') { try { await _presenceChannel.track({ uid: _uid, at: Date.now() }); } catch (e) {} }
        });
}
async function _refreshPresence() {
    if (!_tid || document.visibilityState !== 'visible') return;
    try {
        const { data } = await sb.from('profiles').select('id,last_seen').eq('tenant_id', _tid);
        if (!data) return;
        data.forEach(r => { if (r.id !== _uid) _onPresenceUpdate(r); });
    } catch (e) { /* offline — dots age out on their own */ }
}
// Live presence: update the cached user + patch the dot on any visible row.
function _onPresenceUpdate(row) {
    if (!row?.id) return;
    const u = _users.find(x => x.id === row.id);
    if (u && row.last_seen) u.last_seen = row.last_seen;
    // Propagate a display-name / designation change live so bubbles + lists match
    // the person's current profile without a reload.
    if (u && (('full_name' in row) || ('designation' in row))) {
        if (row.full_name && u.full_name !== row.full_name) u.full_name = row.full_name;
        if (row.designation !== undefined) u.designation = row.designation;
        try { _saveUsersCache(_tid, _users); } catch (e) {}
    }
    // Universal avatar sync: a profile photo changed on another device → update the
    // one cache and repaint every avatar for this user (lists, bubbles, headers,
    // activity, reply previews). Only fires when the URL actually changed, so the
    // 60s presence heartbeats don't trigger re-renders.
    if ('avatar_url' in row) _onAvatarChanged(row.id, row.avatar_url || '');
    document.querySelectorAll('[data-uid="' + row.id + '"]').forEach(el => {
        const holder = el.querySelector('div[style*="position:relative"]');
        if (!holder) return;
        holder.querySelector('.m-presence-dot')?.remove();
        const html = _onlineDot(row.id);
        if (html) holder.insertAdjacentHTML('beforeend', html);
    });
}
function _sumUnread() {
    return Object.values(window.unreadCounts || {}).reduce((a, b) => a + (b || 0), 0);
}
// ===== v199 PATCH BEGIN (client-side reaction notifications — no DB/RLS dependency) =====
// Reactions never surfaced in the bell/Activity feed because the notifications-table
// INSERT is rejected on this deployment (bell "notif" was 0 for weeks across every
// type). Rather than depend on DB/RLS, store a reaction-to-MY-message notification
// LOCALLY the moment the reaction event arrives, and surface it in the bell + feed.
// Purely additive; the DB self-insert path is still attempted and harmless if it works.
function _lrnKey() { return (_tid || '') + '_local_react_notifs'; }
function _loadLRN() { try { return JSON.parse(localStorage.getItem(_lrnKey()) || '[]'); } catch (e) { return []; } }
function _saveLRN(a) { try { localStorage.setItem(_lrnKey(), JSON.stringify(a.slice(-100))); } catch (e) {} }
function _addLRN(o) {
    const a = _loadLRN();
    const k = o.message_id + '|' + o.reactor_id + '|' + o.value;
    if (a.some(x => (x.message_id + '|' + x.reactor_id + '|' + x.value) === k)) return;   // dedupe twin delivery
    a.push({ ...o, id: 'lrn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), is_read: false });
    _saveLRN(a);
}
function _removeLRN(message_id, reactor_id, value) {
    const a = _loadLRN(), k = message_id + '|' + reactor_id + '|' + value;
    const n = a.filter(x => (x.message_id + '|' + x.reactor_id + '|' + x.value) !== k);
    if (n.length !== a.length) _saveLRN(n);
}
function _removeLRNById(id) { const a = _loadLRN(); const n = a.filter(x => x.id !== id); if (n.length !== a.length) _saveLRN(n); }
function _localReactUnread() { return _loadLRN().filter(x => !x.is_read).length; }
function _markLocalReactRead() { const a = _loadLRN(); let c = false; a.forEach(x => { if (!x.is_read) { x.is_read = true; c = true; } }); if (c) _saveLRN(a); }
// Feed items in the SAME shape NFA_buildActivity emits, for the Activity screen.
function _localReactFeedItems() {
    return _loadLRN().map(x => ({
        n: { id: x.id, message: x.message, message_id: x.message_id, created_at: x.created_at, is_read: x.is_read },
        cat: 'chats', cls: 'blue', badge: '❤️ Reaction', emoji: '❤️',
        act: { k: 'msg', id: x.message_id }, sender: x.reactor_name || ''
    }));
}
// ===== v199 PATCH END =====
// ONE canonical avatar-change handler (universal realtime avatars). Updates the
// single source (_users / globalUsersCache / persisted cache) and repaints avatars.
// profiles.avatar_url is the source of truth everywhere; _avatarHTML reads from it.
let _avatarRepaintT = null;
function _onAvatarChanged(uid, newUrl) {
    const u = _users.find(x => x.id === uid);
    if (u) { if ((u.avatar_url || '') === newUrl) return; u.avatar_url = newUrl; }   // no change → skip
    else if (!newUrl) return;
    const gc = window.globalUsersCache?.find(x => x.id === uid);
    if (gc) gc.avatar_url = newUrl;
    if (uid === _uid && window.currentUser) window.currentUser.avatar_url = newUrl;
    try { _saveUsersCache(_tid, _users); } catch (e) {}
    // Debounced re-render of the current safe screen so avatars refresh app-wide,
    // including the currently-open DM/group chat header and visible message bubbles.
    clearTimeout(_avatarRepaintT);
    _avatarRepaintT = setTimeout(() => {
        const top = _stack[_stack.length - 1];
        const SAFE = ['home', 'activity', 'settings', 'members', 'groupMgmt', 'marks', 'tasks', 'groupChat', 'dm'];
        if (top && SAFE.includes(top.screen)) { try { _render(top.screen, top.params); } catch (e) {} }
    }, 350);
}
// Persist "read" for a room the user just opened: notifications rows carry only a
// message_id, so resolve the room's recent message ids first. Fire-and-forget —
// keeps the DB in step so the badge poll can't resurrect a count the user has seen.
async function _markRoomNotifsRead(room) {
    try {
        const { data: ms } = await sb.from('messages').select('id')
            .eq('room_id', room).eq('tenant_id', _tid)
            .order('created_at', { ascending:false }).limit(300);
        const ids = (ms||[]).map(m => m.id);
        if (ids.length) {
            await sb.from('notifications').update({ is_read:true })
                .eq('user_id', _uid).eq('is_read', false).in('message_id', ids);
        }
    } catch (e) {}
    // Recompute the bell/activity/app badge from the DB truth AFTER marking read,
    // so the count actually goes down on chat-open instead of lagging a poll cycle.
    try { await refreshNotificationUI(); } catch (e) {}
}
// In-app alert when a notification row lands (reaction/reply/task/reminder for
// ME). Always refreshes the badge + feed. Also shows a toast + sound UNLESS:
//  • type is 'mention' — already alerted by _onNewMessage's heads-up (the mention
//    also arrives as a message event), so alerting here would double up; or
//  • Do Not Disturb is on; or sound is off (then no ping).
// Plain messages/DMs don't create notification rows (v122), so this fires for the
// attention stream only — the gap where a reaction/task gave NO mobile alert.
function _onNotifInsert(n) {
    console.log('[act] notif-recv type='+(n&&n.type)+' mid='+(n&&n.message_id));   // confirms the notifications realtime channel fired
    _activityHasNew = true;               // it also shows in the timeline → light the dot
    refreshNotificationUI();              // bell + per-chat unread + app badge + feed, together
    if (!n || !n.message) return;
    if (n.type === 'mention') return;                 // de-dup with _onNewMessage heads-up
    if (window._isDND?.()) return;                    // Do Not Disturb — silent
    try { _toast(_snip(n.message, 80)); } catch (e) {}
    if (!window._isSoundOff?.()) { try { window.playSound?.('message'); } catch (e) {} }
}
// BELL = the ACTIVITY stream ONLY (Phase 8, standard model): unread notifications
// = mentions + reactions-to-you + replies-to-you + task events + reminders. It is
// NOT the message-unread count (that lives on the chat rows, derived from
// room_reads by _reconcileUnread). Decoupling the two is what fixes the badge
// "sometimes works / mostly misbehaves": they no longer fight via a max().
async function _refreshNotifBadge() {
    _bellCount = await window.NFA_unreadCount(sb, _uid);   // pure notification unread
    _renderBellBadge();
    _updateAppBadge();
    _liveRefreshActivity();   // if the Activity screen is open, refresh it live
}
// Consolidated notification-surface refresh. Keeps the bell badge, per-chat message
// unread, the app-icon badge and the Activity screen updating TOGETHER, so the bell
// can never move independently of the counts/feed (the root of "bell sometimes
// right, mostly wrong"). Call this from event handlers instead of a bare
// _renderBellBadge(). NOTE: never call it from inside _refreshNotifBadge or
// _reconcileUnread themselves — that would recurse.
// ===== v193 PATCH BEGIN (PATCH 11: coalesce duplicate refreshes) =====
// Many event paths (realtime message/reaction, poll, foreground resync) can fire
// refreshNotificationUI() in a burst. Overlapping runs each hit the DB reconcile
// and re-render — wasteful and the source of the doubled [BELL]/[UNREAD] bursts.
// Guard so concurrent calls collapse into ONE run, with a single trailing re-run
// if a call arrived while a run was in flight (no missed update). Same behaviour,
// far fewer redundant reconciles.
let _notifRefreshing = false, _notifRefreshPending = false;
async function refreshNotificationUI() {
    if (_notifRefreshing) { _notifRefreshPending = true; return; }
    _notifRefreshing = true;
    try {
        do {
            _notifRefreshPending = false;
            // ORDER MATTERS (Patch 4): reconcile the unread map FIRST, then paint the
            // bell — the bell total includes summed message unread, so painting it
            // before reconciliation would show a stale number for one frame.
            await _reconcileUnread();
            await _refreshNotifBadge();
            _updateAppBadge();
            _liveRefreshActivity();
        } while (_notifRefreshPending);   // a call landed mid-run → run once more
    } catch (err) { console.error('refreshNotificationUI failed:', err); }
    finally { _notifRefreshing = false; }
}
// ===== v193 PATCH END =====
// Reconcile per-chat MESSAGE unread from the DB (room_reads + messages) — the
// durable source of truth, so counts are correct after reload, realtime flaps
// and reconnects (not just from ephemeral realtime increments). Only counts
// rooms the user actually has (groups they can see + their own DMs).
async function _reconcileUnread() {
    if (!_uid || !_tid || !window.NFA_computeRoomUnread) return;
    try {
        const rooms = new Set();
        [...DEPTS, ..._customGroups].forEach(d => rooms.add(d.id));
        (_users || []).forEach(u => { if (u.id !== _uid) rooms.add(_dmRoom(u.id)); });
        // Also keep ANY room where unread was live-received (e.g. 'general' or a
        // group not in _customGroups) — otherwise the allow-list drops its unread on
        // the next reconcile, so group counts flashed then vanished from the bell.
        Object.keys(window.unreadCounts || {}).forEach(rid => rooms.add(rid));
        // Rooms seen live this session (incl. groups not in DEPTS/_customGroups) — the
        // seed the removed hand-increment used to provide (Patch Set 2 regression fix).
        _seenRooms.forEach(rid => rooms.add(rid));
        console.log('[ROOM IDS]', [...rooms]);
        const { perRoom } = await window.NFA_computeRoomUnread(sb, { uid: _uid, tid: _tid, rooms });
        const top = _stack[_stack.length - 1];
        const openRoom = (top?.screen === 'groupChat' || top?.screen === 'dm') ? top.params?.room : null;
        // WhatsApp model: a chat's unread clears ONLY when YOU open it — never because
        // a DB read momentarily returned 0. The DB reconcile is a floor (it can only
        // ADD counts the live path missed, e.g. messages received while the app was
        // closed); it must not WIPE a live count. This is what made GROUP badges vanish
        // (the DB read returned 0 for the group — replication lag / read-marker skew —
        // and the old code reset the whole map to the DB result). Merge by max, then
        // force the open room to 0 (we're reading it right now).
        const merged = {};
        const allRooms = new Set([...Object.keys(perRoom), ...Object.keys(window.unreadCounts || {})]);
        allRooms.forEach(rid => { merged[rid] = Math.max(perRoom[rid] || 0, window.unreadCounts?.[rid] || 0); });
        if (openRoom) { merged[openRoom] = 0; delete _liveUnreadTs[openRoom]; }
        // Max-merge floor: reconcile can only ADD counts the live path missed; it
        // never wipes a live increment (that's what made group badges vanish).
        window.unreadCounts = merged;
        console.log('[UNREAD]', { rooms: Object.keys(window.unreadCounts || {}).length, counts: window.unreadCounts });
        // AUTO-DIAGNOSTIC (Patch 6 follow-up): a GROUP that has unread but is NOT in
        // the rendered group list (_customGroups ∪ DEPTS) has NOWHERE to show a badge
        // — the exact "one group never gets a badge" symptom. Surface it explicitly.
        try {
            const listed = new Set([...DEPTS, ..._customGroups].map(g => g.id));
            const orphans = Object.keys(window.unreadCounts).filter(rid =>
                !rid.startsWith('dm_') && (window.unreadCounts[rid] > 0) && !listed.has(rid));
            if (orphans.length) console.warn('[UNREAD ORPHAN GROUPS]', orphans, 'listed=', [..._customGroups.map(g=>g.id)]);
        } catch (e) {}
        _updateAppBadge();
        _renderBellBadge();   // bell/Activity reflect the reconciled per-room totals (no double, DMs included)
        // SURGICAL badge update (no screen re-render / no slide): patch each visible
        // chat row's unread badge in place, so group/DM badges appear silently in the
        // background — like a real app — instead of sliding the whole home screen in
        // from the right on every poll (the "cheap app" refresh).
        if (top?.screen === 'home') {
            rooms.forEach(rid => { try { _patchHomeUnread(rid); } catch (e) {} });
        }
    } catch (e) {}
}
// 60s resilience poll (Phase 5.3). Refreshes bell + reconciles message unread from
// the DB. When the realtime message channel is NOT 'joined' (flapping/dead socket)
// it also re-pulls the open chat so a new message still lands within the poll
// window. Skipped while backgrounded to save battery/network.
async function _fallbackPoll() {
    await refreshNotificationUI();   // reconcile → bell, synchronized order
    if (document.visibilityState !== 'visible') return;
    // Incremental catch-up for the OPEN chat, ALWAYS (not only when the socket looks
    // dead): the mobile socket frequently reports state='joined' while silently
    // dropping events, so new messages/reactions/replies only showed after a manual
    // refresh. This appends anything missed + refreshes reactions in place, flicker-
    // free — so the open chat behaves live like Slack/WhatsApp even on a flaky socket.
    try { await _syncOpenChat(); } catch (e) {}
}
let _syncingOpen = false;
async function _syncOpenChat() {
    if (_syncingOpen) return;
    const top = _stack[_stack.length - 1];
    if (!top || (top.screen !== 'groupChat' && top.screen !== 'dm')) return;
    const room = top.params?.room; if (!room) return;
    const areaId = top.screen === 'groupChat' ? 'mMsgArea' : 'mDMArea';
    const area = _el(areaId); if (!area) return;
    _syncingOpen = true;
    try {
        // 1) Append messages newer than the newest one on screen (missed live delivery).
        const timed = area.querySelectorAll('[data-time]');
        const newestTs = timed.length ? timed[timed.length - 1].getAttribute('data-time') : '';
        let q = sb.from('messages')
            .select('id,text,sender_id,created_at,updated_at,parent_message_id,room_id,tenant_id')
            .eq('room_id', room).eq('tenant_id', _tid).is('deleted_at', null)
            .order('created_at', { ascending: true }).limit(50);
        if (newestTs) q = q.gt('created_at', newestTs);
        const { data } = await q;
        (data || []).forEach(m => {
            if (m.sender_id !== _uid && !document.getElementById('row-' + m.id)) {
                try { _onNewMessage(m); } catch (e) {}
            }
        });
        // 2) Refresh reactions for the rows currently on screen (silent-drop catch-up).
        const ids = [...area.querySelectorAll('[id^="row-"]')].map(el => el.id.slice(4)).filter(Boolean);
        if (ids.length) {
            const rmap = await _fetchReactions(ids);
            ids.forEach(id => { try { _refreshChipsFromMap(id, rmap); } catch (e) {} });
        }
    } catch (e) { /* best-effort */ } finally { _syncingOpen = false; }
}
// ADAPTIVE fallback poll (the fix for "kabhi aata hai kabhi nahi" on Android):
// realtime on mobile/tablet flaps constantly, so a fixed 60s catch-up feels
// unreliable. Self-schedule based on state — when the socket is NOT joined and
// the app is visible, reconcile every 20s so missed group badges / messages
// appear ~3× faster; when realtime is healthy stay at 60s (it carries updates);
// when backgrounded back off to 90s to save battery.
function _scheduleFallback() {
    if (_fallbackTimer) clearTimeout(_fallbackTimer);
    // STEADY 15s while visible — do NOT trust the socket's "healthy" flag to slow
    // this down (advisor fix #2): mobile realtime frequently reports state='joined'
    // while silently dropping events, so a 60s "healthy" poll left the UI stale for
    // up to a minute. 15s guarantees the DB truth wins within 15s regardless. 60s
    // when backgrounded to save battery.
    // 6s while visible: the mobile socket silently drops realtime events (proven in
    // the logs — bell moved with no react-recv/notif-recv), so a fast catch-up poll
    // is what makes badges/bell feel near-instant despite the flaky socket. Trivial
    // load at this scale (two count queries). 60s when backgrounded to save battery.
    const hidden = document.visibilityState !== 'visible';
    const ms = hidden ? 60000 : 6000;
    _fallbackTimer = setTimeout(async () => {
        try { await _fallbackPoll(); } catch (e) {}
        _scheduleFallback();   // re-evaluate cadence each tick
    }, ms);
}
// Render the bell + Activity-tab badge. Per the chosen model, the bell reflects
// EVERY unread item: attention notifications (_bellCount = mentions/reactions/
// replies/tasks) PLUS all unread chat messages (per-room, from room_reads via
// _reconcileUnread). room_reads counts each message exactly once, so a single
// message can never show as 2, and DMs (which live in unreadCounts too) badge the
// bell like groups do.
// BELL = attention only (mentions/replies/reactions/tasks/reminders). Per-chat
// message unread lives on the chat rows, NOT here — that's the 3-surface split.
// Bell number = attention items (mentions/replies/reactions/tasks/reminders)
// PLUS all unread chat messages (DM + group) — a total-unread indicator, as
// requested (WhatsApp/Slack style). Chat rows still show each chat's own count;
// tapping the bell opens the attention list. room_reads counts each message once.
// v199: + locally-stored reaction notifications (bypasses the RLS-blocked table).
function _bellTotal() { return _bellCount + _sumUnread() + _localReactUnread(); }
function _renderBellBadge() {
    // 1) BELL (top-right) — the attention NUMBER.
    const badge = _el('mNotifBadge');
    if (badge) {
        const bt = _bellTotal();   // attention + all unread messages (DM + group), WhatsApp/Slack style
        // Truthful trace: the RENDERED bell = notifications + summed message unread.
        console.log('[BELL]', { rendered: bt, notif: _bellCount, msgUnread: _sumUnread() });
        if (bt > 0) { badge.textContent = bt > 9 ? '9+' : String(bt); badge.style.display = 'flex'; }
        else badge.style.display = 'none';
    }
    // 2) ACTIVITY bottom-nav tab — a subtle "new" DOT (no number), hidden while the
    //    timeline is open. It signals unseen team activity, not a personal count.
    const nb = _el('mnActBadge');
    if (nb) {
        const onTimeline = _stack[_stack.length-1]?.screen === 'activity';
        if (_activityHasNew && !onTimeline) {
            nb.textContent = '';
            nb.style.cssText = 'display:block;position:absolute;top:4px;right:12px;width:9px;height:9px;min-width:0;padding:0;border-radius:50%;background:#ef4444;border:1.5px solid var(--bg-sidebar,#fff);';
        } else {
            nb.style.display = 'none';
        }
    }
}
function _bumpBellBadge() { _bellCount++; _renderBellBadge(); _updateAppBadge(); }
function _clearBellBadge() { _bellCount = 0; _renderBellBadge(); _updateAppBadge(); }
// App-icon unread badge (installed PWA) — grand total of things needing
// attention = unread messages (per-chat) + unread activity (bell). The two
// streams are disjoint now (plain messages aren't in notifications), so sum.
function _updateAppBadge() {
    try {
        const total = _sumUnread() + _bellCount;
        if (navigator.setAppBadge) {
            if (total > 0) navigator.setAppBadge(total); else navigator.clearAppBadge?.();
        }
    } catch (e) { /* Badging API unsupported — ignore */ }
}
// Live-patch a chat row's unread badge on the home list (no full re-render).
// Update EVERY row matching this room, not just the first querySelector hit — a
// group id can appear on more than one element (e.g. a picker in the DOM), and the
// old code could patch the wrong one, so the visible home badge never updated.
function _patchHomeUnread(room, msg) {
    try {
        const n = window.unreadCounts?.[room] || 0;
        const els = document.querySelectorAll('[data-room="' + (window.CSS?.escape ? CSS.escape(room) : room) + '"]');
        const seen = new Set();
        els.forEach(el => {
            const row = el.closest('.m-row') || (el.classList.contains('m-row') ? el : null);
            if (!row || seen.has(row)) return;
            seen.add(row);
            const holder = row.querySelector('.m-unread-badge')?.parentElement
                        || row.querySelector('.m-chv')?.parentElement
                        || row.lastElementChild;
            if (holder) holder.innerHTML = n > 0
                ? `<span class="m-unread-badge">${n > 99 ? '99+' : n}</span>`
                : '<i class="fa-solid fa-chevron-right m-chv"></i>';
            if (msg) {
                const rs = row.querySelector('.m-rs');
                if (rs) {
                    const sender = _users.find(u=>u.id===msg.sender_id);
                    const nm = sender ? (sender.full_name||sender.email?.split('@')[0]) : '';
                    rs.textContent = (nm ? nm+': ' : '') + _snip(msg.text, 60);
                }
            }
        });
    } catch (e) {}
}
// Open a chat by room id (from a push deep-link).
async function _openRoomByRoom(room) {
    if (!room) return;
    const g = _findGroup(room);
    if (g) { await _navTo('groupChat', { room: g.id, name: g.name, color: g.col }); return; }
    if (String(room).startsWith('dm_')) {
        const other = room.replace('dm_', '').split('_').find(p => p !== _uid);
        const u = _users.find(x => x.id === other);
        const nm = u ? (u.full_name || u.email?.split('@')[0]) : 'Direct Message';
        await _navTo('dm', { uid: other, name: nm, room });
    }
}
function _openRoomFromUrl() {
    try {
        const room = new URLSearchParams(location.search).get('room');
        if (!room) return;
        history.replaceState({}, '', location.pathname);  // don't reopen on back
        _openRoomByRoom(room);
    } catch (e) {}
}
async function _goToMessage(messageId, roomIdHint) {
    if (!messageId) { _toast('No message linked to this notification','err'); return; }
    let room = roomIdHint;
    if (!room) {
        const { data } = await sb.from('messages').select('room_id').eq('id',messageId).single();
        room = data?.room_id;
    }
    if (!room) { _toast('That message could not be found','err'); return; }
    const dept = _findGroup(room);
    if (dept) {
        await _navTo('groupChat',{room:dept.id,name:dept.name,color:dept.col,scrollTo:messageId});
    } else if (room.startsWith('dm_')) {
        const otherUid = room.replace('dm_','').split('_').find(p=>p!==_uid);
        const otherUser = _users.find(u=>u.id===otherUid);
        const nm = otherUser ? (otherUser.full_name||otherUser.email.split('@')[0]) : 'Direct Message';
        await _navTo('dm',{uid:otherUid,name:nm,room,scrollTo:messageId});
    } else {
        _toast('Could not open that conversation','err');
    }
}
async function _goToTask(taskId) {
    if (!taskId) { _toast('No task linked to this notification','err'); return; }
    await _navTo('taskDetail',{id:taskId});
}
// De-dupe: a message can arrive via BOTH postgres_changes and the shared broadcast
// bridge. Without this, the bubble renders twice and every badge counts it twice.
const _seenMsgIds = new Set();
const _seenMsgOrder = [];
async function _onNewMessage(m) {
    if (!m) return;
    console.log('[act] msg-recv id='+m.id+' room='+m.room_id+' reply='+!!m.parent_message_id+' from='+m.sender_id+' openTop='+(_stack[_stack.length-1]?.screen));
    if (m.id) {
        if (_seenMsgIds.has(m.id)) { console.log('[act] msg-recv DUP-skip id='+m.id); return; }   // already handled
        if (document.getElementById('row-'+m.id)) { console.log('[act] msg-recv already-rendered id='+m.id); return; }
        _seenMsgIds.add(m.id); _seenMsgOrder.push(m.id);
        if (_seenMsgOrder.length > 200) _seenMsgIds.delete(_seenMsgOrder.shift());
    }
    if (m.tenant_id && m.tenant_id !== _tid) return;
    if (m.sender_id === _uid) return; // own sends are already shown by the post-send refresh
    // DM privacy guard — ignore DMs the current user is not a participant of (no toast/notif/render)
    if (m.room_id && m.room_id.startsWith('dm_')) {
        const parts = m.room_id.replace('dm_','').split('_');
        if (!parts.includes(_uid)) return;
    }
    // @mention: if this incoming message mentions ME, always alert distinctly —
    // even if I'm currently viewing that chat — independent of the server. The
    // heads-up + a mention notification row are created here so it works live and
    // without relying on the edge function.
    const mentionsMe = !!(m.text && m.text.includes('data-uid="' + _uid + '"'));
    if (mentionsMe && !(window._isDND?.())) {
        const sndr = _users.find(u => u.id === m.sender_id);
        const snm = sndr ? (sndr.full_name || sndr.email?.split('@')[0]) : 'Someone';
        _showHeadsUp(m, snm, m.room_id?.startsWith('dm_'), _findGroup(m.room_id), true);
    }

    _liveRefreshActivity();   // if the Activity screen is open, refresh it live

    const top = _stack[_stack.length-1];
    if (!top) return;
    const inGroup  = top.screen==='groupChat' && m.room_id===top.params?.room && !m.parent_message_id;
    const inDM     = top.screen==='dm'        && m.room_id===top.params?.room;
    const inThread = top.screen==='thread'    && m.parent_message_id===top.params?.id;
    if (!inGroup && !inDM && !inThread) {
        // Update the reply indicator on the parent bubble if it's visible in the current chat.
        // Use the SAME clickable .m-thread-link element the renderer emits (not a separate div),
        // so the indicator stays single and tappable to open the thread.
        if (m.parent_message_id) {
            // Keep the reply-count cache in sync ALWAYS (even if the parent isn't on
            // screen right now) so the "N replies" button appears the moment the user
            // opens/scrolls to that chat — not only when the parent happens to be
            // rendered when the reply lands.
            _replyMapCache[m.room_id] = _replyMapCache[m.room_id] || {};
            _replyMapCache[m.room_id][m.parent_message_id] = (_replyMapCache[m.room_id][m.parent_message_id] || 0) + 1;
            const parentRow = document.getElementById('row-'+m.parent_message_id);
            console.log('[act] reply-recv parent='+m.parent_message_id+' parentOnScreen='+!!parentRow);
            if (parentRow) {
                const link = parentRow.querySelector('.m-thread-link');
                const n = _replyMapCache[m.room_id][m.parent_message_id];
                if (link) {
                    link.dataset.n = n;
                    link.innerHTML = `💬 ${n} repl${n===1?'y':'ies'} ›`;
                    console.log('[act] reply-recv thread-link UPDATED n='+n);
                } else {
                    const dept = DEPTS.find(d=>d.id===m.room_id) || _customGroups.find(g=>g.id===m.room_id);
                    parentRow.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend',
                        `<button class="m-thread-link" data-action="thread" data-n="${n}" data-id="${m.parent_message_id}" data-room="${m.room_id||''}" data-rname="${x(dept?.name||'')}" data-rcol="${dept?.col||''}">💬 ${n} repl${n===1?'y':'ies'} ›</button>`);
                    console.log('[act] reply-recv thread-link INSERTED');
                }
            }
            // (A reply to MY message creates a notification; the single
            // refreshNotificationUI() below covers the bell — no separate call.)
        }
        // INSTANT per-chat badge (WhatsApp-style): bump immediately so the group/DM
        // badge appears the moment the realtime event lands — do not wait for the DB
        // reconcile (which reads only the newest tenant messages and can miss a busy
        // tenant's quiet room). reconcile still runs below as a max-merge floor.
        window.unreadCounts = window.unreadCounts || {};
        window.unreadCounts[m.room_id] = (window.unreadCounts[m.room_id] || 0) + 1;
        _liveUnreadTs[m.room_id] = Date.now();  // grace: reconcile must not wipe this before replication catches up
        _patchHomeUnread(m.room_id, m);         // paint the new badge + last-message preview now
        _activityHasNew = true; refreshNotificationUI();   // reconcile (floor) + bell + feed

        if (!m.parent_message_id) {
            const sender = _users.find(u=>u.id===m.sender_id);
            const name = sender ? (sender.full_name||sender.email?.split('@')[0]) : 'Someone';
            const dept = _findGroup(m.room_id);
            const isDM = m.room_id?.startsWith('dm_');
            const roomLabel = dept ? dept.name : (isDM ? 'a direct message' : 'a group');
            if (!(window._isDND?.()) && !mentionsMe) _showHeadsUp(m, name, isDM, dept);
            // (The notifications ROW is created server-side by send-push; the
            // refreshNotificationUI() above already refreshed the bell — no extra call.)
        }
        return;
    }
    const areaId = top.screen==='groupChat' ? 'mMsgArea' : top.screen==='dm' ? 'mDMArea' : 'mThreadArea';
    const area = _el(areaId); if (!area) return;
    const wasNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
    area.insertAdjacentHTML('beforeend', _bubbleHTML(m, {}, inThread?160:140));
    if (wasNearBottom) area.scrollTop = area.scrollHeight;
    else {
        _scrollFabCount++;
        const fab = _el('mScrollFab');
        if (fab) { fab.style.display = 'flex'; fab.innerHTML = `<i class="fa-solid fa-chevron-down"></i>${_scrollFabCount > 0 ? `<span style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border-radius:50%;font-size:9px;font-weight:700;width:16px;height:16px;display:flex;align-items:center;justify-content:center;">${_scrollFabCount > 9 ? '9+' : _scrollFabCount}</span>` : ''}`; }
    }
    // Keep room cache in sync
    if (!inThread) {
        const cached = _loadRoomCache(m.room_id) || [];
        cached.push(m);
        _saveRoomCache(m.room_id, cached);
    }
}
async function _onReactionChange(r, eventType) {
    console.log('[act] react-recv et='+eventType+' mid='+(r&&r.message_id)+' val='+(r&&r.value)+' onScreen='+!!(r&&r.message_id&&document.getElementById('row-'+r.message_id)));
    // DIAGNOSTIC (authoritative, correct selector): records whether the reaction
    // event was DELIVERED, whether the payload carried a message_id (null ⇒ RLS
    // blocked the payload / DELETE without replica-identity-full), and whether the
    // row is on screen (row-<id>). A log dump now distinguishes delivery vs RLS vs
    // render without guessing.
    try { window.logger?.logReact?.('pg-recv', {
        et: eventType, hasMid: !!r?.message_id,
        rowFound: !!(r?.message_id && document.getElementById('row-'+r.message_id)),
    }); } catch (e) {}
    if (!r || !r.message_id) return;
    const isDelete = eventType === 'DELETE';
    // Persist to the local cache FIRST — before the on-screen check — so a reaction
    // for a chat that isn't currently open is still cached and shows instantly when
    // the user opens/scrolls to that message (no wait for a DB round-trip).
    _saveReactionEntry(r.message_id, r.value, r.type, r.user_id, isDelete);
    // A reaction to MY message must show in MY bell + Activity feed. The reactor
    // CANNOT reliably insert that row (cross-user insert is RLS-blocked unless a
    // special policy/trigger is applied). So the AUTHOR self-inserts it here, on
    // receiving the reaction event — a SELF insert (user_id = me) is always allowed
    // by default RLS, so reactions work with NO migration. Deduped per (message,
    // reactor) so the twin delivery (postgres_changes + broadcast) inserts once.
    if (!isDelete && r.user_id && r.user_id !== _uid) {
        // Key on message + reactor + VALUE so the twin delivery (postgres_changes +
        // broadcast) of the SAME reaction dedupes, but different emojis (👍 ❤️ 😂)
        // from the same person each notify.
        const _rk = r.message_id + '|' + r.user_id + '|' + (r.value || '');
        if (!_reactNotifSeen.has(_rk)) {
            _reactNotifSeen.add(_rk);
            if (_reactNotifSeen.size > 400) _reactNotifSeen.delete(_reactNotifSeen.values().next().value);
            (async () => {
                try {
                    const { data: msg } = await sb.from('messages').select('sender_id,room_id').eq('id', r.message_id).maybeSingle();
                    console.log('[v194][REACTION] recv mine=' + (msg?.sender_id === _uid) + ' mid=' + r.message_id + ' from=' + r.user_id);
                    if (msg?.sender_id === _uid) {   // only if the reacted message is MINE
                        const reactor = _uname(r.user_id) || 'Someone';
                        // v199: store LOCALLY first — this is what makes the reaction show in
                        // the bell + Activity feed regardless of the notifications-table RLS.
                        _addLRN({
                            message_id: r.message_id, reactor_id: r.user_id, reactor_name: reactor,
                            value: r.value || '👍', room_id: msg.room_id || '',
                            message: `${r.value || '👍'} ${reactor} reacted to your message`,
                            created_at: new Date().toISOString()
                        });
                        // Best-effort DB insert too (works if RLS allows; harmless otherwise).
                        const ins = await sb.from('notifications').insert({
                            user_id: _uid, type: 'reaction',
                            message: `${r.value || '👍'} ${reactor} reacted to your message`,
                            message_id: r.message_id, tenant_id: _tid, is_read: false
                        }).select();
                        console.log('[v194][REACTION] self-insert ok=' + !ins.error + (ins.error ? ' ERR=' + ins.error.message : ''));
                    }
                } catch (e) { console.log('[v194][REACTION] self-insert threw ' + (e?.message || e)); }
                try { refreshNotificationUI(); } catch (e) {}
            })();
        } else { try { refreshNotificationUI(); } catch (e) {} }
    }
    // ===== v193 PATCH BEGIN (PATCH 13: reaction removal → remove notification) =====
    // When someone UN-reacts to my message, delete the reaction notification I
    // self-inserted (self-delete, RLS-safe) and clear the dedupe key so a re-add
    // notifies again. Keeps the bell + Activity feed in sync with the live reaction.
    if (isDelete && r.user_id && r.user_id !== _uid) {
        _reactNotifSeen.delete(r.message_id + '|' + r.user_id + '|' + (r.value || ''));
        _removeLRN(r.message_id, r.user_id, r.value || '👍');   // v199: drop the local reaction notification
        (async () => {
            try {
                const { data: msg } = await sb.from('messages').select('sender_id').eq('id', r.message_id).maybeSingle();
                if (msg?.sender_id === _uid) {
                    await sb.from('notifications').delete()
                        .eq('user_id', _uid).eq('message_id', r.message_id).eq('type', 'reaction');
                }
            } catch (e) { /* offline — ignore */ }
            try { refreshNotificationUI(); } catch (e) {}
        })();
    }
    // ===== v193 PATCH END =====
    if (!document.getElementById('row-'+r.message_id)) return;   // not on screen — cached above, render later
    // Render through the SAME reliable path the sender uses (re-fetch from DB +
    // cache, canonical placement, scroll-into-view). This replaced a fragile
    // DOM-reconstruction that mis-rendered on the receiver (web was instant,
    // mobile/tab needed a manual refresh).
    await _refreshChips(r.message_id, { value:r.value, type:r.type, isDelete, user_id:r.user_id });
}
async function _onTaskAssigneeUpdate(row) {
    if (row.tenant_id && row.tenant_id !== _tid) return;
    if (!row || row.assignee_id !== _uid) return;
    const top = _stack[_stack.length-1];
    if (!top) return;
    if (top.screen === 'taskDetail' && top.params?.id === row.task_id) {
        await _render('taskDetail', top.params, 'forward');
    } else if (top.screen === 'tasks') {
        await _render('tasks', null, 'forward');
    }
}

async function _loadOlderMessages(areaId, room, screen) {
    if (_loadingOlder || _allLoaded[room] || !_oldestTs[room]) return;
    const area = _el(areaId); if (!area) return;
    _loadingOlder = true;
    try {
        const isGroup = screen === 'groupChat';
        let q = sb.from('messages')
            .select(isGroup ? 'id,text,sender_id,created_at,updated_at,parent_message_id' : 'id,text,sender_id,created_at,updated_at')
            .eq('room_id',room).eq('tenant_id',_tid).is('deleted_at',null);
        if (isGroup) q = q.is('parent_message_id',null);
        const { data: raw } = await q.lt('created_at', _oldestTs[room]).order('created_at',{ascending:false}).limit(50);
        if (!raw || raw.length === 0) { _allLoaded[room] = true; return; }
        const older = raw.reverse();  // oldest → newest
        _oldestTs[room] = older[0]?.created_at || _oldestTs[room];
        if (raw.length < 50) _allLoaded[room] = true;
        const ids = older.map(m=>m.id);
        let reactionsMap = {}, replyMap = {};
        if (isGroup) {
            const [rm, replyData] = await Promise.all([
                _fetchReactions(ids),
                sb.from('messages').select('parent_message_id').in('parent_message_id', ids).eq('tenant_id',_tid).is('deleted_at',null)
            ]);
            reactionsMap = rm;
            (replyData.data||[]).forEach(r => { replyMap[r.parent_message_id] = (replyMap[r.parent_message_id]||0)+1; });
        } else {
            reactionsMap = await _fetchReactions(ids);
        }
        const roomCtx = _stack[_stack.length-1]?.params || {};
        const maxLen = isGroup ? 140 : 160;
        const html = older.map(m => _bubbleHTML(m, reactionsMap, maxLen, replyMap, roomCtx)).join('');
        // Prepend while preserving scroll position (anchor to current top element)
        const prevHeight = area.scrollHeight;
        const prevTop = area.scrollTop;
        area.insertAdjacentHTML('afterbegin', html);
        area.scrollTop = prevTop + (area.scrollHeight - prevHeight);
    } catch {} finally { _loadingOlder = false; }
}

function _wireScreen(screen, params, container) {
    const areaId = screen==='groupChat'?'mMsgArea':screen==='dm'?'mDMArea':screen==='thread'?'mThreadArea':null;
    if (areaId) {
        const area = _el(areaId);
        const fab  = _el('mScrollFab');
        if (area) {
            if (!params?.scrollTo) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 80);
            const room = params?.room;
            const topFab = _el('mScrollTopFab');
            const _updateFabs = () => {
                const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
                const nearTop = area.scrollTop < 150;
                const scrollable = area.scrollHeight - area.clientHeight > 240;
                // Down arrow: visible whenever scrolled up from the bottom.
                if (fab) {
                    if (nearBottom) { fab.style.display = 'none'; _scrollFabCount = 0; fab.innerHTML = '<i class="fa-solid fa-chevron-down"></i>'; }
                    else if (scrollable) { fab.style.display = 'flex'; }
                }
                // Up arrow: visible whenever scrolled down from the top.
                if (topFab) topFab.style.display = (!nearTop && scrollable) ? 'flex' : 'none';
            };
            if (area) area.addEventListener('scroll', () => {
                _updateFabs();
                // Load older messages when scrolled near the top (group + DM only)
                if (room && (screen === 'groupChat' || screen === 'dm') && area.scrollTop < 60) {
                    _loadOlderMessages(areaId, room, screen);
                }
            }, { passive:true });
            // Reflect the initial position (e.g. when jumped to a mid-history message).
            setTimeout(_updateFabs, 120);
        }
    }
    if (screen === 'taskDetail') {
        const fi = _el('mFileInput');
        if (fi) fi.onchange = async () => {
            const file = fi.files[0]; if (!file) return;
            const taskId = _pendingUploadTaskId; fi.value = '';
            if (!taskId) return;
            _toast('Uploading…');
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_');
            const filePath = `tasks/${taskId}/${Date.now()}_${safeName}`;
            const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
            if (error) { _toast('Upload failed: '+error.message,'err'); return; }
            await sb.from('task_trails').insert({ task_id:taskId, user_id:_uid, tenant_id:_tid, action:'FILE', comment:`${file.name}|${filePath}` });
            const { data: taskData } = await sb.from('tasks').select('title,assigned_by,original_message_id').eq('id',taskId).single();
            if (window.notifyUser && taskData) await window.notifyUser(taskData.assigned_by, `📎 File uploaded on task: ${taskData.title}`, taskData.original_message_id, 'task', taskId);
            _toast('File uploaded ✓');
            await _navTo('taskDetail',{id:taskId,title:taskData?.title},true);
        };
    }

    const myPhotoInp = _el('mMyPhotoInput');
    if (myPhotoInp) myPhotoInp.onchange = async () => {
        const file = myPhotoInp.files[0]; myPhotoInp.value = '';
        if (!file) return;
        _toast('Processing photo…');
        let dataUrl;
        try { dataUrl = await _compressImageToDataURL(file); }
        catch(e) { _toast('Could not read that image','err'); return; }
        const { error: dbErr } = await sb.from('profiles').update({ avatar_url: dataUrl }).eq('id',_uid);
        if (dbErr) { _toast('Could not save photo: '+dbErr.message,'err'); return; }
        _bcSend('profile_update', { id:_uid, tenant_id:_tid, full_name:window.currentUser?.full_name || window.currentUser?.email, avatar_url:dataUrl });
        // Route through the one avatar coordinator: updates cache + currentUser and
        // repaints everywhere. The DB update also fans out to other devices via the
        // profiles UPDATE realtime → _onPresenceUpdate → _onAvatarChanged.
        _onAvatarChanged(_uid, dataUrl);
        _toast('Photo updated ✓');
        await _navTo('settings',null,true);
    };

    const deptPhotoInp = _el('mDeptPhotoInput');
    if (deptPhotoInp) deptPhotoInp.onchange = async () => {
        const file = deptPhotoInp.files[0]; deptPhotoInp.value = '';
        const deptId = _pendingDeptPhoto; _pendingDeptPhoto = null;
        if (!file || !deptId) return;
        _toast('Uploading photo…');
        let dataUrl;
        try { dataUrl = await _compressImageToDataURL(file); }
        catch(e) { _toast('Could not read that image','err'); return; }
        // Upload to storage so the photo syncs to every device (not just this one).
        try {
            const blob = await (await fetch(dataUrl)).blob();
            const path = `group-photos/${_tid}/${deptId}.jpg`;
            const { error: upErr } = await sb.storage.from('task-proofs').upload(path, blob, { upsert:true, contentType:'image/jpeg' });
            if (!upErr) {
                _lsSet('dept_photo_'+deptId, dataUrl);
                _lsSet('dept_photo_ts_'+deptId, String(Date.now()));
                try { localStorage.removeItem(_lsKey('dept_photo_none_'+deptId)); } catch(e){}
                // Broadcast so other devices drop their cache and re-fetch the new photo.
                _bcSend('group_photo', { room_id:deptId });
            } else {
                _lsSet('dept_photo_'+deptId, dataUrl);  // fallback: local only
                _toast('Photo saved on this device only (storage error)','err');
            }
        } catch(e) {
            try { _lsSet('dept_photo_'+deptId, dataUrl); } catch(e2) { _toast('Image too large — try a smaller photo','err'); return; }
        }
        const d = _findGroup(deptId); if (d) d.photo = dataUrl;
        _toast('Group photo updated ✓');
        await _navTo('home',null,true);
    };
}
function _compressImageToDataURL(file, maxSize=240, quality=0.72) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode failed'));
            img.onload = () => {
                let { width, height } = img;
                if (width > height) { if (width > maxSize) { height = Math.round(height*maxSize/width); width = maxSize; } }
                else { if (height > maxSize) { width = Math.round(width*maxSize/height); height = maxSize; } }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function _pendingBubbleHTML(pendingId, text) {
    const cl = _renderLinkPills(text || '');
    return `<div class="m-bubble-row snt" id="pending-${pendingId}">
      <div class="m-bubble snt m-bubble-pending">
        <div class="m-bmeta">You · just now</div>
        <div class="m-btext">${cl}</div>
        <div class="m-pending-indicator"><i class="fa-regular fa-hourglass" style="font-size:10px;opacity:.6;"></i></div>
      </div>
    </div>`;
}
// NOTE: no send debounce — the composer is cleared synchronously before the network
// await, so a double-tap's second read sees an empty editor and returns at the
// `if (!val) return` guard. A time gate here silently DROPPED fast consecutive
// messages ("ok" then "bye" within 700ms) — that was real message loss.
async function _doSendGroup(a) {
    if (window._trialExpired) { _toast('Trial expired — contact developer to upgrade','err'); return; }
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const payload = { room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString() };
    if (_isOffline) {
        const pid = Date.now();
        const area = _el('mMsgArea'); if (!area) return;
        area.insertAdjacentHTML('beforeend', _pendingBubbleHTML(pid, val));
        area.scrollTo({ top:area.scrollHeight, behavior:'smooth' });
        const q = _getOfflineQueue(); q.push({ pendingId:pid, payload }); _saveOfflineQueue(q);
        return;
    }
    const { data: m, error } = await sb.from('messages').insert(payload).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('send');
    _appendOwnMessage('mMsgArea', m);
    // Broadcast bridge (group only, never DMs) so other devices get it live even
    // if their postgres channel is flaky. Receivers de-dupe by message id.
    _bcSend('new_message', m);
}
async function _doSendReply(a) {
    if (window._trialExpired) { _toast('Trial expired — contact developer to upgrade','err'); return; }
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const payload = { room_id:a.room, parent_message_id:a.pid, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString() };
    if (_isOffline) {
        const pid = Date.now();
        const area = _el('mThreadArea'); if (!area) return;
        area.insertAdjacentHTML('beforeend', _pendingBubbleHTML(pid, val));
        area.scrollTo({ top:area.scrollHeight, behavior:'smooth' });
        const q = _getOfflineQueue(); q.push({ pendingId:pid, payload }); _saveOfflineQueue(q);
        return;
    }
    const _rres = await sb.from('messages').insert(payload).select().single();
    const { data: m, error } = _rres;
    window.logger?.sb('messages.insert[reply]', _rres, { room:a.room, parent:a.pid });
    if (error) { console.log('[act] reply-send FAIL '+error.message); _toast('Send failed: '+error.message,'err'); return; }
    console.log('[act] reply-send OK id='+m.id+' parent='+a.pid+' room='+a.room);
    window.logger?.logReply('send', { id:m.id, room:a.room, parent:a.pid });
    window.playSound?.('send');
    _appendOwnMessage('mThreadArea', m, 160);
    _bcSend('new_message', m);   // live-delivery bridge (replies too; de-duped)
    // Reflect the reply on the parent's "N replies" link (group view + cache) so it
    // shows under the parent immediately, without needing a reload.
    _replyMapCache[a.room] = _replyMapCache[a.room] || {};
    _replyMapCache[a.room][a.pid] = (_replyMapCache[a.room][a.pid] || 0) + 1;
    const _pRow = document.getElementById('row-' + a.pid);
    if (_pRow) {
        const _n = _replyMapCache[a.room][a.pid];
        const _link = _pRow.querySelector('.m-thread-link');
        if (_link) { _link.dataset.n = _n; _link.innerHTML = `💬 ${_n} repl${_n===1?'y':'ies'} ›`; }
        else _pRow.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend',
            `<button class="m-thread-link" data-action="thread" data-n="${_n}" data-id="${a.pid}" data-room="${a.room}" data-rname="${x(a.rname||'')}" data-rcol="${a.rcol||''}">💬 ${_n} repl${_n===1?'y':'ies'} ›</button>`);
    }
    // Notify the parent author that someone replied (mirrors web notifyUser)
    try {
        const { data: parent } = await sb.from('messages').select('sender_id').eq('id', a.pid).single();
        if (parent && parent.sender_id && parent.sender_id !== _uid) {
            const me = _users.find(u=>u.id===_uid);
            const myName = me ? (me.full_name||me.email?.split('@')[0]) : 'Someone';
            const nres = await sb.from('notifications').insert({
                user_id: parent.sender_id, type:'reply',
                message: `↩ ${myName} replied: ${_snip(val.replace(/<[^>]*>/g,''), 80)}`,
                message_id: m.id, tenant_id:_tid, is_read:false
            });
            window.logger?.sb('notifications.insert[reply]', nres, { to: parent.sender_id });
            window.logger?.logNotif('reply→author', { to: parent.sender_id, ok: !nres.error });
        }
    } catch(e) { window.logger?.logError?.(e, { at:'replyNotify' }); }
}
async function _doSendDM(a) {
    if (window._trialExpired) { _toast('Trial expired — contact developer to upgrade','err'); return; }
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const payload = { room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString() };
    if (_isOffline) {
        const pid = Date.now();
        const area = _el('mDMArea'); if (!area) return;
        area.insertAdjacentHTML('beforeend', _pendingBubbleHTML(pid, val));
        area.scrollTo({ top:area.scrollHeight, behavior:'smooth' });
        const q = _getOfflineQueue(); q.push({ pendingId:pid, payload }); _saveOfflineQueue(q);
        return;
    }
    const { data: m, error } = await sb.from('messages').insert(payload).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('send');
    _appendOwnMessage('mDMArea', m);
}
function _appendOwnMessage(areaId, m, maxLen=150) {
    const area = _el(areaId);
    if (!area) return;
    area.insertAdjacentHTML('beforeend', _bubbleHTML(m, {}, maxLen));
    area.scrollTo({ top: area.scrollHeight, behavior:'smooth' });
    // Update room cache — but NEVER cache a REPLY in the main-list cache: the main
    // list only shows top-level messages (parent_message_id IS NULL), so caching a
    // reply here made it flash as a top-level bubble in the group chat until the next
    // DB refetch dropped it. Replies live only under their parent (thread + count).
    if (m.parent_message_id) return;
    const cached = _loadRoomCache(m.room_id) || [];
    cached.push(m);
    _saveRoomCache(m.room_id, cached);
}
async function _doForward(room, text) {
    window._closeSheet();
    const { error } = await sb.from('messages').insert({
        room_id:room, tenant_id:_tid, sender_id:_uid, text:`<p>↪️ Forwarded: ${x(text)}</p>`, created_at:new Date().toISOString()
    });
    _toast(error ? 'Forward failed' : 'Message forwarded ✓', error?'err':'ok');
}
// Send content shared INTO the app from the OS share sheet (text and/or files),
// as a normal message in the chosen room. Files upload to the same private bucket
// the composer's paperclip uses, and are linked with the secure-file scheme.
async function _doShareFull(room) {
    window._closeSheet();
    const pending = _pendingShare; _pendingShare = null;
    if (!pending) { _toast('Nothing to share','err'); return; }
    if (window._trialExpired) { _toast('Trial expired — contact developer to upgrade','err'); return; }
    const { text = '', files = [] } = pending;
    let html = '';
    if (text) html += `<p>${x(text)}</p>`;
    if (files.length) _toast('Uploading…');
    for (const f of files) {
        const safeName = (f.name || 'file').replace(/[^a-zA-Z0-9.\-_]/g,'_');
        const filePath = `chat/${_tid}/${Date.now()}_${safeName}`;
        const { error: upErr } = await sb.storage.from('task-proofs').upload(filePath, f);
        if (upErr) { _toast('Upload failed: '+upErr.message,'err'); continue; }
        html += `<p><a href="https://secure-file.local/${filePath}">📎 ${x(f.name||'file')}</a></p>`;
    }
    if (!html) { _toast('Nothing to share','err'); return; }
    const { error } = await sb.from('messages').insert({
        room_id:room, tenant_id:_tid, sender_id:_uid, text:html, created_at:new Date().toISOString()
    });
    _toast(error ? 'Share failed' : 'Shared ✓', error?'err':'ok');
}
// Web Share Target: when the user picks this app from another app's share sheet,
// the service worker stashes the shared text + files and redirects here with
// ?sharetarget=1. Read them, then let the user pick a chat to send them into.
let _pendingShare = null;
async function _handleShareTarget() {
    try {
        const q = new URLSearchParams(location.search);

        // POST path (text and/or files) — read from the SW's share-inbox cache.
        if (q.get('sharetarget') === '1') {
            history.replaceState({}, '', location.pathname);
            const cache = await caches.open('share-inbox');
            const metaRes = await cache.match('/__share-meta');
            const meta = metaRes ? await metaRes.json() : { title:'', text:'', url:'', count:0 };
            const files = [];
            for (let i = 0; i < (meta.count || 0); i++) {
                const r = await cache.match('/__share-file-' + i);
                if (!r) continue;
                const blob = await r.blob();
                const name = decodeURIComponent(r.headers.get('X-Name') || ('file-' + i));
                files.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }));
            }
            for (const k of await cache.keys()) await cache.delete(k);   // consume once
            const text = [meta.title, meta.text, meta.url].filter(Boolean).join('\n').trim();
            if (!text && !files.length) return false;
            _pendingShare = { text, files };
            const label = text || (files.length === 1 ? files[0].name : `${files.length} files`);
            _showForwardSheet(label, { title:'Share to…', action:'doShareFull' });
            return true;
        }

        // Legacy GET path (text/url only) — kept as a fallback.
        const title = q.get('share_title') || '';
        const text  = q.get('share_text')  || '';
        const url   = q.get('share_url')   || '';
        if (!title && !text && !url) return false;
        history.replaceState({}, '', location.pathname);
        const shared = [title, text, url].filter(Boolean).join('\n').trim();
        if (!shared) return false;
        _pendingShare = { text: shared, files: [] };
        _showForwardSheet(shared, { title:'Share to…', action:'doShareFull' });
        return true;
    } catch (e) { return false; }
}

// Delegate (adds a co-assignee) / Transfer (replaces you; reason mandatory) —
// same lifecycle flow as the web taskAction implementation in js/tasks.js.
function _showTaskReassignSheet(taskId, mode) {
    const others = _users.filter(u => u.id !== _uid);
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">${mode === 'delegate' ? '👤 Delegate task to…' : '🔁 Transfer task to…'}</div>
      <div style="padding:0 16px 18px;display:flex;flex-direction:column;gap:11px;">
        <select class="m-inp" id="mReassignSel">
          <option value="">Select staff member…</option>
          ${others.map(u => `<option value="${u.id}">${x(u.full_name || u.email)}</option>`).join('')}
        </select>
        ${mode === 'transfer' ? `<input class="m-inp" id="mReassignReason" placeholder="Reason (mandatory for transfer)">` : ''}
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
          ${mode === 'delegate'
            ? 'Delegation ADDS the selected person to this task — you remain assigned.'
            : 'Transfer moves this task to the selected person — you are removed. This cannot be undone.'}
        </div>
        <button class="m-action-btn" style="background:${mode==='delegate'?'#8b5cf6':'#64748b'};" data-action="doTaskReassign" data-task="${taskId}" data-mode="${mode}">
          <i class="fa-solid ${mode==='delegate'?'fa-user-plus':'fa-right-left'}"></i> Confirm ${mode === 'delegate' ? 'Delegate' : 'Transfer'}
        </button>
      </div>`;
    _openSheet();
}
async function _doTaskReassign(taskId, mode) {
    const newAssignee = _el('mReassignSel')?.value;
    const reason = _el('mReassignReason')?.value?.trim() || '';
    if (!newAssignee) { _toast('Select a staff member first', 'err'); return; }
    if (mode === 'transfer' && !reason) { _toast('Reason is mandatory for transfer', 'err'); return; }
    window._closeSheet();
    try {
        const { data: t } = await sb.from('tasks').select('title, original_message_id').eq('id', taskId).single();
        const title = t?.title || 'Task';
        if (mode === 'transfer') {
            await sb.from('task_assignees').delete().eq('task_id', taskId).eq('assignee_id', _uid).eq('tenant_id', _tid);
        }
        const { error } = await sb.from('task_assignees').insert({
            task_id: taskId, assignee_id: newAssignee, tenant_id: _tid, status: 'pending_ack', state: 'pending'
        });
        if (error) { _toast((mode === 'delegate' ? 'Delegate' : 'Transfer') + ' failed: ' + error.message, 'err'); return; }
        const notifs = [{ user_id: newAssignee, type: 'task', tenant_id: _tid, is_read: false, task_id: taskId,
            message: (mode === 'delegate' ? '👤 Task Delegated to you: ' : '🔁 Task Transferred to you: ') + title }];
        await sb.from('notifications').insert(notifs);
        await sb.from('task_trails').insert({
            task_id: taskId, user_id: _uid, tenant_id: _tid, action: 'UPDATE',
            comment: mode === 'delegate' ? `Delegated task to ${_uname(newAssignee)}` : `Transferred task to ${_uname(newAssignee)} — ${reason}`
        });
        _toast(mode === 'delegate' ? 'Task delegated ✓' : 'Task transferred ✓');
        if (mode === 'transfer') await _navTo('tasks', null, true);
        else { const top = _stack[_stack.length-1]; if (top?.screen === 'taskDetail') await _render('taskDetail', top.params, 'forward'); }
    } catch (e) { _toast('Action failed — try again', 'err'); }
}
async function _mobTaskAction(taskId, action) {
    const { data: taskData } = await sb.from('tasks').select('*').eq('id',taskId).single();
    if (!taskData) { _toast('Task not found','err'); return; }
    const creatorId = taskData.assigned_by;
    let newStatus = '', comment = '';

    if (action === 'ack') {
        newStatus = 'in_progress'; comment = 'Acknowledged the task';
    } else if (action === 'update') {
        const note = _ceHTML('mTNCE');
        if (!note) { _toast('Write something first','err'); return; }
        _ceClear('mTNCE');
        comment = note.replace(/<[^>]*>/g,' ').trim();
        await sb.from('task_trails').insert({ task_id:taskId, user_id:_uid, tenant_id:_tid, action:'UPDATE', comment });
        if (window.notifyUser) await window.notifyUser(creatorId, `💬 Task update: ${taskData.title} — ${comment.substring(0,60)}`, taskData.original_message_id, 'task', taskId);
        _toast('Update posted ✓');
        await _navTo('taskDetail',{id:taskId,title:taskData.title},true);
        return;
    } else if (action === 'submit') {
        if (taskData.require_proof) {
            const { data: ftrails } = await sb.from('task_trails').select('id').eq('task_id',taskId).eq('user_id',_uid).eq('action','FILE').eq('tenant_id',_tid);
            if (!ftrails || !ftrails.length) { _toast('Proof required — upload a file first','err'); return; }
        }
        newStatus = 'submitted'; comment = 'Submitted for review';
    }

    if (newStatus) {
        const { error } = await sb.from('task_assignees')
            .update({ status:newStatus, state:newStatus, ...(action==='ack'?{acked:true}:{}) })
            .eq('task_id',taskId).eq('assignee_id',_uid);
        if (error) { _toast('Update failed — check permissions','err'); return; }
        await sb.from('task_trails').insert({ task_id:taskId, user_id:_uid, tenant_id:_tid, action:'UPDATE', comment });
        if (window.notifyUser) await window.notifyUser(creatorId, `${action==='ack'?'✅':'📬'} ${comment}: ${taskData.title}`, taskData.original_message_id, 'task', taskId);
        _toast(action==='ack' ? 'Task acknowledged ✓' : 'Submitted for review ✓');
    }
    await _navTo('taskDetail',{id:taskId,title:taskData.title},true);
}

async function _deleteReminder(id) {
    await sb.from('reminders').delete().eq('id',id).eq('user_id',_uid).eq('tenant_id',_tid);
    _toast('Reminder deleted'); await _navTo('remind',null,true);
}
async function _saveReminder(id) {
    const at = _el('rAt')?.value; if (!at) { _toast('Pick a date and time','err'); return; }
    const { error } = await sb.from('reminders').update({ reminder_time:new Date(at).toISOString() }).eq('id',id).eq('user_id',_uid).eq('tenant_id',_tid);
    if (error) { _toast('Could not save: '+error.message,'err'); return; }
    _toast('Reminder saved ✓'); _back();
}
function _removeBookmark(i) {
    const bms = JSON.parse(_lsGet('tf_bookmarks_'+_uid)||'[]');
    bms.splice(i,1);
    _lsSet('tf_bookmarks_'+_uid, JSON.stringify(bms));
    _navTo('marks',null,true);
}
async function _openTaskFile(path) {
    if (!path) { _toast('File path missing','err'); return; }
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) { _toast('Could not open file: '+(error?.message||'unknown error'),'err'); return; }
    window.open(data.signedUrl, '_blank');
}
async function _cancelScheduled(id) {
    await sb.from('scheduled_messages').delete().eq('id',id).eq('sender_id',_uid).eq('tenant_id',_tid);
    _toast('Scheduled message cancelled'); _navTo('scheduled',null,true);
}
async function _saveScheduled(id) {
    const message_text = _el('sTxt')?.value?.trim();
    const scheduled_time = _el('sAt')?.value;
    if (!message_text || !scheduled_time) { _toast('Fill in both fields','err'); return; }
    const { error } = await sb.from('scheduled_messages')
        .update({ message_text, scheduled_time: new Date(scheduled_time).toISOString() })
        .eq('id',id).eq('tenant_id',_tid).eq('sender_id',_uid);
    if (error) { _toast('Could not save: '+error.message,'err'); return; }
    _toast('Scheduled message updated ✓'); _navTo('scheduled',null,true);
}
async function _saveProfile() {
    const full_name   = _el('sName')?.value?.trim();
    const designation = _el('sDesig')?.value?.trim();
    const department  = _el('sDept')?.value?.trim();
    const { error } = await sb.from('profiles').update({full_name,designation,department}).eq('id',_uid).eq('tenant_id',_tid);
    _toast(error ? 'Save failed' : 'Profile saved ✓', error?'err':'ok');
    if (!error) {
        window.currentUser.full_name = full_name;
        // Keep the users cache in sync so message bubbles / headers (which resolve
        // names via _uname → _users) show the NEW display name, not the stale one.
        const cu = (_users || []).find(u => u.id === _uid); if (cu) cu.full_name = full_name;
        const gu = (window.globalUsersCache || []).find(u => u.id === _uid); if (gu) gu.full_name = full_name;
        try { _saveUsersCache(_tid, _users); } catch (e) {}
        // Rebuild the name label WITHOUT dropping the Online/Offline chip that lives
        // inside .m-sb-user (a bare textContent set would wipe it). Show verbatim so
        // it EQUALS the display name shown in message bubbles.
        const u = _el('mSBInfo')?.querySelector('.m-sb-user');
        if (u) { u.innerHTML = x(full_name) + '<span id="mConnState" class="m-conn"></span>'; try { _setConnState(); } catch(e){} }
        // After confirmation, return to the home screen (requested UX).
        setTimeout(() => { try { _navTo('home', null, true); } catch(e){} }, 700);
    }
}
async function _changePassword() {
    const np = prompt('Enter new password (min 8 chars):');
    if (!np || np.length<8) { _toast('Password too short','err'); return; }
    const { error } = await sb.auth.updateUser({ password: np });
    _toast(error ? 'Failed: '+error.message : 'Password changed ✓', error?'err':'ok');
}

function _el(id) { return document.getElementById(id); }
function x(s)    { return window.escapeHtml(s); }   // canonical impl in js/utils/text.js
function _init(n){ return (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2)||'?'; }
function _avatarHTML(photoUrl, name, bg, cls='m-av') {
    const initials = _init(name);
    const bgStyle  = `background:${bg||'var(--accent)'};`;
    if (!photoUrl) return `<div class="${cls}" style="${bgStyle}">${initials}</div>`;
    const esc = photoUrl.replace(/'/g,"%27");
    // onerror: capture the parent FIRST and set style BEFORE innerHTML. Writing
    // innerHTML detaches this <img>, so touching this.parentElement AFTER it is null
    // — that was the repeated "Cannot read properties of null (reading 'style')".
    return `<div class="${cls}" style="${bgStyle}overflow:hidden;">` +
        `<img src="${esc}" style="width:100%;height:100%;object-fit:cover;display:block;" ` +
        `onerror="var p=this.parentElement;if(p){p.style.overflow='';p.innerHTML='${initials.replace(/'/g,"&#39;")}';}"></div>`;
}
function _sentenceCase(s){ s=(s||'').trim(); return s ? s[0].toUpperCase()+s.slice(1).toLowerCase() : s; }
// Normalize a DB timestamp to an unambiguous UTC instant: append Z when there is no
// timezone marker, and use 'T' (Safari rejects the space form). Makes IST conversion
// correct on ANY device timezone.
function _normTs(ts) {
    if (typeof ts !== 'string') return ts;
    const hasTz = ts.indexOf('Z') !== -1 || /[+-]\d\d:?\d\d$/.test(ts);
    return hasTz ? ts.replace(' ', 'T') : ts.replace(' ', 'T') + 'Z';
}
function _fmtIST(ts, withTime=true) {
    if (!ts) return '';
    const d = new Date(_normTs(ts));
    if (isNaN(d)) return '';
    const opts = { day:'2-digit', month:'short', year:'2-digit', timeZone:'Asia/Kolkata' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hour12 = true; }
    return new Intl.DateTimeFormat('en-IN', opts).format(d);
}
function _uname(id){ const u=_users.find(u=>u.id===id) || (window.globalUsersCache||[]).find(u=>u.id===id); return u ? (u.full_name||u.email?.split('@')[0]||'User') : 'User'; }
function _dmRoom(uid){ return ['dm',...[_uid,uid].sort()].join('_'); }
function _snip(h,n){ return window.snippet(h,n); }   // canonical impl in js/utils/text.js
const _istFmt12 = new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'});
const _istFmtDate = new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Kolkata'});
function _ago(ts){
    if(!ts) return '';
    const utc = _normTs(ts);
    const d=(Date.now()-new Date(utc))/1000;
    const result = d<60 ? 'just now' : d<3600 ? Math.floor(d/60)+'m ago'
        : d<86400 ? Math.floor(d/3600)+'h ago'
        : d<604800 ? Math.floor(d/86400)+'d ago'
        : _istFmtDate.format(new Date(utc));
    return result;
}
function _scrollTop(id){ const el=_el(id); if(el) el.scrollTop=0; }
function _toast(msg, type='ok'){
    const t = _el('mToast');
    if(!t) return;
    t.textContent = msg;
    t.className = 'toast-show '+(type==='err'?'toast-err':'toast-ok');
    clearTimeout(t._timer);
    t._timer = setTimeout(()=>t.className='', 2500);
}
// Expose so the shared web toast can route here on mobile (single toast, at top).
window._mobToast = _toast;

// WhatsApp-style heads-up banner: slides down from the top for a moment when a
// message arrives while the app is OPEN (the OS push only fires when closed).
// Shows avatar + sender + snippet, taps through to the chat, auto-dismisses.
let _headsUpTimer = null;
function _showHeadsUp(m, name, isDM, dept, isMention) {
    // A mention alert shows even while viewing the chat; a normal one does not.
    const top = _stack[_stack.length-1];
    if (!isMention && top && top.params?.room === m.room_id) return;
    let el = _el('mHeadsUp');
    if (!el) {
        el = document.createElement('div');
        el.id = 'mHeadsUp';
        document.getElementById('mobileApp')?.appendChild(el) || document.body.appendChild(el);
    }
    el.classList.toggle('mention', !!isMention);
    const sender = _users.find(u => u.id === m.sender_id);
    const avatar = isDM
        ? _avatarHTML(sender?.avatar_url, name, 'var(--accent)', 'm-av-sm')
        : _avatarHTML(_lsGet('dept_photo_'+m.room_id) || dept?.photo, dept?.name || name, dept?.col || 'var(--accent)', 'm-av-sm sq');
    // Same shape as the OS push (WhatsApp-style):
    //   DM    → title = sender,      body = message
    //   Group → title = group name,  body = "Sender: message"
    const groupName = dept?.name || 'Group';
    const line1 = isMention
        ? `📣 ${x(name)} mentioned you${isDM ? '' : ' · ' + x(groupName)}`
        : (isDM ? x(name) : x(groupName));
    const bodyTxt = isDM ? x(_snip(m.text, 90)) : `${x(name)}: ${x(_snip(m.text, 90))}`;
    el.innerHTML =
        `<div class="m-hu-ico">${avatar}</div>
         <div class="m-hu-txt"><div class="m-hu-title">${line1}</div>
           <div class="m-hu-body">${isMention ? '📣 ' : ''}${bodyTxt}</div></div>`;
    // Tap → open the chat.
    el.onclick = () => {
        _dismissHeadsUp();
        if (isDM) {
            const other = m.room_id.replace('dm_','').split('_').find(id => id !== _uid);
            _navTo('dm', { room: m.room_id, uid: other, name });
        } else {
            _navTo('groupChat', { room: m.room_id, name: dept?.name || name, color: dept?.col || '#6366f1' });
        }
    };
    // Slide in, then auto-dismiss after ~4s.
    requestAnimationFrame(() => el.classList.add('show'));
    try { window.playSound?.('message'); } catch(e){}   // playSound respects the sound setting
    try { navigator.vibrate?.(15); } catch(e){}
    clearTimeout(_headsUpTimer);
    _headsUpTimer = setTimeout(_dismissHeadsUp, 4200);
}
function _dismissHeadsUp() {
    const el = _el('mHeadsUp');
    if (el) el.classList.remove('show');
}

function _injectCSS(){
    if(_el('mCSS')) return;
    const s=document.createElement('style'); s.id='mCSS';
    s.textContent=`
#mobileApp{position:fixed;inset:0;display:flex;flex-direction:column;
  background:var(--bg-body,#fff);color:var(--text-primary,#111);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  z-index:9999;overflow:hidden;
  /* Native-app feel: no double-tap zoom, no pull-to-refresh page reload,
     no rubber-band overscroll chaining, no grey tap flash. */
  touch-action:manipulation;overscroll-behavior:none;
  -webkit-tap-highlight-color:transparent;}
/* UI chrome (nav, headers, buttons, list rows) must not be text-selectable —
   selecting a tab label on long-press reads as "web page", not native app. */
#mobileApp button,#mNav,.m-hdr,.m-row,.mn-lbl,.m-sl,.m-sheet-row,.m-htitle,
.m-sb-info,.af-card,.m-chip{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
/* Inner scrollers must not chain overscroll to the page. */
.m-msgs,.mScr,.mScr-inner,#mSheetInner{overscroll-behavior:contain;}

#mSB{display:flex;align-items:center;gap:6px;
  padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;flex-shrink:0;position:relative;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-sb-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;cursor:pointer;}
.m-sb-user{font-size:16.5px;font-weight:700;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-sb-school-card{font-size:13px;font-weight:700;letter-spacing:.03em;
  color:var(--accent,#6366f1);background:linear-gradient(145deg,var(--bg-body,#fff),var(--bg-sidebar,#eef0f3));
  border:1px solid var(--border-color,#e5e7eb);border-radius:8px;
  padding:3px 9px;display:inline-block;width:fit-content;
  box-shadow:0 1px 0 rgba(255,255,255,.7) inset, 0 2px 4px rgba(0,0,0,.12), 0 1px 0 rgba(0,0,0,.04);
  text-shadow:0 1px 0 rgba(255,255,255,.4);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
.m-sb-search{flex:1;display:flex;}
.m-sb-search input{flex:1;border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:18px;padding:8px 14px;font-size:14px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;}
.m-sb-search input:focus{border-color:var(--accent,#6366f1);}
.m-sb-icon{background:none;border:none;font-size:18px;cursor:pointer;
  color:var(--text-secondary,#6b7280);padding:6px;flex-shrink:0;min-width:36px;min-height:36px;
  -webkit-tap-highlight-color:transparent;}
.m-sb-icon:active{opacity:.6;}
.m-presence-dot{position:absolute;bottom:-1px;right:-1px;width:14px;height:14px;border-radius:50%;
  background:#15803d;border:2.5px solid var(--bg-body,#fff);pointer-events:none;}
.m-conn{margin-left:8px;font-size:11px;font-weight:700;letter-spacing:.02em;vertical-align:middle;}
.m-notif-badge{position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;
  font-size:10px;font-weight:800;min-width:16px;height:16px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;padding:0 4px;
  border:2px solid var(--bg-sidebar,#f6f8fa);line-height:1;}
#mSBResults{position:absolute;top:100%;left:0;right:0;max-height:0;overflow:hidden;
  background:var(--bg-body,#fff);border-bottom:1px solid var(--border-color,#e5e7eb);
  box-shadow:0 8px 20px rgba(0,0,0,.12);z-index:50;transition:max-height .2s;}
#mSBResults.open{max-height:60vh;overflow-y:auto;}

#mStage{flex:1;overflow:hidden;position:relative;}
.mScr{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  display:flex;flex-direction:column;background:var(--bg-body,#fff);}
.mScr-inner{overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;}
.mFlex{display:flex;flex-direction:column;height:100%;overflow:hidden;}
/* Loading skeleton — shown for the split-second before a screen's data resolves */
.m-sk{padding:8px 16px;}
.m-skrow{display:flex;align-items:center;gap:12px;padding:12px 0;}
.m-skav{width:44px;height:44px;border-radius:14px;flex:0 0 auto;background:var(--border-color,#e5e7eb);}
.m-sklines{flex:1;display:flex;flex-direction:column;gap:8px;}
.m-skl{height:11px;border-radius:6px;background:var(--border-color,#e5e7eb);width:70%;}
.m-skl.short{width:40%;height:9px;}
.m-skav,.m-skl{position:relative;overflow:hidden;}
.m-skav::after,.m-skl::after{content:'';position:absolute;inset:0;transform:translateX(-100%);
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:mshimmer 1.2s infinite;}
@keyframes mshimmer{100%{transform:translateX(100%);}}
.slide-fwd{animation:sfwd .25s cubic-bezier(.4,0,.2,1);}
.slide-back{animation:sback .25s cubic-bezier(.4,0,.2,1);}
.slide-up{animation:sup .28s cubic-bezier(.4,0,.2,1);}
.slide-down{animation:sdown .22s cubic-bezier(.4,0,.2,1);}
@keyframes sup{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes sdown{from{transform:translateY(40%);opacity:.4}to{transform:translateY(0);opacity:1}}
@keyframes sfwd{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes sback{from{transform:translateX(-30%)}to{transform:translateX(0)}}

#mNav{display:flex;background:var(--bg-sidebar,#f6f8fa);
  border-top:1.5px solid var(--border-color,#e5e7eb);
  padding-bottom:env(safe-area-inset-bottom,0);flex-shrink:0;}
.mn-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;padding:7px 1px 7px;font-size:21px;
  color:var(--text-secondary,#8a90a2);border:none;background:none;
  cursor:pointer;-webkit-tap-highlight-color:transparent;min-height:58px;}
/* Icon sits in a pill that lights up on the active tab (Slack/WhatsApp feel). */
.mn-btn i{padding:5px 17px;border-radius:16px;
  transition:transform .2s cubic-bezier(.34,1.56,.64,1),background .18s ease,color .18s ease;}
.mn-lbl{font-size:10.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;transition:color .18s;}
.mn-btn.active{color:var(--accent,#6366f1);}
.mn-btn.active i{background:rgba(99,102,241,.14);transform:translateY(-1px);}
.mn-btn:active i{transform:scale(.9);}
html[data-theme="dark"] .mn-btn.active i{background:rgba(129,140,248,.2);}
.mn-btn i{transition:transform .2s;}

.m-hdr{display:flex;align-items:center;gap:10px;padding:calc(11px + env(safe-area-inset-top,0px)) 16px 11px;flex-shrink:0;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-hdr-plain{padding:14px 16px;}
.m-back{background:var(--bg-body,#fff);border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:50%;width:40px;height:40px;font-size:17px;color:var(--accent,#6366f1);
  cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  -webkit-tap-highlight-color:transparent;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.m-back:active{background:var(--bg-sidebar,#f6f8fa);}
.m-htitle{font-size:19.5px;font-weight:700;flex:1;color:var(--text-primary,#111);}

.m-sl{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
  color:var(--text-secondary,#6b7280);padding:14px 16px 7px;}
.m-row{display:flex;align-items:center;gap:13px;padding:13px 16px;
  border-bottom:1px solid var(--border-color,#e5e7eb);cursor:pointer;min-height:68px;
  -webkit-tap-highlight-color:transparent;}
.m-row:active{background:var(--bg-sidebar,#f6f8fa);}
.m-av{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:17px;flex-shrink:0;}
.m-av-sm{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:13px;flex-shrink:0;}
.sq{border-radius:14px!important;}
.m-av-photo{background-size:cover;background-position:center;color:transparent!important;}
.m-av-wrap{position:relative;flex-shrink:0;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.m-av-cam{position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-radius:50%;
  background:var(--accent,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;
  font-size:9px;border:2px solid var(--bg-body,#fff);}
.m-av-wrap-lg{width:84px;height:84px;}
.m-av-lg{width:84px!important;height:84px!important;font-size:30px!important;}
.m-ri{flex:1;min-width:0;}
.m-rn{font-size:17px;font-weight:600;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-rs{font-size:14.5px;color:var(--text-secondary,#6b7280);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-chv{color:var(--text-secondary,#9ca3af);font-size:13px;}

.m-msgs{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 0;position:relative;}
.m-bubble-row{display:flex;margin:8px 12px;gap:6px;align-items:flex-end;transition:transform .1s ease;}
.m-av-tiny{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:10.5px;flex-shrink:0;}
.m-bubble-row.snt{justify-content:flex-end;}
.m-bubble-row.rcv{justify-content:flex-start;}
.m-bubble{width:90%;max-width:90%;min-width:0;padding:12px 15px 13px;border-radius:14px;position:relative;
  font-size:16px;line-height:1.5;word-break:break-word;overflow:hidden;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border:1px solid var(--border-color,#e5e7eb);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
/* Sent = tinted + right-aligned + rounded on the left; Received = white + left-aligned.
   Together with the row alignment this makes who-sent-what obvious at a glance. */
.m-bubble.snt{background:color-mix(in srgb,var(--accent,#6366f1) 12%,#fff);
  border-color:color-mix(in srgb,var(--accent,#6366f1) 22%,transparent);
  border-left:4px solid var(--accent,#6366f1);border-right-width:1px;
  border-radius:14px 14px 4px 14px;}
.m-bubble.rcv{border-right:4px solid var(--accent,#6366f1);border-left-width:1px;
  border-radius:14px 14px 14px 4px;}
.m-bmeta{font-size:12.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-bottom:4px;}
.m-edited{font-size:10px;font-weight:400;color:var(--text-secondary,#9ca3af);font-style:italic;margin-left:3px;}
.m-highlight{animation:m-glow-pulse 3s ease-out;}
/* ── BELL Notifications (attention) — a compact, actionable list, visually
   distinct from the Activity timeline. Auto-clears as items are opened. ── */
.nf-mode .af-feed{background:var(--bg-body,#fff);padding:6px 0 90px;gap:0;}
.nf-mode .af-div span{background:transparent;color:var(--text-secondary,#94a3b8);font-size:11px;letter-spacing:.4px;padding-left:16px;}
.nf-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border,#eef1f5);background:transparent;position:relative;cursor:pointer;}
.nf-row:active{background:rgba(37,99,235,.06);}
.nf-row.unread{background:rgba(37,99,235,.055);box-shadow:inset 3px 0 0 #2563eb;}
.nf-ic{width:38px;height:38px;flex:0 0 auto;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;background:var(--surface,#f1f5f9);}
.nf-ic.blue{background:rgba(37,99,235,.12);}.nf-ic.orange{background:rgba(249,115,22,.14);}
.nf-ic.green{background:rgba(34,197,94,.14);}.nf-ic.purple{background:rgba(168,85,247,.14);}
.nf-body{flex:1;min-width:0;}
.nf-title{font-size:14px;color:var(--text-primary,#111);line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.nf-row.unread .nf-title{font-weight:600;}
.nf-time{font-size:11.5px;color:var(--text-secondary,#94a3b8);margin-top:3px;}
.nf-dot{width:9px;height:9px;border-radius:50%;background:#2563eb;flex:0 0 auto;}
.nf-clear{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:none;background:transparent;
  color:var(--text-secondary,#9ca3af);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.nf-clear:active{background:rgba(148,163,184,.2);}
html[data-theme="dark"] .nf-row.unread{background:rgba(37,99,235,.14);}
html[data-theme="dark"] .nf-ic{background:#1e1e1e;}
/* Activity timeline (persistent feed) keeps its coloured rail cards + adds a
   subtle timeline rail so it reads clearly as a "feed", not the bell list. */
.af-mode .af-feed{position:relative;}
/* ── Activity Feed ─────────────────────────────────────────── */
.af-filters{display:flex;gap:8px;overflow-x:auto;padding:10px 14px;border-bottom:1px solid var(--border,#eef1f5);-ms-overflow-style:none;scrollbar-width:none;}
.af-filters::-webkit-scrollbar{display:none;}
.af-pill{background:var(--surface,#f1f5f9);color:var(--text-secondary,#475569);padding:6px 14px;border-radius:40px;font-size:12.5px;font-weight:600;white-space:nowrap;border:none;cursor:pointer;flex-shrink:0;}
.af-pill.active{background:#1e293b;color:#fff;}
.af-senders{padding-top:0;border-bottom:1px solid var(--border,#eef1f5);}
.af-pill.sm{font-size:12px;padding:5px 12px;background:var(--surface,#eef2f7);}
.af-selrow{gap:10px;}
.af-select{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text,#0f172a);
  background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:8px 10px;cursor:pointer;
  -webkit-appearance:none;appearance:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}
.af-select:disabled{opacity:.5;}
.af-clear{position:absolute;top:10px;right:10px;width:26px;height:26px;border-radius:50%;border:none;
  background:rgba(148,163,184,.14);color:#64748b;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;}
.af-clear:active{background:rgba(148,163,184,.3);}
.af-feed{padding:12px 14px 90px;display:flex;flex-direction:column;gap:14px;background:#F8FAFC;min-height:100%;}
.af-div{display:flex;align-items:center;gap:10px;margin:2px 0;}
.af-div span{font-size:11.5px;font-weight:700;color:var(--text-secondary,#64748b);background:var(--surface,#f1f5f9);padding:3px 12px;border-radius:30px;}
.af-div .ln{flex:1;height:1px;background:var(--border,#e2e8f0);}
/* NO entrance animation on .af-card: the feed re-renders on live events/polls, and
   an animation here replays on EVERY render → the whole feed flickered. Static. */
.af-card{background:#FFFFFF;border-radius:16px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);border-left:4px solid #94a3b8;position:relative;}
/* Category left-border — exact palette */
.af-card.blue{border-left-color:#2563EB;}.af-card.orange{border-left-color:#F97316;}
.af-card.green{border-left-color:#22C55E;}.af-card.purple{border-left-color:#A855F7;}
.af-card.unread{background:#F8FBFF;}
.af-card.unread::before{content:'●';position:absolute;top:15px;right:44px;color:#2563EB;font-size:9px;}
.af-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 10px;border-radius:40px;background:#f1f5f9;color:#475569;display:inline-block;margin-bottom:6px;}
.af-badge.blue{background:#DBEAFE;color:#2563EB;}.af-badge.orange{background:#FFEDD5;color:#F97316;}
.af-badge.green{background:#DCFCE7;color:#16A34A;}.af-badge.purple{background:#F3E8FF;color:#A855F7;}
.af-title{font-size:14.5px;font-weight:600;color:var(--text,#0f172a);margin-bottom:3px;display:flex;align-items:center;gap:6px;}
.af-desc{font-size:13.5px;color:var(--text-secondary,#334155);line-height:1.5;margin-bottom:3px;}
.af-meta{font-size:11.5px;color:var(--text-secondary,#94a3b8);margin-top:5px;}
.af-actions{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap;}
.af-btn{padding:6px 15px;border-radius:40px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#f1f5f9;color:#1e293b;}
.af-btn.primary{background:#2563eb;color:#fff;}.af-btn.success{background:#22c55e;color:#fff;}
.af-empty{text-align:center;padding:48px 20px;color:var(--text-secondary,#94a3b8);}
.af-empty .em{font-size:46px;margin-bottom:10px;}
.af-empty .t{font-weight:700;font-size:16px;color:var(--text-secondary,#475569);}
.mn-badge{position:absolute;top:2px;left:50%;margin-left:8px;right:auto;background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:30px;border:2px solid var(--bg,#fff);}
@keyframes af-up{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}
@keyframes m-glow-pulse{
  0%   { background:color-mix(in srgb, var(--accent) 35%, var(--card-bg)); box-shadow:0 0 0 3px var(--accent); }
  60%  { background:color-mix(in srgb, var(--accent) 22%, var(--card-bg)); box-shadow:0 0 0 2px var(--accent); }
  100% { background:var(--card-bg); box-shadow:none; }
}
.m-link-pill{white-space:normal!important;word-break:break-word;max-width:100%;height:auto!important;text-align:left;}
.m-btext{font-size:18px;line-height:1.55;color:var(--text-primary,#111);
  word-break:break-word;overflow-wrap:anywhere;min-width:0;max-width:100%;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.m-btext .m-img-preview,.m-btext .m-file-card,.m-btext img{max-width:100%;box-sizing:border-box;}
.m-divider{text-align:center;font-size:11px;color:var(--text-secondary);padding:8px 0;}
.m-bubble-pending{opacity:.55;transition:opacity .3s ease;}
.m-pending-indicator{display:flex;justify-content:flex-end;margin-top:4px;color:var(--text-secondary,#9ca3af);}
@keyframes spin{to{transform:rotate(360deg);}}

.m-scrollfab{position:absolute;right:14px;bottom:78px;width:38px;height:38px;border-radius:50%;
  background:var(--bg-body,#fff);border:1px solid var(--border-color,#e5e7eb);
  box-shadow:0 3px 10px rgba(0,0,0,.18);color:var(--accent,#6366f1);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:20;
  -webkit-tap-highlight-color:transparent;}
.m-scrollfab:active{opacity:.8;}
.m-scrollfab-top{bottom:124px;}

.m-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.m-reply-count{font-size:11.5px;font-weight:700;color:var(--accent,#6366f1);margin-top:6px;cursor:pointer;
  display:inline-block;padding:2px 0;-webkit-tap-highlight-color:transparent;}
.m-reply-count:active{opacity:.6;}
.m-thread-link{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;
  color:var(--accent,#6366f1);cursor:pointer;margin-top:6px;background:color-mix(in srgb,var(--accent) 10%,transparent);
  border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:12px;
  padding:4px 12px;-webkit-tap-highlight-color:transparent;}
.m-thread-link:active{opacity:.6;}
.m-thread-parent{background:color-mix(in srgb,var(--accent) 6%,var(--bg-body,#f9fafb));
  border-left:3px solid var(--accent,#6366f1);border-radius:8px;padding:10px 14px;margin:10px 12px 0;}
.m-thread-sep{font-size:12px;font-weight:700;color:var(--text-secondary,#6b7280);
  padding:10px 16px 4px;letter-spacing:.04em;text-transform:uppercase;}
.m-chip{font-size:13px;font-weight:600;background:var(--bg-sidebar,#f6f8fa);
  border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:3px 9px;
  cursor:pointer;color:var(--text-primary,#111);-webkit-tap-highlight-color:transparent;}
.m-chip.mine{background:color-mix(in srgb, var(--accent) 12%, var(--bg-sidebar));border-color:var(--accent);}
.m-chip-cnt{font-size:11px;color:var(--text-secondary);}
.m-chip-tag{background:none;}
.m-emoji-btn{font-size:34px;background:none;border:none;cursor:pointer;padding:8px;border-radius:10px;line-height:1;}
.m-emoji-btn:active{background:var(--bg-sidebar);}
.m-tag-btn{font-size:13px;font-weight:700;background:none;border:1.5px solid;padding:8px 14px;
  border-radius:20px;cursor:pointer;}

.m-composer{display:flex;align-items:center;gap:8px;padding:8px 10px;
  background:var(--bg-sidebar,#f6f8fa);border-top:1px solid var(--border-color,#e5e7eb);flex-shrink:0;}
.m-ce-wrap{flex:1;background:var(--bg-body,#fff);border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:24px;display:flex;align-items:flex-end;min-height:44px;max-height:130px;
  padding:2px 4px;}
.m-cic{background:none;border:none;font-size:18px;color:var(--text-secondary,#6b7280);
  cursor:pointer;padding:9px 5px;flex-shrink:0;-webkit-tap-highlight-color:transparent;min-height:40px;align-self:flex-end;}
.m-cic:active{opacity:.6;}
.m-ce{flex:1;outline:none;font-size:16px;line-height:1.4;padding:11px 4px;max-height:120px;overflow-y:auto;
  color:var(--text-primary,#111);word-break:break-word;}
.m-ce:empty:before{content:attr(data-placeholder);color:var(--text-secondary,#9ca3af);}
.m-ce a{color:var(--accent,#6366f1);text-decoration:underline;}
.m-sendbtn{background:var(--accent,#6366f1);border:none;color:#fff;flex-shrink:0;
  width:44px;height:44px;border-radius:50%;font-size:17px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;}
.m-sendbtn:active{opacity:.8;}

.m-fmt-popup{position:fixed;display:none;gap:2px;background:#1f2937;border-radius:10px;
  padding:4px;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:10500;}
.m-fmt-popup button{background:none;border:none;color:#fff;font-size:15px;width:34px;height:34px;
  border-radius:7px;cursor:pointer;}
.m-fmt-popup button:active{background:rgba(255,255,255,.15);}

.m-inp{flex:1;border:1.5px solid var(--border-color,#e5e7eb);border-radius:14px;
  padding:11px 14px;font-size:16px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;min-height:46px;width:100%;box-sizing:border-box;}
.m-inp:focus{border-color:var(--accent,#6366f1);}

.m-taskcard{margin:10px 14px;padding:16px;border-radius:14px;cursor:pointer;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border-left:4px solid var(--accent,#6366f1);border-top:1px solid var(--border-color,#e5e7eb);
  border-right:1px solid var(--border-color,#e5e7eb);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-taskcard:active{opacity:.85;}
.m-tc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.m-tc-title{font-size:17px;font-weight:700;flex:1;line-height:1.4;}
.m-badge{font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
.m-tc-meta{display:flex;gap:12px;margin-top:8px;font-size:14px;color:var(--text-secondary,#6b7280);}
.m-file-link{background:var(--bg-sidebar,#f6f8fa);border:1px solid var(--border-color,#e5e7eb);
  border-radius:8px;padding:6px 12px;font-size:13.5px;color:var(--accent,#6366f1);font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent;}
.m-file-link:active{opacity:.7;}
.m-file-link i{font-size:11px;}
.m-tc-people{margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color,#e5e7eb);
  display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--text-secondary,#6b7280);}

.m-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.m-theme-pill{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:12px;
  border:1.5px solid var(--border-color,#e5e7eb);background:var(--bg-body,#fff);
  font-size:14px;font-weight:600;color:var(--text-primary,#111);cursor:pointer;
  -webkit-tap-highlight-color:transparent;}
.m-theme-pill.active{border-color:var(--accent,#6366f1);background:color-mix(in srgb, var(--accent) 8%, var(--bg-body));}
.m-theme-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;}

.m-detail-row{display:flex;align-items:center;justify-content:space-between;
  padding:12px 0;border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-detail-lbl{font-size:13.5px;font-weight:600;color:var(--text-secondary,#6b7280);}
.m-detail-val{font-size:15px;font-weight:600;}
.m-sel{border:1.5px solid var(--border-color,#e5e7eb);border-radius:10px;
  padding:9px 12px;font-size:15px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;min-height:44px;width:100%;box-sizing:border-box;}
.m-field{display:flex;flex-direction:column;gap:5px;}
.m-label{font-size:12px;font-weight:700;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:.05em;}
.m-action-btn{display:flex;align-items:center;justify-content:center;gap:8px;
  padding:13px 20px;border-radius:12px;border:none;color:#fff;
  font-size:15px;font-weight:700;cursor:pointer;min-height:50px;width:100%;box-sizing:border-box;
  -webkit-tap-highlight-color:transparent;}
.m-action-btn:active{opacity:.8;}
.m-icon-btn{background:none;border:none;cursor:pointer;font-size:17px;
  padding:8px;color:var(--text-secondary,#6b7280);-webkit-tap-highlight-color:transparent;
  min-width:40px;min-height:40px;}

.m-stat-card{border-radius:14px;padding:18px;text-align:center;}
.m-stat-num{font-size:28px;font-weight:800;line-height:1;}
.m-stat-lbl{font-size:12.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-top:4px;}

#mSheet{position:fixed;inset:0;background:rgba(0,0,0,0);z-index:10000;
  pointer-events:none;transition:background .25s;display:flex;align-items:flex-end;}
#mSheet.open{background:rgba(0,0,0,.45);pointer-events:all;}
#mSheetInner{width:100%;margin-top:auto;background:var(--bg-body,#fff);
  border-radius:22px 22px 0 0;max-height:85vh;max-height:85dvh;overflow-y:auto;
  transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);
  padding-bottom:env(safe-area-inset-bottom,0);}
#mSheet.open #mSheetInner{transform:translateY(0);}
.m-sheet-handle{width:40px;height:4px;background:var(--border-color,#e5e7eb);
  border-radius:2px;margin:12px auto 4px;}
.m-sheet-title{font-size:16px;font-weight:700;padding:8px 16px 12px;
  border-bottom:1px solid var(--border-color,#e5e7eb);margin-bottom:4px;}
.m-sheet-row{display:flex;align-items:center;gap:14px;padding:14px 16px;
  font-size:15px;cursor:pointer;border-radius:12px;margin:2px 8px;
  -webkit-tap-highlight-color:transparent;}
.m-sheet-row:active{background:var(--bg-sidebar,#f6f8fa);}
.m-sheet-row i{width:24px;text-align:center;font-size:18px;}

#mToast{position:fixed;top:calc(env(safe-area-inset-top,0px) + 72px);left:50%;transform:translateX(-50%);
  padding:11px 20px;border-radius:16px;font-size:14px;font-weight:600;
  color:#1f2937;z-index:11000;opacity:0;transition:opacity .2s;pointer-events:none;
  white-space:normal;max-width:88vw;text-align:center;line-height:1.4;
  background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  border:1px solid rgba(0,0,0,.08);box-shadow:0 6px 22px rgba(0,0,0,.18);}
.toast-ok{opacity:1!important;}
.toast-err{opacity:1!important;color:#b91c1c;border-color:rgba(239,68,68,.35);}

/* WhatsApp-style heads-up notification banner (in-app, app open) */
#mHeadsUp{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:10px;right:10px;
  z-index:11500;display:flex;align-items:center;gap:11px;padding:10px 13px;
  background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);
  border-radius:16px;box-shadow:0 8px 26px rgba(0,0,0,.22);
  transform:translateY(-140%);opacity:0;transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .25s;
  cursor:pointer;-webkit-tap-highlight-color:transparent;max-width:560px;margin:0 auto;}
#mHeadsUp.show{transform:translateY(0);opacity:1;}
#mHeadsUp .m-hu-ico{flex-shrink:0;}
#mHeadsUp .m-hu-txt{min-width:0;flex:1;}
#mHeadsUp .m-hu-title{font-size:13.5px;font-weight:700;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#mHeadsUp .m-hu-body{font-size:13px;color:var(--text-secondary,#667781);margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
html[data-theme="dark"] #mHeadsUp{background:#1e1e1e;border-color:#333;}
#mHeadsUp.mention{border-color:var(--accent,#4f46e5);border-left:4px solid var(--accent,#4f46e5);
  background:color-mix(in srgb,var(--accent,#4f46e5) 8%,var(--card-bg,#fff));}
#mHeadsUp.mention .m-hu-title{color:var(--accent,#4f46e5);}

/* @mention chip (in bubbles + composer) */
.mention{color:var(--accent,#4f46e5);font-weight:700;background:color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent);
  border-radius:5px;padding:0 3px;white-space:nowrap;}
/* @mention picker above the composer */
#mMentionBox{position:absolute;left:10px;right:10px;bottom:70px;z-index:11400;
  background:var(--card-bg,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:14px;
  box-shadow:0 8px 26px rgba(0,0,0,.18);overflow:hidden;display:none;max-height:220px;overflow-y:auto;}
#mMentionBox.show{display:block;}
.m-mention-item{display:flex;align-items:center;gap:10px;padding:9px 13px;cursor:pointer;font-size:14px;
  font-weight:600;color:var(--text-primary,#111);}
.m-mention-item:active{background:color-mix(in srgb,var(--accent,#4f46e5) 10%,transparent);}
html[data-theme="dark"] #mMentionBox{background:#1e1e1e;border-color:#333;}

.m-empty{padding:40px 20px;text-align:center;color:var(--text-secondary,#6b7280);
  font-size:14.5px;line-height:1.7;}

/* Shimmer skeleton placeholders — native-style loading instead of a spinner */
.skel{background:linear-gradient(90deg,var(--bg-sidebar,#eef1f5) 25%,var(--border-color,#e2e6ee) 50%,var(--bg-sidebar,#eef1f5) 75%);
  background-size:200% 100%;animation:skelShimmer 1.4s infinite linear;border-radius:12px;}
@keyframes skelShimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
.skel-bubble{height:64px;margin:10px 12px;width:88%;}
.skel-bubble.r{margin-left:auto;width:70%;height:48px;}

/* ── v29 UX additions ─────────────────────────────────────────────── */

/* Role chips */
.m-role-chip{display:inline-block;font-size:9px;font-weight:800;letter-spacing:.4px;
  color:#fff;border-radius:6px;padding:1px 5px;text-transform:uppercase;vertical-align:middle;
  margin-left:4px;line-height:1.5;}

/* Online dot */
.m-online-dot{position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;
  border:2px solid var(--bg-sidebar,#f6f8fa);z-index:2;}

/* Unread badge on home tiles */
.m-unread-badge{background:#ef4444;color:#fff;font-size:11px;font-weight:800;
  border-radius:12px;padding:2px 7px;min-width:20px;text-align:center;flex-shrink:0;
  line-height:1.6;}

/* Chat header enhancements */
.m-htitle-wrap{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;}
.m-hsubtitle{font-size:11px;color:var(--text-secondary,#6b7280);font-weight:500;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-hdr-menu{background:none;border:none;font-size:18px;color:var(--text-secondary,#6b7280);
  cursor:pointer;padding:8px;flex-shrink:0;-webkit-tap-highlight-color:transparent;}
.m-hdr-menu:active{opacity:.6;}
.m-hdr-action{background:none;border:none;font-size:13px;font-weight:700;
  color:var(--accent,#6366f1);cursor:pointer;padding:6px 10px;border-radius:8px;
  -webkit-tap-highlight-color:transparent;}
.m-hdr-action:active{opacity:.6;}

/* Message status ticks */
.m-status-row{display:flex;justify-content:flex-end;margin-top:3px;}
.m-tick{font-size:10.5px;letter-spacing:.3px;text-transform:uppercase;}
.m-tick.sent{color:#7b1e3a;font-weight:600;}
.m-tick.read{color:#166534;font-weight:700;}
.m-tick.pending{color:#7b1e3a;font-weight:600;text-transform:none;}

/* Typing indicator */
.m-typing-area{min-height:0;padding:0 14px;transition:min-height .2s;}
.m-typing-area:not(:empty){min-height:28px;padding:4px 14px;}
.m-typing{display:flex;align-items:center;gap:8px;}
.m-typing-text{font-size:12px;color:var(--text-secondary,#6b7280);font-style:italic;}
.m-typing-dots{display:flex;gap:3px;align-items:center;}
.m-typing-dots span{width:5px;height:5px;border-radius:50%;background:var(--text-secondary,#9ca3af);
  animation:typingBounce 1.2s ease-in-out infinite;}
.m-typing-dots span:nth-child(2){animation-delay:.2s;}
.m-typing-dots span:nth-child(3){animation-delay:.4s;}
@keyframes typingBounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);}}

/* Notification date group label */
.m-notif-day{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:var(--text-secondary,#6b7280);padding:12px 16px 4px;}

/* Notification unread dot */
.m-notif-dot{position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;
  background:#ef4444;border:2px solid var(--bg-sidebar,#f6f8fa);}

/* ══ DARK THEME — Instagram-calibre, NILTASK identity ═══════════════════════
   Instagram dark structure (true-black ground #000, #121212/#1e1e1e surfaces,
   #f5f5f5/#a8a8a8 text, #262626 hairlines) with our own indigo accent — unique,
   fully legible, zero eye strain (no pure-white blocks, muted secondaries). */
html[data-theme="dark"] #mobileApp{
  --bg-body:#000000; --bg-sidebar:#121212; --card-bg:#1e1e1e; --bg:#121212;
  --border-color:#262626; --border:#262626; --surface:#1e1e1e;
  --text-primary:#f5f5f5; --text-secondary:#a8a8a8; --text:#f5f5f5;
  --accent:#8b9dff; --card-shadow:none;
  background:#000000; color:#f5f5f5;}
html[data-theme="dark"] .m-msgs{background:#000000;}
html[data-theme="dark"] .m-bubble{background:#1e1e1e;border-color:#262626;box-shadow:none;}
html[data-theme="dark"] .m-bubble.snt{background:#232a4d;border-color:#2e3763;border-left-color:#8b9dff;}
html[data-theme="dark"] .m-btext,html[data-theme="dark"] .m-ce{color:#f5f5f5;}
html[data-theme="dark"] .m-bmeta,html[data-theme="dark"] .m-edited{color:#a8a8a8;}
html[data-theme="dark"] .m-ce-wrap{background:#1e1e1e;border-color:#333;}
html[data-theme="dark"] .m-ce:empty:before{color:#8a8a8a;}
html[data-theme="dark"] .m-composer{background:#121212;border-top-color:#262626;}
html[data-theme="dark"] .m-cic{color:#a8a8a8;}
html[data-theme="dark"] .m-sendbtn{background:#5b6cff;}
html[data-theme="dark"] #mToast{background:rgba(30,30,30,.97);color:#f5f5f5;border-color:rgba(255,255,255,.12);}
html[data-theme="dark"] #mToast.toast-err{color:#ff7b7b;border-color:rgba(255,123,123,.4);}
html[data-theme="dark"] .m-chip{background:#1e1e1e;border-color:#333;color:#f5f5f5;}
html[data-theme="dark"] .m-chip.mine{background:#232a4d;border-color:#8b9dff;}
html[data-theme="dark"] .m-back{background:#121212;border-color:#262626;color:#8b9dff;box-shadow:none;}
html[data-theme="dark"] .m-scrollfab{background:#1e1e1e;border-color:#333;color:#8b9dff;}
html[data-theme="dark"] .m-thread-parent{background:#121212;border-left-color:#8b9dff;}
html[data-theme="dark"] .m-thread-link{background:rgba(139,157,255,.12);border-color:rgba(139,157,255,.35);color:#a9b7ff;}
html[data-theme="dark"] .m-file-card{background:#1e1e1e!important;border-color:#262626!important;}
html[data-theme="dark"] .m-inp,html[data-theme="dark"] select.m-inp,html[data-theme="dark"] input.m-inp{
  background:#1e1e1e;border-color:#333;color:#f5f5f5;}
html[data-theme="dark"] .skel{background:linear-gradient(90deg,#161616 25%,#242424 50%,#161616 75%);background-size:200% 100%;}
html[data-theme="dark"] #mSheetInner{background:#121212;color:#f5f5f5;}
html[data-theme="dark"] .m-sheet-row:active{background:#1e1e1e;}
html[data-theme="dark"] .m-fmt-popup{background:#000000;}
html[data-theme="dark"] .m-img-preview img{background:#1e1e1e;border-color:#262626;}
html[data-theme="dark"] .af-feed{background:#000000;}
html[data-theme="dark"] .af-card{background:#161616;border-color:#262626;color:#ececec;box-shadow:none;}
html[data-theme="dark"] .af-title{color:#f2f2f2;}
html[data-theme="dark"] .af-meta{color:#9a9a9a;}
/* Professional, muted type chips that stay legible in dark mode. */
html[data-theme="dark"] .af-badge{background:#232323;color:#c9c9c9;}
html[data-theme="dark"] .af-badge.blue{background:rgba(37,99,235,.22);color:#93b4ff;}
html[data-theme="dark"] .af-badge.orange{background:rgba(249,115,22,.22);color:#ffb27a;}
html[data-theme="dark"] .af-badge.green{background:rgba(34,197,94,.22);color:#86e0a6;}
html[data-theme="dark"] .af-badge.purple{background:rgba(168,85,247,.22);color:#cba6f7;}
.af-by{font-weight:600;color:var(--text,#334155);}
html[data-theme="dark"] .af-by{color:#cfcfcf;}
html[data-theme="dark"] .af-select{background-color:#1e1e1e;border-color:#333;color:#f5f5f5;}
html[data-theme="dark"] .af-pill{background:#1e1e1e;color:#a8a8a8;}
html[data-theme="dark"] .af-pill.active{background:#f5f5f5;color:#000000;}
html[data-theme="dark"] .m-notif-dot{border-color:#121212;}
html[data-theme="dark"] .mn-badge{border-color:#121212;}
html[data-theme="dark"] .m-link-pill{box-shadow:none;}
`;
    document.head.appendChild(s);
}
