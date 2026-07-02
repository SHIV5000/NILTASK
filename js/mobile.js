import { sb } from './shared.js';

const MOB = 768;
const _MOB_VER = 'v36';

// Console log buffer — tap version badge to copy all logs
const _logBuf = [];
const _origConsoleLog = console.log.bind(console);
console.log   = (...a) => { _logBuf.push('[L] '+a.join(' ')); if (_logBuf.length>300) _logBuf.shift(); _origConsoleLog(...a); };
console.warn  = (...a) => { _logBuf.push('[W] '+a.join(' ')); if (_logBuf.length>300) _logBuf.shift(); };
console.error = (...a) => { _logBuf.push('[E] '+a.join(' ')); if (_logBuf.length>300) _logBuf.shift(); };
window._copyLogs = () => {
    const txt = '['+_MOB_VER+' log dump '+new Date().toISOString()+']\n'+_logBuf.join('\n');
    navigator.clipboard?.writeText(txt)
        .then(() => _toast('Logs copied ✓ — paste anywhere'))
        .catch(() => _toast('Clipboard denied — use eruda','err'));
};
let _stack  = [];
let _uid    = null;
let _tid    = null;
let _tsInterval = null;
let _users  = [];
let _pendingUploadTaskId = null;
let _pendingDeptPhoto = null;
let _rtChannel = null;
let _bcChannel = null;
let _sharedBc = null;  // v33 cross-platform bridge: shared with web on 'taskflow-bc-'+tid
// Broadcast to BOTH the legacy mobile channel and the shared cross-platform channel.
// Shared payload carries src:'m' so web ignores mobile's own-platform echo correctly,
// and mobile's shared listener ignores src:'m' (already delivered via the legacy channel).
function _bcSend(event, payload) {
    try { _bcChannel?.send({ type:'broadcast', event, payload }); } catch {}
    try { _sharedBc?.send({ type:'broadcast', event, payload:{ ...payload, src:'m' } }); } catch {}
}
let _notifPoll = null;
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
let _bellCount = 0;   // instant in-memory unread count (survives RLS-blocked notification inserts)
let _replyMapCache = {};   // room_id -> {parentId: replyCount} so thread buttons show on instant shell render
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

function _onlineStatus(uid) {
    const u = _users.find(u => u.id === uid);
    if (!u?.last_seen) return '';
    const diffMin = (Date.now() - new Date(u.last_seen).getTime()) / 60000;
    if (diffMin < 3)    return '<span style="color:#22c55e;font-weight:700;">● Online</span>';
    if (diffMin < 60)   return `Last seen ${Math.round(diffMin)}m ago`;
    if (diffMin < 1440) return `Last seen ${Math.round(diffMin/60)}h ago`;
    return '';
}

function _onlineDot(uid) {
    const u = _users.find(u => u.id === uid);
    if (!u?.last_seen) return '';
    const diffMin = (Date.now() - new Date(u.last_seen).getTime()) / 60000;
    if (diffMin < 3)  return '<span class="m-online-dot" style="background:#22c55e;"></span>';
    if (diffMin < 30) return '<span class="m-online-dot" style="background:#fbbf24;"></span>';
    return '';
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
window.addEventListener('offline', () => { _isOffline = true;  _showOfflineBanner(true);  });
window.addEventListener('online',  () => { _isOffline = false; _showOfflineBanner(false); _flushOfflineQueue(); });

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

window.initMobileApp = async function() {
    if (window.innerWidth > MOB) return;
    if (!window.__erudaLoaded) {
        window.__erudaLoaded = true;
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/eruda';
        s.onload = () => eruda.init();
        document.head.appendChild(s);
    }
    _el('root')?.style.setProperty('display', 'none', 'important');
    _injectCSS();
    _buildShell();
    await _ctx();
    await _navTo('home');
    _initRealtime();
    _notifFallbackInterval = setInterval(_refreshNotifBadge, 60000);
    _showOfflineBanner(_isOffline);
    // Auto-refresh displayed timestamps every 60s + update last_seen heartbeat
    _tsInterval = setInterval(() => {
        document.querySelectorAll('.m-bmeta[data-ts]').forEach(el => {
            el.textContent = el.dataset.label + ' · ' + _ago(el.dataset.ts);
        });
        if (_uid) sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', _uid).then(() => {});
    }, 60000);
    window.addEventListener('resize', () => {
        const m = window.innerWidth <= MOB;
        _el('mobileApp')?.style.setProperty('display', m ? 'flex' : 'none', 'important');
        if (m) _el('root')?.style.setProperty('display', 'none', 'important');
    }, { passive: true });
};

let _isOffline = !navigator.onLine;
let _pendingRefresh = null;
let _refreshGen = 0;

function _saveRoomCache(roomId, msgs) {
    _lsSet('mob_msgs_'+roomId, JSON.stringify(msgs.slice(-50)));
}
function _loadRoomCache(roomId) {
    try { return JSON.parse(_lsGet('mob_msgs_'+roomId)||'null'); } catch { return null; }
}
function _loadReactionsCache() {
    try { return JSON.parse(_lsGet('mob_reactions')||'{}'); } catch { return {}; }
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
            try {
                const { data } = await sb.from('profiles').select('*').eq('tenant_id',_tid).is('deleted_at',null);
                _users = data || [];
                window.globalUsersCache = _users;
            } catch {
                _users = window.globalUsersCache || [];
            }
        }
    }
    if (_users.length) _usersLoaded = true;
    if (!_tid) {
        console.error('[mob] No tenant_id found for user — aborting session');
        _toast('Account configuration error. Please contact your administrator.', 'err');
        return;
    }
    // Detect orphaned tenant (tenant_id with no tenants row) once, so group
    // creation surfaces a clear message instead of a raw FK error. Skipped if the
    // web auth flow already set the flag.
    if (window._tenantOrphaned === undefined && _tid) {
        try {
            const { data: t } = await sb.from('tenants').select('id').eq('id', _tid).maybeSingle();
            window._tenantOrphaned = !t;
        } catch { /* network error — leave undefined, don't block */ }
    }
    // Load RBAC role if not already set by web auth flow
    if (_tid && _uid && !window.currentRole) {
        try {
            const { data: ur } = await sb.from('user_roles')
                .select('*, role:roles(name, display_name, permissions)')
                .eq('user_id', _uid).eq('tenant_id', _tid).single();
            if (ur?.role?.name) window.currentRole = ur.role.name;
            if (ur?.role?.display_name) window.currentRoleName = ur.role.display_name;
            if (ur?.role?.permissions) window.currentPermissions = ur.role.permissions;
        } catch {}
    }
    // Load all user roles for role badge display
    if (_tid) {
        try {
            const { data: allRoles } = await sb.from('user_roles')
                .select('user_id, role:roles(name)').eq('tenant_id', _tid);
            _userRoles = {};
            (allRoles||[]).forEach(r => { if (r.role?.name) _userRoles[r.user_id] = r.role.name; });
        } catch {}
    }
    // Sync room names from DB → localStorage → DEPTS; also collect custom groups
    await _syncRoomSettings();
}

// Fetch room_settings from DB, sync names/colors to localStorage, and rebuild _customGroups.
// Called at startup (_ctx) and on live group_photo broadcasts so new groups appear without reload.
async function _syncRoomSettings() {
    if (!_tid) return;
    try {
        // Try to include members (DB column may not exist yet — fall back gracefully).
        let rs = null;
        const withMembers = await sb.from('room_settings')
            .select('room_id,name,color,archived,members').eq('tenant_id', _tid);
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
            });
            _refreshDeptNames();
            // Every non-archived, non-DM room is a group (no more hard-coded defaults).
            _customGroups = rs
                .filter(r => !r.archived && !r.room_id.startsWith('dm_'))
                .map(r => ({ id:r.room_id, name:r.name||r.room_id, col:r.color||'#8b5cf6', photo:_lsGet('dept_photo_'+r.room_id)||'' }));
        } else {
            _customGroups = [];
        }

        // Auto-seed a single "General" starter group for a brand-new tenant so the
        // app is never empty. Managers only (RBAC + tenant must exist).
        if (_customGroups.length === 0 && !window._tenantOrphaned && (window.canManageGroups?.() ?? false)) {
            try {
                await _upsertRoomSettings({ room_id:'general', tenant_id:_tid, name:'General', archived:false, updated_at:new Date().toISOString() }, []);
                _lsSet('dept_name_general', 'General');
                _customGroups = [{ id:'general', name:'General', col:'#6366f1', photo:'' }];
            } catch {}
        }
    } catch {}
}

// Upsert room_settings including members; retries without members if the column doesn't exist yet.
async function _upsertRoomSettings(base, members) {
    if (Array.isArray(members)) {
        const withMembers = await sb.from('room_settings').upsert({ ...base, members }, { onConflict:'room_id,tenant_id' });
        if (!withMembers.error) return;
    }
    await sb.from('room_settings').upsert(base, { onConflict:'room_id,tenant_id' });
}

function _buildShell() {
    if (_el('mobileApp')) return;
    const tabs = [
        { id:'home',      icon:'fa-comments',      lbl:'Chats',      action:"window._navTo('home')" },
        { id:'activity',  icon:'fa-bolt',          lbl:'Activity',   action:"window._navTo('activity')" },
        ...(window.canSeeTaskHub?.() ?? true ? [{ id:'tasks', icon:'fa-list-check', lbl:'Tasks', action:"window._navTo('tasks')" }] : []),
        { id:'remind',    icon:'fa-bell',          lbl:'Reminders',  action:"window._navTo('remind')" },
        { id:'more',      icon:'fa-circle-user',   lbl:'Profile',    action:"window._navTo('settings')" },
    ];
    const app = document.createElement('div');
    app.id = 'mobileApp';
    app.innerHTML = `
      <div id="mSB">
        <div id="mSBInfo" class="m-sb-info" onclick="window._navTo('home')">
          <div class="m-sb-user">${x(_sentenceCase(window.currentUser?.full_name || window.currentUser?.email?.split('@')[0] || 'User'))}</div>
          <div class="m-sb-school-card">${x(window.currentSchoolName || 'School')} <span onclick="window._copyLogs()" title="Tap to copy console logs" style="font-size:9px;opacity:.5;font-weight:700;letter-spacing:.5px;cursor:pointer;">${_MOB_VER}</span></div>
        </div>
        <div id="mSBSearch" class="m-sb-search" style="display:none;">
          <input id="mSBSearchInp" placeholder="Search messages, staff…">
        </div>
        <button class="m-sb-icon" id="mSBLens" title="Search" onclick="window._toggleInlineSearch()"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-sb-icon" id="mSBBell" title="Notifications" data-action="openNotifs" style="position:relative;">
          <i class="fa-solid fa-bell"></i>
          <span id="mNotifBadge" class="m-notif-badge" style="display:none;"></span>
        </button>
        <button class="m-sb-icon" title="Theme" onclick="window._openThemeSheet()"><i class="fa-solid fa-palette"></i></button>
        <button class="m-sb-icon" title="Sign out" onclick="window._confirmLogout()"><i class="fa-solid fa-right-from-bracket"></i></button>
        <div id="mSBResults"></div>
      </div>
      <div id="mStage"></div>
      <div id="mNav">
        ${tabs.map(t=>`
          <button class="mn-btn" id="mnt-${t.id}" onclick="${t.action}">
            <i class="fa-solid ${t.icon}"></i>
            <span class="mn-lbl">${t.lbl}</span>
          </button>`).join('')}
      </div>
      <div id="mSheet"><div id="mSheetInner"></div></div>
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
    app.addEventListener('click', _onShellClick);
    app.addEventListener('pointerdown', _onPressStart);
    app.addEventListener('pointerup', _onPressEnd);
    app.addEventListener('pointerleave', _onPressEnd);
    app.addEventListener('pointercancel', _onPressEnd);
    app.addEventListener('pointermove', _onPressMove, { passive:true });
    app.addEventListener('touchmove', _onPressEnd, { passive:true });
    app.addEventListener('scroll', _onPressEnd, { passive:true, capture:true });
    document.addEventListener('selectionchange', _onSelectionChange);
    // Suppress native copy/cut/paste toolbar when our format bar is active
    document.addEventListener('contextmenu', e => { if (e.target.closest('.m-ce')) e.preventDefault(); }, true);

    // Broadcast typing indicator on input in any chat composer
    app.addEventListener('input', e => {
        if (!e.target.closest('.m-ce')) return;
        const top = _stack[_stack.length-1];
        const room = top?.params?.room;
        if (!room || !_bcChannel) return;
        const now = Date.now();
        if (now - _typingThrottle < 2000) return;
        _typingThrottle = now;
        _bcSend('typing', { room, uid:_uid, name:_uname(_uid) });
    });

    // Swipe-right-to-reply gesture
    app.addEventListener('touchstart', e => {
        const row = e.target.closest('.m-bubble-row');
        if (!row || !row.id.startsWith('row-')) return;
        _swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        _swipeRow = row; _swipeTriggered = false;
    }, { passive: true });
    app.addEventListener('touchmove', e => {
        if (!_swipeStart || !_swipeRow) return;
        const dx = e.touches[0].clientX - _swipeStart.x;
        const dy = Math.abs(e.touches[0].clientY - _swipeStart.y);
        if (dy > 15) { _swipeRow.style.transform = ''; _swipeRow = null; return; }
        if (dx > 5 && dx <= 80) {
            _swipeRow.style.transform = `translateX(${Math.min(dx, 70)}px)`;
            _swipeRow.style.transition = 'none';
            _swipeTriggered = dx > 55;
        }
    }, { passive: true });
    app.addEventListener('touchend', () => {
        if (!_swipeRow) return;
        _swipeRow.style.transition = 'transform .2s ease';
        _swipeRow.style.transform = '';
        if (_swipeTriggered) {
            const msgId = _swipeRow.id.replace('row-','');
            const btext = _swipeRow.querySelector('.m-btext')?.textContent?.substring(0,120)||'';
            const bmeta = _swipeRow.querySelector('.m-bmeta')?.textContent||'';
            const top = _stack[_stack.length-1];
            const room = top?.params?.room||''; const rname = top?.params?.name||''; const rcol = top?.params?.color||'';
            _navTo('thread',{id:msgId,text:btext,sender:bmeta,time:'',room,rname,rcol});
        }
        _swipeRow = null; _swipeStart = null; _swipeTriggered = false;
    });

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
    if (!confirm('Sign out of TaskFlow?')) return;
    if (_tsInterval) clearInterval(_tsInterval);
    if (_notifFallbackInterval) { clearInterval(_notifFallbackInterval); _notifFallbackInterval = null; }
    if (_rtReconnectTimer) { clearTimeout(_rtReconnectTimer); _rtReconnectTimer = null; }
    // Clear all tenant-scoped localStorage data
    if (_tid) {
        const prefix = _tid+'_';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
    await sb.auth.signOut();
    window.location.href = '/';
};

window._navTo = async function(screen, params, replace = false) {
    if (_searchMode) window._toggleInlineSearch();
    if (replace) _stack.pop();
    _stack.push({ screen, params });
    if (replace) history.replaceState({ mobDepth:_stack.length }, '', location.href);
    else history.pushState({ mobDepth:_stack.length }, '', location.href);
    await _render(screen, params, 'forward');
    _setTab(screen);
};
let _lastBackAt = 0;
window._back = function() {
    if (_stack.length > 1) { history.back(); return; }
    const now = Date.now();
    if (now - _lastBackAt < 2000) {
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
    const stage = _el('mStage');
    if (!stage) return;
    const fns = {
        home: _home, activity: _activity, tasks: _tasks, remind: _reminders,
        marks: _bookmarks, scheduled: _scheduled,
        settings: _settings, dashboard: _dashboard, groupMgmt: _groupMgmt,
        groupChat: _groupChat, thread: _thread,
        dm: _dm, taskDetail: _taskDetail, remindEdit: _remindEdit, scheduledEdit: _scheduledEdit, notifications: _notifications,
    };
    const html = await (fns[screen]?.(params) || Promise.resolve('<div style="padding:40px;text-align:center;">Coming soon</div>'));
    const scr  = document.createElement('div');
    const slideClass = screen === 'thread'
        ? (dir==='back' ? 'slide-down' : 'slide-up')
        : (dir==='back' ? 'slide-back' : 'slide-fwd');
    scr.className = `mScr ${slideClass}`;
    scr.dataset.screen = screen;
    scr.innerHTML  = html;
    stage.innerHTML = '';
    stage.appendChild(scr);

    const immersive = screen === 'thread' || screen === 'groupChat' || screen === 'dm';
    _el('mSB')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
    _el('mNav')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');

    _wireScreen(screen, params, scr);
    _scrollTop('mStage');

    if (params?.scrollTo) _scrollAndGlow(params.scrollTo);

    if (_pendingRefresh) { const fn = _pendingRefresh; _pendingRefresh = null; fn(); }
}
function _scrollAndGlow(msgId, attempt=0) {
    const row = document.getElementById('row-'+msgId);
    if (!row) { if (attempt<5) setTimeout(()=>_scrollAndGlow(msgId,attempt+1), 120); return; }
    const card = row.querySelector('.m-bubble') || row;
    row.scrollIntoView({ behavior:'smooth', block:'center' });
    setTimeout(() => card.classList.add('m-highlight'), 50);
    setTimeout(() => card.classList.remove('m-highlight'), 2050);
}
function _setTab(screen) {
    const map = { home:'home', groupChat:'home', thread:'home', dm:'home',
                  activity:'activity', search:'activity',
                  tasks:'tasks', taskDetail:'tasks',
                  remind:'remind', remindEdit:'remind' };
    const active = map[screen] || null; // marks/scheduled/settings/dashboard live in More — no tab to highlight
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
    const canGear = window.canSeeGroupGear?.() ?? false;
    const members = (() => { try { return JSON.parse(_lsGet('dept_members_'+roomId)||'[]'); } catch { return []; } })();
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
          <i class="fa-solid fa-users" style="color:#0ea5e9;"></i> Members (${members.length})
        </div>` : ''}
        ${canGear ? `<div class="m-sheet-row" data-action="setDeptPhoto" data-dept="${roomId}">
          <i class="fa-solid fa-camera" style="color:#10b981;"></i> Change group photo
        </div>` : ''}
        ${canGear ? `<div class="m-sheet-row" data-action="navMore" data-screen="groupMgmt">
          <i class="fa-solid fa-pen" style="color:#f59e0b;"></i> Manage group
        </div>` : ''}
      </div>`;
    _openSheet();
};
window._openMoreSheet = function() {
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">More</div>
      <div style="padding:0 8px 16px;display:flex;flex-direction:column;gap:2px;">
        <div class="m-sheet-row" data-action="navMore" data-screen="marks"><i class="fa-solid fa-bookmark" style="color:#f59e0b;"></i> Bookmarks</div>
        <div class="m-sheet-row" data-action="navMore" data-screen="scheduled"><i class="fa-solid fa-clock" style="color:#6366f1;"></i> Scheduled Messages</div>
        <div class="m-sheet-row" data-action="navMore" data-screen="settings"><i class="fa-solid fa-gear" style="color:#6b7280;"></i> Profile & Settings</div>
        <div class="m-sheet-row" data-action="navMore" data-screen="dashboard"><i class="fa-solid fa-chart-bar" style="color:#16a34a;"></i> Dashboard</div>
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

    return `<div class="mScr-inner">
      <div class="m-sl">CHANNELS</div>
      ${_customGroups.length === 0 ? `<div class="m-empty">${(window.canManageGroups?.() ?? false) ? 'No groups yet. Open Profile → Group Management to create one.' : 'No groups yet. Ask your principal to create one.'}</div>` : ''}
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
      <input type="file" id="mDeptPhotoInput" style="display:none;" accept="image/*">
    </div>`;
}

async function _activity() {
    const { data: msgs } = await sb.from('messages')
        .select('id,room_id,text,created_at,sender_id')
        .eq('tenant_id',_tid).is('deleted_at',null)
        .order('created_at',{ascending:false}).limit(120);

    const mine = (msgs||[]).filter(m => {
        const isDept = !!_findGroup(m.room_id);
        const isMyDM = _isDmMine(m.room_id);
        return isDept || isMyDM;
    }).slice(0,50);

    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Activity</div></div>
      ${mine.length ? mine.map(m => {
        const dept = _findGroup(m.room_id);
        const isDM = m.room_id?.startsWith('dm_');
        let roomName = dept?.name, roomColor = dept?.col, otherUid = null;
        if (isDM) {
            const parts = m.room_id.replace('dm_','').split('_');
            otherUid = parts.find(p => p !== _uid);
            const ou = _users.find(u => u.id === otherUid);
            roomName = ou ? (ou.full_name||ou.email.split('@')[0]) : 'Direct message';
        }
        const isMe = m.sender_id === _uid;
        return `
        <div class="m-row" data-action="${isDM?'dm':'groupChat'}"
             data-room="${m.room_id}" data-name="${x(roomName||'')}" data-color="${roomColor||''}"
             data-uid="${otherUid||''}" data-scroll="${m.id}">
          <div class="m-av ${isDM?'':'sq'}" style="background:${roomColor||'var(--accent)'};">${(roomName||'?')[0].toUpperCase()}</div>
          <div class="m-ri">
            <div class="m-rn">${x(roomName||'Department')}</div>
            <div class="m-rs">${isMe?'You: ':x(_uname(m.sender_id))+': '}${_snip(m.text,40)}</div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">${_ago(m.created_at)}</div>
        </div>`; }).join('') : '<div class="m-empty">No recent activity yet</div>'}
    </div>`;
}

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
    // Merge DB reactions (authoritative — returns all if RLS policy allows tenant read)
    const { data, error } = await sb.from('reactions').select('*').in('message_id', msgIds).eq('tenant_id', _tid);
    if (error) console.error('[mob-react] _fetchReactions error='+error.message);
    (data||[]).forEach(r => {
        if (!map[r.message_id]) map[r.message_id] = [];
        if (!map[r.message_id].find(x => x.value===r.value && x.user_id===r.user_id)) map[r.message_id].push(r);
    });
    return map;
}
const TAG_COLORS = { 'Thank You':'#16a34a','Noted':'#2563eb','Copied':'#7c3aed','Yes Sir':'#ea580c','Yes Madam':'#db2777' };
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
    let error;
    if (isDelete) {
        ({ error } = await sb.from('reactions').delete().eq('message_id',msgId).eq('value',value).eq('user_id',_uid).eq('tenant_id',_tid));
        console.log('[mob-react] deleted reaction error='+error?.message);
    } else {
        ({ error } = await sb.from('reactions').insert({ message_id:msgId, user_id:_uid, tenant_id:_tid, value, type }));
        console.log('[mob-react] inserted reaction error='+error?.message);
    }
    if (error) { _toast('Could not save reaction: '+error.message, 'err'); return; }
    // Persist to localStorage cache (own reaction)
    _saveReactionEntry(msgId, value, type, _uid, isDelete);
    // Broadcast to all users via dedicated broadcast channel (bypasses RLS on postgres_changes)
    _bcSend('reaction', { message_id:msgId, value, type, user_id:_uid, tenant_id:_tid, isDelete });
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
        if (!optimistic.isDelete) {
            if (!list.some(r => r.value === optimistic.value && r.user_id === _uid))
                list.push({ message_id:msgId, value:optimistic.value, type:optimistic.type, user_id:_uid });
        } else {
            for (let i = list.length-1; i >= 0; i--) {
                if (list[i].value === optimistic.value && list[i].user_id === _uid) { list.splice(i,1); break; }
            }
        }
        if (list.length) map = { [msgId]: list };
        else map = {};
    }
    const existingEl = row.querySelector('.m-chips');
    const html = _chipsHTML(msgId, map);
    console.log('[mob-react] chipsHTML length='+(html?.length||0));
    if (existingEl) existingEl.outerHTML = html || '';
    else if (html) row.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend', html);
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
        if (isPending) statusTick = '<span class="m-tick pending">⏳</span>';
        else if (isRead) statusTick = '<span class="m-tick read">✓✓</span>';
        else statusTick = '<span class="m-tick sent">✓✓</span>';
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
function _renderLinkPills(html) {
    let safe = (html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
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
                        <img src="${x(fixedUrl)}" alt="${x(name)}" style="max-width:220px;max-height:200px;border-radius:10px;display:block;object-fit:cover;" loading="lazy"
                            onerror="this.parentElement.innerHTML='<button class=&quot;m-link-pill&quot; data-action=&quot;openFile&quot; data-url=&quot;${encodeURIComponent(safeUrl)}&quot; style=&quot;display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;border:none;cursor:pointer;&quot;><i class=&quot;fa-solid fa-image&quot; style=&quot;font-size:9px;&quot;></i><span>${x(name)}</span></button>'">
                    </div>`;
                }
                const isFile = fileExts.test(url.split('?')[0]);
                const label  = isFile ? 'Download' : 'Visit';
                const icon   = isFile ? 'fa-download' : 'fa-arrow-up-right-from-square';
                return `<button class="m-link-pill" data-action="openFile" data-url="${encodeURIComponent(safeUrl)}" title="${x(fixedUrl)}"
                    style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;border:none;text-decoration:none;cursor:pointer;margin:2px 0;box-shadow:0 2px 8px rgba(99,102,241,.35);white-space:nowrap;vertical-align:middle;max-width:100%;overflow:hidden;">
                    <i class="fa-solid ${icon}" style="font-size:9px;flex-shrink:0;"></i><span style="overflow:hidden;text-overflow:ellipsis;">${x(name)}</span>
                    <span style="font-size:9px;opacity:.75;border-left:1px solid rgba(255,255,255,.35);padding-left:7px;margin-left:3px;">${label}</span>
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
        <button class="m-cic" data-caction="link" data-target="${ceId}" ${expired?'disabled':''}><i class="fa-solid fa-link"></i></button>
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
                .order('created_at',{ascending:false}).limit(50);
            if (!rawMsgs) return;
            const msgs = rawMsgs.reverse();  // oldest → newest for display
            _oldestTs[p.room] = msgs[0]?.created_at || null;
            _allLoaded[p.room] = rawMsgs.length < 50;
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
                // Preserve any live-appended rows (realtime/optimistic) not in DB result
                const dbIds = new Set(msgs.map(m=>m.id));
                const liveRows = [...area.querySelectorAll('[id^="row-"]')]
                    .filter(el => !dbIds.has(el.id.replace('row-','')))
                    .map(el => el.outerHTML);
                area.innerHTML = msgs.map(m=>_bubbleHTML(m,reactionsMap,140,replyMap,p)).join('') || '<div class="m-empty">No messages yet. Send the first one!</div>';
                liveRows.forEach(html => area.insertAdjacentHTML('beforeend', html));
                area.scrollTop = area.scrollHeight;
            }
        } catch {}
    };

    const shellMsgs = cached || [];
    const memberCount = (() => { try { const m=JSON.parse(_lsGet('dept_members_'+p.room)||'[]'); return m.length || ''; } catch { return ''; } })();
    // Broadcast room_read and record our own read timestamp
    setTimeout(() => {
        _bcChannel?.send({ type:'broadcast', event:'room_read', payload:{ room:p.room, uid:_uid, ts:new Date().toISOString() } });
        _lsSet('last_read_'+p.room, new Date().toISOString());
    }, 500);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        ${_avatarHTML(DEPTS.find(d=>d.id===p.room)?.photo || _customGroups.find(g=>g.id===p.room)?.photo, p.name, p.color, 'm-av-sm sq')}
        <div class="m-htitle-wrap">
          <div class="m-htitle">${x(p.name)}</div>
          ${memberCount ? `<div class="m-hsubtitle">${memberCount} members</div>` : ''}
        </div>
        <button class="m-hdr-action" onclick="window._toggleChatSearch('mMsgArea')"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-hdr-menu" onclick="window._showRoomMenu('${p.room}','${x(p.name)}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      <div id="mChatSearchBar" style="display:none;padding:6px 12px;background:var(--surface);border-bottom:1px solid var(--border);">
        <input id="mChatSearchInp" type="search" placeholder="Search messages…" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;" oninput="window._filterChatMsgs(this.value,'mMsgArea')">
      </div>
      <div class="m-msgs" id="mMsgArea">
        ${shellMsgs.length ? (()=>{ const sr=_loadReactionsCache(); const rmap=_replyMapCache[p.room]||{}; return shellMsgs.map(m=>_bubbleHTML(m,sr,140,rmap,p)).join(''); })() : '<div class="m-empty" style="color:var(--text-secondary);padding:40px;text-align:center;">' + (cached ? 'No messages yet.' : '<i class="fa-solid fa-spinner" style="animation:spin .8s linear infinite;"></i> Loading…') + '</div>'}
      </div>
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

    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div style="display:flex;flex-direction:column;gap:1px;">
          <div class="m-htitle">Thread</div>
          ${p.rname ? `<div style="font-size:11px;color:var(--text-secondary);font-weight:600;">#${x(p.rname)}</div>` : ''}
        </div>
      </div>
      <div class="m-msgs" id="mThreadArea">
        <div class="m-thread-parent">
          <div class="m-bmeta">${x(p.sender||'')} · ${p.time||''}</div>
          <div class="m-btext">${_renderLinkPills(p.text||'')}</div>
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
                .select('id,text,sender_id,created_at,updated_at')
                .eq('room_id',p.room).eq('tenant_id',_tid)
                .is('deleted_at',null).order('created_at',{ascending:false}).limit(50);
            if (!rawMsgs) return;
            const msgs = rawMsgs.reverse();  // oldest → newest for display
            _oldestTs[p.room] = msgs[0]?.created_at || null;
            _allLoaded[p.room] = rawMsgs.length < 50;
            _saveRoomCache(p.room, msgs);
            const reactionsMap = await _fetchReactions(msgs.map(m=>m.id));
            if (myGen !== _refreshGen) return;
            const area = document.getElementById('mDMArea');
            if (area) {
                const dbIds2 = new Set(msgs.map(m=>m.id));
                const liveRows2 = [...area.querySelectorAll('[id^="row-"]')]
                    .filter(el => !dbIds2.has(el.id.replace('row-','')))
                    .map(el => el.outerHTML);
                area.innerHTML = msgs.map(m=>_bubbleHTML(m,reactionsMap,160)).join('') || `<div class="m-empty">Start a conversation with ${x(p.name)}</div>`;
                liveRows2.forEach(html => area.insertAdjacentHTML('beforeend', html));
                area.scrollTop = area.scrollHeight;
            }
        } catch {}
    };

    const shellMsgs = cached || [];
    const onlineStat = _onlineStatus(p.uid);
    const roleTag = _roleChip(p.uid);
    // Broadcast room_read and record our own read timestamp
    setTimeout(() => {
        _bcChannel?.send({ type:'broadcast', event:'room_read', payload:{ room:p.room, uid:_uid, ts:new Date().toISOString() } });
        _lsSet('last_read_'+p.room, new Date().toISOString());
    }, 500);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div style="position:relative;flex-shrink:0;">${_avatarHTML(otherUser?.avatar_url, p.name, 'var(--accent)', 'm-av-sm')}${_onlineDot(p.uid)}</div>
        <div class="m-htitle-wrap">
          <div class="m-htitle">${x(p.name)} ${roleTag}</div>
          ${onlineStat ? `<div class="m-hsubtitle">${onlineStat}</div>` : ''}
        </div>
        <button class="m-hdr-action" onclick="window._toggleChatSearch('mDMArea')"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="m-hdr-menu" onclick="window._showRoomMenu('${p.room}','${x(p.name)}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
      </div>
      <div id="mChatSearchBar" style="display:none;padding:6px 12px;background:var(--surface);border-bottom:1px solid var(--border);">
        <input id="mChatSearchInp" type="search" placeholder="Search messages…" style="width:100%;padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:13px;" oninput="window._filterChatMsgs(this.value,'mDMArea')">
      </div>
      <div class="m-msgs" id="mDMArea">
        ${shellMsgs.length ? (()=>{ const sr=_loadReactionsCache(); return shellMsgs.map(m=>_bubbleHTML(m,sr,160,{},p)).join(''); })() : `<div class="m-empty" style="color:var(--text-secondary);padding:40px;text-align:center;">${cached ? `Start a conversation with ${x(p.name)}` : '<i class="fa-solid fa-spinner" style="animation:spin .8s linear infinite;"></i> Loading…'}</div>`}
      </div>
      <button class="m-scrollfab" id="mScrollFab" style="display:none;" onclick="document.getElementById('mDMArea').scrollTo({top:9e9,behavior:'smooth'})"><i class="fa-solid fa-chevron-down"></i></button>
      <div class="m-typing-area" id="mTypingArea"></div>
      ${_composerHTML('mDCE', `Message ${p.name||''}…`, 'sendDM', `data-room="${p.room}" data-uid="${p.uid||''}" data-name="${x(p.name)}"`)}
    </div>`;
}

async function _tasks() {
    const { data } = await sb.from('task_assignees')
        .select('status, tasks!inner(id,title,priority,deadline,created_at,require_proof,assigned_by)')
        .eq('assignee_id',_uid).eq('tenant_id',_tid)
        .order('created_at',{ascending:false,foreignTable:'tasks'}).limit(50);

    const taskIds = (data||[]).map(r=>r.tasks.id);
    let assigneeMap = {};
    if (taskIds.length) {
        const { data: allAssignees } = await sb.from('task_assignees').select('task_id,assignee_id').eq('tenant_id', _tid).in('task_id', taskIds);
        (allAssignees||[]).forEach(a => { (assigneeMap[a.task_id] = assigneeMap[a.task_id]||[]).push(_uname(a.assignee_id)); });
    }

    const stMap = { pending_ack:{bg:'#fef9c3',fg:'#854d0e',lbl:'⏳ Needs Ack'},
                    in_progress:{bg:'#dbeafe',fg:'#1d4ed8',lbl:'🔄 In Progress'},
                    submitted:  {bg:'#ffedd5',fg:'#9a3412',lbl:'📬 Pending Review'},
                    needs_review:{bg:'#fee2e2',fg:'#991b1b',lbl:'🔄 Changes Needed'},
                    accepted:   {bg:'#dcfce7',fg:'#16a34a',lbl:'🎉 Done'},
                    overdue:    {bg:'#fee2e2',fg:'#b91c1c',lbl:'🔴 Overdue'} };
    const now = new Date();
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">My Tasks</div></div>
      ${(data||[]).length ? (data||[]).map(row => {
        const t = row.tasks;
        const isOverdue = t.deadline && new Date(t.deadline)<now && row.status!=='accepted';
        const st = isOverdue ? stMap.overdue : (stMap[row.status]||stMap.pending_ack);
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
            ${t.require_proof ? `<span>📎 Proof required</span>` : ''}
          </div>
          <div class="m-tc-people">
            <div>👤 Created by ${x(_uname(t.assigned_by))}</div>
            ${assignees ? `<div>👥 Assigned to ${x(assignees)}</div>` : ''}
            <div>🕐 ${_fmtIST(t.created_at)}</div>
          </div>
        </div>`; }).join('') : '<div class="m-empty">No tasks assigned to you yet.</div>'}
    </div>`;
}

async function _taskDetail(p) {
    const [{ data: ta }, { data: trails }] = await Promise.all([
        sb.from('task_assignees').select('*, tasks(*)').eq('task_id',p.id).eq('assignee_id',_uid).single(),
        sb.from('task_trails').select('*').eq('task_id',p.id).order('created_at',{ascending:false}).limit(10),
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
        </button>` : ''}
        ${status==='submitted' ? `<div class="m-empty" style="padding:12px;">Waiting for the task creator to review your submission.</div>` : ''}
        ${status==='accepted' ? `<div class="m-empty" style="padding:12px;">🎉 This task is complete — no further action needed.</div>` : ''}
      </div>
      ${(trails||[]).length ? `
      <div style="padding:4px 16px 16px;">
        <div class="m-sl" style="padding:8px 0 6px;">Activity</div>
        ${trails.map(tr => `
          <div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:15px;">
            <div style="color:var(--text-secondary);font-size:11px;margin-bottom:2px;">${_ago(tr.created_at)}</div>
            ${tr.action==='FILE' ? `<button class="m-file-link" data-action="openTaskFile" data-path="${x((tr.comment||'').split('|')[1]||'')}">📎 ${x((tr.comment||'').split('|')[0])} <i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : x(tr.comment||'')}
          </div>`).join('')}
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

async function _notifications() {
    const { data } = await sb.from('notifications').select('*').eq('user_id',_uid).eq('tenant_id',_tid).order('created_at',{ascending:false}).limit(50);
    const iconMap = {reminder:'fa-stopwatch',task:'fa-clipboard-check',message:'fa-comment',general:'fa-bell'};
    const colorMap = {reminder:'#a855f7',task:'#3b82f6',message:'#22c55e',general:'#f59e0b'};

    const hasUnread = (data||[]).some(d=>!d.is_read);
    // Mark all as read silently
    const unreadIds = (data||[]).filter(d=>!d.is_read).map(d=>d.id);
    _clearBellBadge();   // opening the notifications screen clears the unread badge
    if (unreadIds.length) {
        sb.from('notifications').update({is_read:true}).in('id',unreadIds).then(()=>_refreshNotifBadge());
    }

    // Group by date (IST)
    const nowIST = new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    const todayStr = nowIST.toDateString();
    const yestDate = new Date(nowIST); yestDate.setDate(yestDate.getDate()-1);
    const yestStr  = yestDate.toDateString();
    const groups = { Today:[], Yesterday:[], Earlier:[] };
    (data||[]).forEach(d => {
        const dt = new Date(new Date(d.created_at).toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
        if (dt.toDateString() === todayStr)       groups.Today.push(d);
        else if (dt.toDateString() === yestStr)   groups.Yesterday.push(d);
        else                                       groups.Earlier.push(d);
    });

    const renderItems = items => items.map(d => {
        const tp = d.type || 'general';
        const ic = iconMap[tp] || 'fa-bell', co = colorMap[tp] || '#f59e0b';
        const action = tp === 'task' ? 'goToTaskNotif' : 'goToMsgNotif';
        return `
        <div class="m-row" data-action="${action}" data-mid="${d.message_id||''}" data-tid="${d.task_id||''}" style="${d.is_read?'opacity:.65;':''}">
          <div class="m-av" style="background:${co};border-radius:12px;position:relative;">
            <i class="fa-solid ${ic}" style="font-size:16px;color:#fff;"></i>
            ${!d.is_read ? '<span class="m-notif-dot"></span>' : ''}
          </div>
          <div class="m-ri">
            <div class="m-rn" style="${!d.is_read?'font-weight:700;':''}">${x(_snip(d.message,70))}</div>
            <div class="m-rs">${_fmtIST(d.created_at)}</div>
          </div>
        </div>`; }).join('');

    const renderGroup = (label, items) => !items.length ? '' :
        `<div class="m-notif-day">${label}</div>${renderItems(items)}`;

    const hasAny = groups.Today.length || groups.Yesterday.length || groups.Earlier.length;
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain">
        <div class="m-htitle">Notifications</div>
        ${hasUnread ? `<button class="m-hdr-action" onclick="window._markAllNotifsRead()">Mark all read</button>` : ''}
      </div>
      ${hasAny
          ? renderGroup('Today',groups.Today)+renderGroup('Yesterday',groups.Yesterday)+renderGroup('Earlier',groups.Earlier)
          : '<div class="m-empty">All caught up! 🎉</div>'}
    </div>`;
}
window._markAllNotifsRead = async () => {
    _clearBellBadge();
    await sb.from('notifications').update({is_read:true}).eq('user_id',_uid).eq('tenant_id',_tid).eq('is_read',false);
    _refreshNotifBadge();
    _render('notifications');
};
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

      ${window.canSeeGroupGear?.() ? `
      <div class="m-sl">ADMINISTRATION</div>
      <div style="padding:0 16px 8px;">
        <div class="m-row" data-action="navGroupMgmt" style="cursor:pointer;padding:12px 0;">
          <div style="width:36px;height:36px;border-radius:10px;background:#7c3aed18;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fa-solid fa-people-group" style="color:#7c3aed;font-size:16px;"></i>
          </div>
          <div class="m-ri"><div class="m-rn">Group Management</div><div class="m-rs">Create, edit, archive groups &amp; members</div></div>
          <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:12px;"></i>
        </div>
      </div>` : ''}

      <div class="m-sl">APPEARANCE</div>
      <div style="padding:0 16px 8px;">
        <div class="m-theme-grid">
          ${(window.THEME_LIST||[]).map(t=>`
            <button class="m-theme-pill ${window.currentTheme===t.id?'active':''}" data-action="pickTheme" data-theme="${t.id}">
              <span class="m-theme-dot" style="background:${t.swatch};"></span>${t.label}
            </button>`).join('') || '<div class="m-empty">Theme system not loaded</div>'}
        </div>
      </div>

      <div class="m-sl">NOTIFICATIONS</div>
      <div style="padding:0 16px 8px;">
        <div class="m-detail-row"><span class="m-detail-lbl">Status</span><span class="m-detail-val">${permLabel}</span></div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;padding:4px 0 10px;">
          When enabled, you'll get a phone notification (with sound + vibration) for new messages and task updates — even if TaskFlow isn't open on screen. Without it, you'll only see updates when you're actively looking at the app. This is requested automatically once when you first log in.
        </div>
      </div>

      <div class="m-sl">PROFILE</div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:12px;">
        <div class="m-field"><label class="m-label">Full Name</label>
          <input class="m-inp" id="sName" value="${x(p?.full_name||'')}" placeholder="Your name"></div>
        <div class="m-field"><label class="m-label">Designation</label>
          <input class="m-inp" id="sDesig" value="${x(p?.designation||'')}" placeholder="Your designation"></div>
        <div class="m-field"><label class="m-label">Department</label>
          <input class="m-inp" id="sDept" value="${x(p?.department||'')}" placeholder="Your department"></div>
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
          <div class="m-sheet-title">Create Group</div>
          <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:12px;">
            <div class="m-field"><label class="m-label">Group Name</label>
              <input class="m-inp" id="gmCreateName" placeholder="e.g. Science Department"></div>
            <div class="m-field"><label class="m-label">Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="gmColorRow">
                ${PRESET_COLORS.map(c=>`<div onclick="window._gmPickColor('${c}')" data-col="${c}"
                  style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;"></div>`).join('')}
              </div>
              <input type="hidden" id="gmCreateColor" value="${PRESET_COLORS[0]}">
            </div>
            <div class="m-field"><label class="m-label">Members</label>
              <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:4px 0;" id="gmMemberList">
                ${_users.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;">
                  <input type="checkbox" value="${u.id}" style="accent-color:#6366f1;">
                  <span style="font-size:13px;">${x(u.full_name||u.email||'')}</span>
                </label>`).join('')}
              </div>
            </div>
            <button class="m-action-btn" style="background:#6366f1;" onclick="window._doCreateGroup()">
              <i class="fa-solid fa-plus"></i> Create Group
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
        const selectedIds = [...document.querySelectorAll('#gmMemberList input:checked')].map(el=>el.value);
        _lsSet('dept_name_'+roomId, name);
        _lsSet('dept_color_'+roomId, color);
        if (selectedIds.length) _lsSet('dept_members_'+roomId, JSON.stringify(selectedIds));
        try {
            await _upsertRoomSettings({ room_id:roomId, tenant_id:_tid, name, color, updated_at:new Date().toISOString() }, selectedIds);
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
        sheet.innerHTML = `
          <div class="m-sheet-handle"></div>
          <div class="m-sheet-title">Edit Group</div>
          <input type="hidden" id="gmEditId" value="${gid}">
          <div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:12px;">
            <div class="m-field"><label class="m-label">Group Name</label>
              <input class="m-inp" id="gmEditName" value="${x(gname)}" placeholder="Group name"></div>
            <div class="m-field"><label class="m-label">Color</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;" id="gmColorRow">
                ${PRESET_COLORS.map(c=>`<div onclick="window._gmPickColor('${c}')" data-col="${c}"
                  style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;"></div>`).join('')}
              </div>
              <input type="hidden" id="gmEditColor" value="${gcol||'#6366f1'}">
            </div>
            <div class="m-field"><label class="m-label">Members</label>
              <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;padding:4px 0;" id="gmMemberList">
                ${_users.map(u=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;">
                  <input type="checkbox" value="${u.id}" ${currentMembers.includes(u.id)?'checked':''} style="accent-color:#6366f1;">
                  <span style="font-size:13px;">${x(u.full_name||u.email||'')}</span>
                </label>`).join('')}
              </div>
            </div>
            <button class="m-action-btn" style="background:#6366f1;" onclick="window._doSaveGroup()">
              <i class="fa-solid fa-save"></i> Save Changes
            </button>
          </div>`;
        _openSheet();
        window._gmPickColor(gcol||'#6366f1');
    };

    window._doSaveGroup = async function() {
        if (window.guardManageGroups?.()) return;
        const gid   = _el('gmEditId')?.value;
        const name  = (_el('gmEditName')?.value||'').trim();
        const color = _el('gmEditColor')?.value || '#6366f1';
        if (!gid || !name) { _toast('Invalid','err'); return; }
        const selectedIds = [...document.querySelectorAll('#gmMemberList input:checked')].map(el=>el.value);
        _lsSet('dept_name_'+gid, name);
        _lsSet('dept_color_'+gid, color);
        _lsSet('dept_members_'+gid, JSON.stringify(selectedIds));
        try {
            await _upsertRoomSettings({ room_id:gid, tenant_id:_tid, name, color, updated_at:new Date().toISOString() }, selectedIds);
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
            } catch(e) { _toast('DB error: '+e.message,'err'); return; }
            const idx = _customGroups.findIndex(g=>g.id===gid);
            if (idx>=0) _customGroups.splice(idx,1);
            _toast('Group archived');
            await _render('groupMgmt', null, 'forward');
        };
    };

    return `<div class="mScr-inner">
      <div class="m-hdr">
        <button class="m-hdr-back" data-action="back"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Group Management</div>
      </div>
      <div style="padding:16px;">
        <button class="m-action-btn" style="background:#7c3aed;margin-bottom:16px;" onclick="window._openGroupCreateSheet()">
          <i class="fa-solid fa-plus"></i> Create New Group
        </button>

        <div class="m-sl">GROUPS</div>
        ${_customGroups.length ? _customGroups.map(d=>`
          <div class="m-row" style="padding:10px 0;">
            <div style="width:40px;height:40px;border-radius:12px;background:${d.col};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;">${d.photo?`<img src="${d.photo}" style="width:100%;height:100%;border-radius:12px;object-fit:cover;">`:'👥'}</div>
            <div class="m-ri"><div class="m-rn">${x(d.name)}</div><div class="m-rs" style="color:${d.col};">Group</div></div>
            <div style="display:flex;gap:6px;">
              <button onclick="window._openGroupEditSheet('${d.id}','${x(d.name)}','${d.col}')"
                style="padding:6px 12px;border-radius:8px;background:#6366f120;color:#6366f1;border:none;font-size:12px;font-weight:600;cursor:pointer;">Edit</button>
              <button onclick="window._archiveGroup('${d.id}')"
                style="padding:6px 12px;border-radius:8px;background:#ef444420;color:#ef4444;border:none;font-size:12px;font-weight:600;cursor:pointer;">Archive</button>
            </div>
          </div>`).join('') : '<div class="m-empty">No groups yet. Tap “Create New Group” to add one for your staff.</div>'}
      </div>
    </div>`;
}

function _openSheet()  { _el('mSheet')?.classList.add('open'); }
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
        ${QUICK_TAGS.map(t=>{const c=TAG_COLORS[t];return`<button class="m-tag-btn" style="border-color:${c};color:${c};" data-action="reactTag" data-id="${msgId}" data-value="${x(t)}">${x(t)}</button>`;}).join('')}
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
        ${QUICK_TAGS.map(t=>{const c=TAG_COLORS[t];return`<button class="m-tag-btn" style="border-color:${c};color:${c};" data-action="insertTag" data-target="${targetId}" data-value="${x(t)}">${x(t)}</button>`;}).join('')}
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
function _showForwardSheet(text) {
    const sheet = _el('mSheetInner');
    const others = _users.filter(u=>u.id!==_uid);
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Forward to…</div>
      <div style="max-height:50vh;overflow-y:auto;padding:0 8px 16px;">
        ${_customGroups.map(d=>`
          <div class="m-sheet-row" data-action="doForward" data-room="${d.id}" data-text="${x(text)}">
            <span class="m-av sq" style="width:30px;height:30px;font-size:13px;background:${d.col};">${(d.name||'?')[0]}</span> ${x(d.name)}
          </div>`).join('')}
        ${others.map(u=>`
          <div class="m-sheet-row" data-action="doForward" data-room="${_dmRoom(u.id)}" data-text="${x(text)}">
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
    const others = _users.filter(u=>u.id!==_uid);
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
        case 'openNotifs': await _navTo('notifications'); break;
        case 'goToMsgNotif': await _goToMessage(a.mid); break;
        case 'goToTaskNotif': await _goToTask(a.tid); break;
        case 'navGroupMgmt':   _navTo('groupMgmt'); break;
        case 'saveProfile':    await _saveProfile(); break;
        case 'setMyPhoto':   _el('mMyPhotoInput')?.click(); break;
        case 'setDeptPhoto': _pendingDeptPhoto = a.dept; _el('mDeptPhotoInput')?.click(); break;
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
                const { data: pub } = sb.storage.from('task-proofs').getPublicUrl(filePath);
                ceEl?.focus();
                const encoded = encodeURIComponent(file.name + '|||' + pub.publicUrl);
                document.execCommand('insertHTML', false, `<a href="https://link-pill.local/${encoded}">📎 ${x(file.name)}</a>&nbsp;`);
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
              }).join('')}</div>`;
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
    if (Math.abs(e.clientX-_pressX) > 6 || Math.abs(e.clientY-_pressY) > 6) {
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

function _scheduleRtReconnect() {
    if (_rtReconnectTimer) return;
    _rtWasErrored = true;
    _toast('Reconnecting…', 'info');
    console.log('[mob-rt] scheduling reconnect in 5s');
    _rtReconnectTimer = setTimeout(async () => {
        _rtReconnectTimer = null;
        console.log('[mob-rt] reconnecting…');
        _rtIntentionalClose = true;
        if (_rtChannel) { try { await sb.removeChannel(_rtChannel); } catch {} _rtChannel = null; }
        if (_bcChannel) { try { await sb.removeChannel(_bcChannel); } catch {} _bcChannel = null; }
        if (_sharedBc) { try { await sb.removeChannel(_sharedBc); } catch {} _sharedBc = null; }
        _rtIntentionalClose = false;
        _initRealtime();
    }, 5000);
}
function _initRealtime() {
    if (!_tid) { console.error('[mob-rt] Cannot init realtime without tenant_id'); return; }
    if (_rtChannel) return;
    _rtChannel = sb.channel('mobile-rt-'+_tid)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`tenant_id=eq.${_tid}` }, p => _onNewMessage(p.new))
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'task_assignees', filter:`tenant_id=eq.${_tid}` }, p => _onTaskAssigneeUpdate(p.new))
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${_uid}` }, () => _refreshNotifBadge())
        .subscribe(status => {
            console.log('[mob-rt] channel status='+status);
            if (status === 'SUBSCRIBED') {
                if (_rtReconnectTimer) { clearTimeout(_rtReconnectTimer); _rtReconnectTimer = null; }
                if (_rtWasErrored) { _rtWasErrored = false; _toast('Connected ✓'); }
            }
            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED') && !_rtIntentionalClose) _scheduleRtReconnect();
        });
    // Shared broadcast handlers — attached to BOTH the legacy mobile channel and the
    // cross-platform 'taskflow-bc' channel so mobile ↔ web sync live (v33).
    const _hReaction = p => {
        if (p.payload && p.payload.tenant_id && p.payload.tenant_id !== _tid) return;
        if (p.payload && p.payload.user_id === _uid) return;  // ignore own echo (shared channel)
        _onReactionChange(p.payload, p.payload?.isDelete ? 'DELETE' : 'INSERT');
    };
    const _hGroupPhoto = p => {
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
            if (top?.screen === 'home') _render('home', null, 'forward');
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
    _bcChannel = sb.channel('mobile-bc-'+_tid, { config: { broadcast: { self: false } } })
        .on('broadcast', { event:'reaction' }, _hReaction)
        .on('broadcast', { event:'group_photo' }, _hGroupPhoto)
        .on('broadcast', { event:'typing' }, _hTyping)
        .on('broadcast', { event:'room_read' }, p => {
            if (!p.payload || p.payload.uid === _uid) return;
            _lsSet('last_read_other_'+p.payload.room, p.payload.ts);
            // Upgrade tick marks to blue (read) for visible sent messages in this room
            const top = _stack[_stack.length-1];
            if (top?.params?.room === p.payload.room) {
                document.querySelectorAll('.m-tick.sent').forEach(el => { el.className = 'm-tick read'; el.textContent = '✓✓'; });
            }
        })
        .subscribe(status => {
            console.log('[mob-rt] bc channel status='+status);
            if (status === 'SUBSCRIBED' && _rtReconnectTimer) { clearTimeout(_rtReconnectTimer); _rtReconnectTimer = null; }
            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED') && !_rtIntentionalClose) _scheduleRtReconnect();
        });
    // Shared cross-platform channel (mobile ↔ web). self:false so we don't hear our own broadcasts.
    // Ignore src:'m' (own platform) — those are already delivered via the legacy mobile-bc channel.
    _sharedBc = sb.channel('taskflow-bc-'+_tid, { config: { broadcast: { self: false } } })
        .on('broadcast', { event:'reaction' }, p => { if (p.payload?.src === 'm') return; _hReaction(p); })
        .on('broadcast', { event:'group_photo' }, p => { if (p.payload?.src === 'm') return; _hGroupPhoto(p); })
        .on('broadcast', { event:'typing' }, p => { if (p.payload?.src === 'm') return; _hTyping(p); })
        .subscribe(status => {
            console.log('[mob-rt] shared bc status='+status);
            if ((status === 'CHANNEL_ERROR' || status === 'CLOSED') && !_rtIntentionalClose) _scheduleRtReconnect();
        });
    _refreshNotifBadge();
    // Realtime badge update already wired via postgres_changes INSERT on notifications — no polling needed
}
async function _refreshNotifBadge() {
    const { count } = await sb.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',_uid).eq('tenant_id',_tid).eq('is_read',false);
    // Use the larger of the DB count and our instant in-memory count, so the badge
    // still shows even if the notifications INSERT is blocked by RLS.
    _bellCount = Math.max(count || 0, _bellCount);
    _renderBellBadge();
}
// Render the bell badge from the in-memory count (instant, no DB dependency).
function _renderBellBadge() {
    const badge = _el('mNotifBadge');
    if (!badge) return;
    if (_bellCount > 0) { badge.textContent = _bellCount > 9 ? '9+' : String(_bellCount); badge.style.display = 'flex'; }
    else badge.style.display = 'none';
}
function _bumpBellBadge() { _bellCount++; _renderBellBadge(); }
function _clearBellBadge() { _bellCount = 0; _renderBellBadge(); }
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
async function _onNewMessage(m) {
    if (m.tenant_id && m.tenant_id !== _tid) return;
    if (!m || m.sender_id === _uid) return; // own sends are already shown by the post-send refresh
    // DM privacy guard — ignore DMs the current user is not a participant of (no toast/notif/render)
    if (m.room_id && m.room_id.startsWith('dm_')) {
        const parts = m.room_id.replace('dm_','').split('_');
        if (!parts.includes(_uid)) return;
    }
    const top = _stack[_stack.length-1];
    if (!top) return;
    const inGroup  = top.screen==='groupChat' && m.room_id===top.params?.room && !m.parent_message_id;
    const inDM     = top.screen==='dm'        && m.room_id===top.params?.room;
    const inThread = top.screen==='thread'    && m.parent_message_id===top.params?.id;
    console.log('[mob-rt] msg id='+m.id+' parent='+m.parent_message_id+' room='+m.room_id+' screen='+top.screen+' params='+JSON.stringify(top.params)+' inGroup='+inGroup+' inThread='+inThread);
    if (!inGroup && !inDM && !inThread) {
        // Update the reply indicator on the parent bubble if it's visible in the current chat.
        // Use the SAME clickable .m-thread-link element the renderer emits (not a separate div),
        // so the indicator stays single and tappable to open the thread.
        if (m.parent_message_id) {
            const parentRow = document.getElementById('row-'+m.parent_message_id);
            if (parentRow) {
                const link = parentRow.querySelector('.m-thread-link');
                if (link) {
                    const n = (parseInt(link.dataset.n||'1')+1);
                    link.dataset.n = n;
                    link.innerHTML = `💬 ${n} repl${n===1?'y':'ies'} ›`;
                } else {
                    const dept = DEPTS.find(d=>d.id===m.room_id) || _customGroups.find(g=>g.id===m.room_id);
                    parentRow.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend',
                        `<button class="m-thread-link" data-action="thread" data-n="1" data-id="${m.parent_message_id}" data-room="${m.room_id||''}" data-rname="${x(dept?.name||'')}" data-rcol="${dept?.col||''}">💬 1 reply ›</button>`);
                }
            }
        }
        if (!m.parent_message_id) {
            const sender = _users.find(u=>u.id===m.sender_id);
            const name = sender ? (sender.full_name||sender.email?.split('@')[0]) : 'Someone';
            const dept = DEPTS.find(d=>d.id===m.room_id) || _customGroups.find(g=>g.id===m.room_id);
            const isDM = m.room_id?.startsWith('dm_');
            const roomLabel = dept ? dept.name : (isDM ? 'a direct message' : 'a group');
            _toast(`${name} — ${roomLabel}: ${_snip(m.text,50)}`);
            // Bump the bell instantly — independent of the DB insert (which RLS may block).
            _bumpBellBadge();
            // Write a notification row so the notifications list is populated (dedup by message_id)
            try {
                const { count } = await sb.from('notifications').select('id',{count:'exact',head:true})
                    .eq('user_id',_uid).eq('message_id',m.id);
                if (!count) {
                    const snippet = _snip(m.text, 80);
                    const msg = isDM ? `💬 ${name}: ${snippet}` : `${name} in ${roomLabel}: ${snippet}`;
                    await sb.from('notifications').insert({
                        user_id:_uid, type:'message', message:msg,
                        message_id:m.id, tenant_id:_tid, is_read:false
                    });
                    await _refreshNotifBadge();
                }
            } catch(e) { /* non-fatal */ }
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
    if (!r || !r.message_id) return;
    // RLS prevents SELECT of other users' reactions — use payload directly for DOM patch
    const row = document.getElementById('row-'+r.message_id);
    if (!row) return;
    const isDelete = eventType === 'DELETE';
    // Collect current DOM chip state
    const domReactions = [];
    row.querySelectorAll('.m-chip').forEach(btn => {
        domReactions.push({ message_id:r.message_id, value:btn.dataset.value, type:btn.dataset.type,
            user_id: (btn.dataset.mine === '1' || btn.classList.contains('mine')) ? _uid : (btn.dataset.otherId || 'other') });
    });
    if (isDelete) {
        const idx = domReactions.findIndex(d => d.value === r.value && d.user_id === r.user_id);
        if (idx > -1) domReactions.splice(idx, 1);
    } else {
        const alreadyThere = domReactions.find(d => d.value === r.value && d.user_id === r.user_id);
        if (!alreadyThere) domReactions.push({ message_id:r.message_id, value:r.value, type:r.type, user_id:r.user_id });
    }
    const map = domReactions.length ? { [r.message_id]: domReactions } : {};
    const existingEl = row.querySelector('.m-chips');
    const html = _chipsHTML(r.message_id, map);
    if (existingEl) existingEl.outerHTML = html || '';
    else if (html) row.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend', html);
    // Persist to localStorage so it survives reload
    _saveReactionEntry(r.message_id, r.value, r.type, r.user_id, isDelete);
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
            if (area) area.addEventListener('scroll', () => {
                if (fab) {
                    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
                    if (nearBottom) { fab.style.display = 'none'; _scrollFabCount = 0; fab.innerHTML = '<i class="fa-solid fa-chevron-down"></i>'; }
                }
                // Load older messages when scrolled near the top (group + DM only)
                if (room && (screen === 'groupChat' || screen === 'dm') && area.scrollTop < 60) {
                    _loadOlderMessages(areaId, room, screen);
                }
            }, { passive:true });
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
        const cached = _users.find(u=>u.id===_uid);
        if (cached) cached.avatar_url = dataUrl;
        if (window.globalUsersCache) {
            const gc = window.globalUsersCache.find(u=>u.id===_uid);
            if (gc) gc.avatar_url = dataUrl;
        }
        _toast('Photo updated ✓');
        await _navTo('settings',null,true);
    };

    const deptPhotoInp = _el('mDeptPhotoInput');
    if (deptPhotoInp) deptPhotoInp.onchange = async () => {
        const file = deptPhotoInp.files[0]; deptPhotoInp.value = '';
        const deptId = _pendingDeptPhoto; _pendingDeptPhoto = null;
        if (!file || !deptId) return;
        _toast('Processing photo…');
        let dataUrl;
        try { dataUrl = await _compressImageToDataURL(file); }
        catch(e) { _toast('Could not read that image','err'); return; }
        try {
            _lsSet('dept_photo_'+deptId, dataUrl);
        } catch(e) {
            _toast('Image too large for local storage — try a smaller photo','err'); return;
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
    window.playSound?.('message');
    _appendOwnMessage('mMsgArea', m);
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
    const { data: m, error } = await sb.from('messages').insert(payload).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('message');
    _appendOwnMessage('mThreadArea', m, 160);
    // Notify the parent author that someone replied (mirrors web notifyUser)
    try {
        const { data: parent } = await sb.from('messages').select('sender_id').eq('id', a.pid).single();
        if (parent && parent.sender_id && parent.sender_id !== _uid) {
            const me = _users.find(u=>u.id===_uid);
            const myName = me ? (me.full_name||me.email?.split('@')[0]) : 'Someone';
            await sb.from('notifications').insert({
                user_id: parent.sender_id, type:'reply',
                message: `↩ ${myName} replied: ${_snip(val.replace(/<[^>]*>/g,''), 80)}`,
                message_id: m.id, tenant_id:_tid, is_read:false
            });
        }
    } catch(e) { /* non-fatal */ }
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
    window.playSound?.('message');
    _appendOwnMessage('mDMArea', m);
}
function _appendOwnMessage(areaId, m, maxLen=150) {
    const area = _el(areaId);
    if (!area) return;
    area.insertAdjacentHTML('beforeend', _bubbleHTML(m, {}, maxLen));
    area.scrollTo({ top: area.scrollHeight, behavior:'smooth' });
    // Update room cache
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
    await sb.from('scheduled_messages').delete().eq('id',id).eq('tenant_id',_tid);
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
    if (!error) { window.currentUser.full_name = full_name; const u=_el('mSBInfo')?.querySelector('.m-sb-user'); if(u) u.textContent=full_name; }
}
async function _changePassword() {
    const np = prompt('Enter new password (min 8 chars):');
    if (!np || np.length<8) { _toast('Password too short','err'); return; }
    const { error } = await sb.auth.updateUser({ password: np });
    _toast(error ? 'Failed: '+error.message : 'Password changed ✓', error?'err':'ok');
}

function _el(id) { return document.getElementById(id); }
function x(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _init(n){ return (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2)||'?'; }
function _avatarHTML(photoUrl, name, bg, cls='m-av') {
    const initials = _init(name);
    const bgStyle  = `background:${bg||'var(--accent)'};`;
    if (!photoUrl) return `<div class="${cls}" style="${bgStyle}">${initials}</div>`;
    const esc = photoUrl.replace(/'/g,"%27");
    return `<div class="${cls}" style="${bgStyle}overflow:hidden;">` +
        `<img src="${esc}" style="width:100%;height:100%;object-fit:cover;display:block;" ` +
        `onerror="this.parentElement.innerHTML='${initials.replace(/'/g,"&#39;")}';this.parentElement.style.overflow='';"></div>`;
}
function _sentenceCase(s){ s=(s||'').trim(); return s ? s[0].toUpperCase()+s.slice(1).toLowerCase() : s; }
function _fmtIST(ts, withTime=true) {
    if (!ts) return '';
    const utc = (ts.indexOf('Z')===-1 && ts.indexOf('+')===-1) ? ts+'Z' : ts;
    const d = new Date(utc);
    if (isNaN(d)) return '';
    const opts = { day:'2-digit', month:'short', year:'2-digit', timeZone:'Asia/Kolkata' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hour12 = true; }
    return new Intl.DateTimeFormat('en-IN', opts).format(d);
}
function _uname(id){ const u=_users.find(u=>u.id===id); return u ? (u.full_name||u.email?.split('@')[0]||'User') : 'User'; }
function _dmRoom(uid){ return ['dm',...[_uid,uid].sort()].join('_'); }
function _snip(h,n){ const t=(h||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim(); return t.length>n?t.substring(0,n)+'…':t; }
const _istFmt12 = new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'});
const _istFmtDate = new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Kolkata'});
function _ago(ts){
    if(!ts) return '';
    const utc = (ts.indexOf('Z')===-1 && ts.indexOf('+')===-1) ? ts+'Z' : ts;
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

function _injectCSS(){
    if(_el('mCSS')) return;
    const s=document.createElement('style'); s.id='mCSS';
    s.textContent=`
#mobileApp{position:fixed;inset:0;display:flex;flex-direction:column;
  background:var(--bg-body,#fff);color:var(--text-primary,#111);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  z-index:9999;overflow:hidden;}

#mSB{display:flex;align-items:center;gap:6px;
  padding:10px 12px;flex-shrink:0;position:relative;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-sb-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;cursor:pointer;}
.m-sb-user{font-size:15px;font-weight:700;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-sb-school-card{font-size:10.5px;font-weight:700;letter-spacing:.03em;
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
  gap:4px;padding:9px 1px 8px;font-size:25px;
  color:var(--text-secondary,#6b7280);border:none;background:none;
  cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:color .15s;min-height:60px;}
.mn-lbl{font-size:11px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;}
.mn-btn.active{color:var(--accent,#6366f1);}
.mn-btn.active i{transform:scale(1.12);}
.mn-btn:active{opacity:.6;}
.mn-btn i{transition:transform .2s;}

.m-hdr{display:flex;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-hdr-plain{padding:14px 16px;}
.m-back{background:var(--bg-body,#fff);border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:50%;width:40px;height:40px;font-size:17px;color:var(--accent,#6366f1);
  cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  -webkit-tap-highlight-color:transparent;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.m-back:active{background:var(--bg-sidebar,#f6f8fa);}
.m-htitle{font-size:18px;font-weight:700;flex:1;color:var(--text-primary,#111);}

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
.m-rn{font-size:16px;font-weight:600;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-rs{font-size:13.5px;color:var(--text-secondary,#6b7280);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-chv{color:var(--text-secondary,#9ca3af);font-size:13px;}

.m-msgs{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 0;position:relative;}
.m-bubble-row{display:flex;margin:8px 12px;gap:6px;align-items:flex-end;transition:transform .1s ease;}
.m-av-tiny{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:10.5px;flex-shrink:0;}
.m-bubble-row.snt{justify-content:flex-end;}
.m-bubble-row.rcv{justify-content:flex-start;}
.m-bubble{max-width:98%;padding:11px 14px;border-radius:12px;position:relative;
  font-size:16px;line-height:1.5;word-break:break-word;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border:1px solid var(--border-color,#e5e7eb);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.m-bubble.snt{border-left:4px solid var(--accent,#6366f1);border-right-width:1px;}
.m-bubble.rcv{border-right:4px solid var(--accent,#6366f1);border-left-width:1px;}
.m-bmeta{font-size:11.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-bottom:4px;}
.m-edited{font-size:10px;font-weight:400;color:var(--text-secondary,#9ca3af);font-style:italic;margin-left:3px;}
.m-highlight{animation:m-glow-pulse 2s ease-out;}
@keyframes m-glow-pulse{
  0%   { background:color-mix(in srgb, var(--accent) 35%, var(--card-bg)); box-shadow:0 0 0 3px var(--accent); }
  60%  { background:color-mix(in srgb, var(--accent) 22%, var(--card-bg)); box-shadow:0 0 0 2px var(--accent); }
  100% { background:var(--card-bg); box-shadow:none; }
}
.m-btext{font-size:18px;line-height:1.55;color:var(--text-primary,#111);
  word-break:break-word;overflow-wrap:break-word;
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.m-divider{text-align:center;font-size:11px;color:var(--text-secondary);padding:8px 0;}
.m-bubble-pending{opacity:.75;}
.m-pending-indicator{display:flex;justify-content:flex-end;margin-top:4px;color:var(--text-secondary,#9ca3af);}
@keyframes spin{to{transform:rotate(360deg);}}

.m-scrollfab{position:absolute;right:14px;bottom:78px;width:38px;height:38px;border-radius:50%;
  background:var(--bg-body,#fff);border:1px solid var(--border-color,#e5e7eb);
  box-shadow:0 3px 10px rgba(0,0,0,.18);color:var(--accent,#6366f1);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:20;
  -webkit-tap-highlight-color:transparent;}
.m-scrollfab:active{opacity:.8;}

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
#mSheetInner{width:100%;background:var(--bg-body,#fff);
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

#mToast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
  padding:10px 20px;border-radius:24px;font-size:13.5px;font-weight:600;
  color:#fff;z-index:11000;opacity:0;transition:opacity .2s;pointer-events:none;
  white-space:nowrap;}
.toast-ok{background:#16a34a;opacity:1!important;}
.toast-err{background:#ef4444;opacity:1!important;}

.m-empty{padding:40px 20px;text-align:center;color:var(--text-secondary,#6b7280);
  font-size:14.5px;line-height:1.7;}

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
.m-tick{font-size:11px;font-weight:700;}
.m-tick.sent{color:var(--text-secondary,#9ca3af);}
.m-tick.read{color:var(--accent,#6366f1);}
.m-tick.pending{font-size:12px;}

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
`;
    document.head.appendChild(s);
}
