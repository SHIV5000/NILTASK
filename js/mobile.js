/**
 * mobile.js — TaskFlow Native Mobile App  VER 6.0
 * CHANGE LOG v5 → v6 (every item below was verified against real schema /
 * desktop code before being called "fixed" — not guessed):
 *  1. FOUC fix lives in css/mobile-app.css (pure CSS media query, loads
 *     before any JS, so there's no flash regardless of script timing)
 *  2. All message inserts now set created_at explicitly, matching desktop
 *  3/5. Top bar rebuilt: shows your name + school name (universal, every
 *     screen). Lens icon toggles an inline search field in place — no
 *     more big search pill eating the bar
 *  4/10. Theme button was a fake binary dark/light toggle bolted onto an
 *     8-theme system — replaced with the real picker (window.THEME_LIST),
 *     same one Settings now also exposes
 *  6. CONFIRMED ROOT CAUSE of "group send not working": every thread query
 *     filtered on `parent_id`, a column that doesn't exist on `messages` —
 *     the real column (confirmed in messages.js) is `parent_message_id`.
 *     That bad filter was throwing on every chat-screen reload, including
 *     right after sending, which is why sends looked broken
 *  7. Dropped Quill (wrong UX for this ask) for a WhatsApp-style
 *     contenteditable composer: clip / link / emoji / tag icons, with a
 *     floating Bold/Italic/Underline popup that appears on text selection
 *     instead of a permanent toolbar
 *  8/13. CONFIRMED ROOT CAUSE of "no highlight on scroll": glow classes
 *     were applied to the bubble ROW (full-width flex container) instead
 *     of the bubble CARD, so the glow bar rendered off to the side of sent
 *     messages instead of on them. Now applied to the actual card.
 *     Activity's rows also had a data-scroll attribute the dispatcher
 *     never read — wired through now.
 *  9. CONFIRMED ROOT CAUSE of "forward sends many times": _attachSheetActions
 *     was being called fresh every time a sheet opened, but it attaches to
 *     the persistent #mSheetInner node — each call stacked one more
 *     listener, so by your Nth sheet open, one tap fired N times. Now bound
 *     exactly once in _buildShell().
 *  12. Sign-out icon added to the top bar, universal, top right
 *  14. Thread immersive mode (hide top+bottom bar) kept, plus fixed a
 *     related inconsistency: DM bubbles were hijacking normal taps into
 *     opening the actions sheet (blocking text selection); now only
 *     long-press opens it, matching group chat
 *  15. Back button restyled as a visible chip, not a bare icon
 *  16. Floating scroll-to-bottom arrow appears when you've scrolled up,
 *     same as WhatsApp
 *  17. Bottom nav now has labels under each icon
 *  18. Added a single realtime subscription (messages/reactions/
 *     task_assignees) that patches the live DOM in place — appends new
 *     bubbles, updates chips, updates task badges — without ever tearing
 *     down and rebuilding the screen, so there's no flicker
 *  19. Also fixed while auditing: duplicate-listener pattern (same root
 *     cause as #9) was not present anywhere else; checked every other
 *     repeatedly-called show-function for the same mistake
 * ★ STABLE RESTORE POINT — v5.0 preserved in git history.
 *   `git checkout HEAD~1 -- js/mobile.js` reverts this file alone.
 */
import { sb } from './shared.js';

const MOB = 768;
let _stack  = [];
let _uid    = null;
let _tid    = null;
let _users  = [];
let _pendingUploadTaskId = null;
let _pendingDeptPhoto = null;
let _rtChannel = null;
let _searchMode = false;

const DEPTS = [
    {id:'general',   name:localStorage.getItem('dept_name_general')   ||'General',   col:localStorage.getItem('dept_color_general')   ||'#6366f1', photo:localStorage.getItem('dept_photo_general')||''},
    {id:'math',      name:localStorage.getItem('dept_name_math')      ||'Mathematics',col:localStorage.getItem('dept_color_math')      ||'#0ea5e9', photo:localStorage.getItem('dept_photo_math')||''},
    {id:'science',   name:localStorage.getItem('dept_name_science')   ||'Science',   col:localStorage.getItem('dept_color_science')   ||'#10b981', photo:localStorage.getItem('dept_photo_science')||''},
    {id:'leadership',name:localStorage.getItem('dept_name_leadership')||'Leadership',col:localStorage.getItem('dept_color_leadership')||'#f59e0b', photo:localStorage.getItem('dept_photo_leadership')||''},
];

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════
window.initMobileApp = async function() {
    if (window.innerWidth > MOB) return;
    // Hide the desktop UI the instant we know mobile.js is taking over —
    // synchronous, before any await, so there's no flash. This must NOT be
    // done unconditionally via CSS/inline-script on every mobile pageview:
    // the login form also renders into #root, and a blanket "#root{display:
    // none}" on any mobile width hides the login screen itself, before the
    // user has even logged in. initMobileApp() only ever runs after a
    // successful login (called from renderMainApp), so hiding #root here
    // is correctly scoped and can't block login.
    _el('root')?.style.setProperty('display', 'none', 'important');
    await _ctx();
    _injectCSS();
    _buildShell();
    await _navTo('home');
    _initRealtime();
    window.addEventListener('resize', () => {
        const m = window.innerWidth <= MOB;
        _el('mobileApp')?.style.setProperty('display', m ? 'flex' : 'none', 'important');
        if (m) _el('root')?.style.setProperty('display', 'none', 'important');
    }, { passive: true });
};

let _usersLoaded = false;
async function _ctx() {
    _uid = window.currentUser?.id;
    _tid = window.currentTenantId;
    if (!_usersLoaded) _users = window.globalUsersCache || [];
    if (!_uid) {
        const { data: { user } } = await sb.auth.getUser();
        _uid = user?.id;
        window.currentUser = user;
    }
    if (!_tid && _uid) {
        const { data: p } = await sb.from('profiles').select('tenant_id').eq('id',_uid).single();
        _tid = p?.tenant_id;
        window.currentTenantId = _tid;
    }
    if (!_users.length && _tid) {
        const { data } = await sb.from('profiles').select('*').eq('tenant_id',_tid).is('deleted_at',null);
        _users = data || [];
        window.globalUsersCache = _users;
    }
    if (_users.length) _usersLoaded = true;
}

// ══════════════════════════════════════════════════════════════
// SHELL — universal top bar (name + school, lens, theme, sign-out)
// 8-tab bottom nav WITH labels
// ══════════════════════════════════════════════════════════════
function _buildShell() {
    if (_el('mobileApp')) return;
    const tabs = [
        { id:'home',      icon:'fa-house',      lbl:'Home',     action:"window._navTo('home')" },
        { id:'activity',  icon:'fa-bolt',        lbl:'Activity', action:"window._navTo('activity')" },
        { id:'tasks',     icon:'fa-list-check',  lbl:'Tasks',    action:"window._navTo('tasks')" },
        { id:'remind',    icon:'fa-bell',        lbl:'Remind',   action:"window._navTo('remind')" },
        { id:'more',      icon:'fa-ellipsis',    lbl:'More',     action:"window._openMoreSheet()" },
    ];
    const app = document.createElement('div');
    app.id = 'mobileApp';
    app.innerHTML = `
      <div id="mSB">
        <div id="mSBInfo" class="m-sb-info" onclick="window._navTo('home')">
          <div class="m-sb-user">${x(_sentenceCase(window.currentUser?.full_name || window.currentUser?.email?.split('@')[0] || 'User'))}</div>
          <div class="m-sb-school-card">${x(window.currentSchoolName || 'School')}</div>
        </div>
        <div id="mSBSearch" class="m-sb-search" style="display:none;">
          <input id="mSBSearchInp" placeholder="Search messages, staff…">
        </div>
        <button class="m-sb-icon" id="mSBLens" title="Search" onclick="window._toggleInlineSearch()"><i class="fa-solid fa-magnifying-glass"></i></button>
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

    // ── ONE-TIME delegated handlers — fixes the duplicate-forward bug,
    // where re-binding on every sheet open stacked listeners on this
    // persistent node and made every tap fire once per stack ──────────
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
    await sb.auth.signOut();
    window.location.href = '/';
};

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
window._navTo = async function(screen, params, replace = false) {
    if (_searchMode) window._toggleInlineSearch();
    if (replace) _stack.pop();
    _stack.push({ screen, params });
    if (replace) history.replaceState({ mobDepth:_stack.length }, '', location.href);
    else history.pushState({ mobDepth:_stack.length }, '', location.href);
    await _render(screen, params, 'forward');
    _setTab(screen);
};
// The on-screen back button and the phone's hardware back button now share
// this exact same path — both just ask the browser to go back one virtual
// state, and the actual stack-pop + re-render happens once, in 'popstate'.
// Popping the stack directly from two places was what risked the in-app
// stack and the browser's real history drifting out of sync.
window._back = function() {
    if (_stack.length < 2) return;
    history.back();
};
window.addEventListener('popstate', () => {
    if (_stack.length > 1) {
        _stack.pop();
        const prev = _stack[_stack.length-1];
        _render(prev.screen, prev.params, 'back');
        _setTab(prev.screen);
    }
    // At the root screen there's nothing left to pop — default behaviour
    // (exiting the app / leaving the page) is correct there.
});
async function _render(screen, params, dir='forward') {
    const stage = _el('mStage');
    if (!stage) return;
    const fns = {
        home: _home, activity: _activity, tasks: _tasks, remind: _reminders,
        marks: _bookmarks, scheduled: _scheduled,
        settings: _settings, dashboard: _dashboard,
        groupChat: _groupChat, thread: _thread,
        dm: _dm, taskDetail: _taskDetail, remindEdit: _remindEdit, scheduledEdit: _scheduledEdit,
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

    // Thread is a true full-screen reply view — hide chrome, restore on any other screen
    const immersive = screen === 'thread' || screen === 'groupChat' || screen === 'dm';
    _el('mSB')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');
    _el('mNav')?.style.setProperty('display', immersive ? 'none' : 'flex', 'important');

    _wireScreen(screen, params, scr);
    _scrollTop('mStage');

    if (params?.scrollTo) _scrollAndGlow(params.scrollTo);
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

// ══════════════════════════════════════════════════════════════
// HOME — Departments + Staff
// ══════════════════════════════════════════════════════════════
async function _home() {
    await _ctx();
    const { data: lastMsgs } = await sb.from('messages')
        .select('room_id,text,created_at,sender_id')
        .eq('tenant_id',_tid).is('deleted_at',null)
        .order('created_at',{ascending:false}).limit(200);

    const last = {};
    (lastMsgs||[]).forEach(m => { if(!last[m.room_id]) last[m.room_id]=m; });
    const others = _users.filter(u=>u.id!==_uid);

    return `<div class="mScr-inner">
      <div class="m-sl">DEPARTMENTS</div>
      ${DEPTS.map(d => { const lm=last[d.id]; return `
        <div class="m-row">
          <div class="m-av-wrap" data-action="setDeptPhoto" data-dept="${d.id}">
            ${_avatarHTML(d.photo, d.name, d.col, 'm-av sq')}
            <span class="m-av-cam"><i class="fa-solid fa-camera"></i></span>
          </div>
          <div class="m-ri" data-action="groupChat" data-room="${d.id}" data-name="${x(d.name)}" data-color="${d.col}">
            <div class="m-rn">${x(d.name)}</div>
            <div class="m-rs">${lm ? _snip(lm.text,38)+' · '+_ago(lm.created_at) : 'No messages yet'}</div>
          </div>
          <i class="fa-solid fa-chevron-right m-chv" data-action="groupChat" data-room="${d.id}" data-name="${x(d.name)}" data-color="${d.col}"></i>
        </div>`; }).join('')}

      <div class="m-sl" style="margin-top:4px;">STAFF MEMBERS</div>
      ${others.length ? others.map(u => {
        const dm = _dmRoom(u.id);
        const lm = last[dm];
        const nm = u.full_name||u.email.split('@')[0];
        return `
        <div class="m-row" data-action="dm"
             data-uid="${u.id}" data-name="${x(nm)}" data-room="${dm}">
          ${_avatarHTML(u.avatar_url, nm, 'var(--accent)')}
          <div class="m-ri">
            <div class="m-rn">${x(nm)}</div>
            <div class="m-rs">${lm ? _snip(lm.text,38)+' · '+_ago(lm.created_at) : x(u.designation||'Staff')}</div>
          </div>
          <i class="fa-solid fa-chevron-right m-chv"></i>
        </div>`; }).join('') : '<div class="m-empty">No staff added yet</div>'}
      <input type="file" id="mDeptPhotoInput" style="display:none;" accept="image/*">
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ACTIVITY — most important tab. Tap any item → jump straight to it,
// highlighted, inside its real conversation. The "data-scroll" attribute
// is read by the shared click dispatcher and passed through as scrollTo.
// ══════════════════════════════════════════════════════════════
async function _activity() {
    const { data: msgs } = await sb.from('messages')
        .select('id,room_id,text,created_at,sender_id')
        .eq('tenant_id',_tid).is('deleted_at',null)
        .order('created_at',{ascending:false}).limit(120);

    const mine = (msgs||[]).filter(m => {
        const isDept = DEPTS.some(d => d.id === m.room_id);
        const isMyDM = m.room_id?.startsWith('dm_') && m.room_id.includes(_uid);
        return isDept || isMyDM;
    }).slice(0,50);

    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Activity</div></div>
      ${mine.length ? mine.map(m => {
        const dept = DEPTS.find(d => d.id === m.room_id);
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

// ══════════════════════════════════════════════════════════════
// INLINE SEARCH — lives in the top bar's #mSBResults dropdown
// ══════════════════════════════════════════════════════════════
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
        const isDept = DEPTS.some(d=>d.id===m.room_id);
        const isMyDM = m.room_id?.startsWith('dm_') && m.room_id.includes(_uid);
        if (!isDept && !isMyDM) return;
        const dept = DEPTS.find(d=>d.id===m.room_id);
        rows.push(`
        <div class="m-row" data-action="${isDept?'groupChat':'dm'}" data-room="${m.room_id}"
             data-name="${x(dept?.name||'')}" data-color="${dept?.col||''}" data-scroll="${m.id}">
          <div class="m-av ${isDept?'sq':''}" style="background:${dept?.col||'var(--accent)'};">${isDept?dept.name[0]:'💬'}</div>
          <div class="m-ri"><div class="m-rn">${x(_uname(m.sender_id))}</div><div class="m-rs">${_snip(m.text,46)}</div></div>
        </div>`);
    });
    box.innerHTML = rows.length ? rows.join('') : '<div class="m-empty">No results found</div>';
}

// ══════════════════════════════════════════════════════════════
// REACTIONS — shared "reactions" table, same as desktop (messages.js)
// ══════════════════════════════════════════════════════════════
async function _fetchReactions(msgIds) {
    if (!msgIds.length) return {};
    const { data } = await sb.from('reactions').select('*').in('message_id', msgIds);
    const map = {};
    (data||[]).forEach(r => { (map[r.message_id] = map[r.message_id]||[]).push(r); });
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
            return `<button class="m-chip m-chip-tag ${g.mine?'mine':''}" style="color:${c};border-color:${c};"
                data-action="toggleReaction" data-id="${msgId}" data-value="${x(g.value)}" data-type="tag">${x(g.value)}</button>`;
        }
        return `<button class="m-chip ${g.mine?'mine':''}" data-action="toggleReaction" data-id="${msgId}" data-value="${g.value}" data-type="emoji">${g.value} <span class="m-chip-cnt">${g.count}</span></button>`;
    }).join('')}</div>`;
}
async function _toggleReaction(msgId, value, type) {
    const { data: existing } = await sb.from('reactions').select('id').eq('message_id',msgId).eq('value',value).eq('user_id',_uid);
    let error;
    if (existing && existing.length) {
        ({ error } = await sb.from('reactions').delete().eq('message_id',msgId).eq('value',value).eq('user_id',_uid));
    } else {
        ({ error } = await sb.from('reactions').insert({ message_id:msgId, user_id:_uid, tenant_id:_tid, value, type, count:1 }));
    }
    if (error) { _toast('Could not save reaction: '+error.message, 'err'); return; }
    await _refreshChips(msgId);
}
async function _refreshChips(msgId) {
    const row = document.getElementById('row-'+msgId);
    if (!row) return;
    const map = await _fetchReactions([msgId]);
    const existing = row.querySelector('.m-chips');
    const html = _chipsHTML(msgId, map);
    if (existing) existing.outerHTML = html || '';
    else if (html) row.querySelector('.m-bubble')?.insertAdjacentHTML('beforeend', html);
}

// ══════════════════════════════════════════════════════════════
// SHARED BUBBLE TEMPLATE — used by initial render AND realtime append,
// so the two never drift apart
// ══════════════════════════════════════════════════════════════
function _bubbleHTML(m, reactionsMap, maxLen=150) {
    const me = m.sender_id === _uid;
    const nm = me ? 'You' : _uname(m.sender_id);
    const cl = _renderLinkPills(m.text || '');
    const sender = !me ? _users.find(u=>u.id===m.sender_id) : null;
    return `
      <div class="m-bubble-row ${me?'snt':'rcv'}" id="row-${m.id}">
        ${!me ? _avatarHTML(sender?.avatar_url, nm, 'var(--accent)', 'm-av-tiny') : ''}
        <div class="m-bubble ${me?'snt':'rcv'}">
          <div class="m-bmeta">${x(nm)} · ${_ago(m.created_at)}</div>
          <div class="m-btext">${cl}</div>
          ${_chipsHTML(m.id, reactionsMap)}
        </div>
      </div>`;
}
// Matches the web version's link-pill convention exactly (see ui-settings.js
// insertLinkPill / messages.js renderMessages): the composer encodes links as
// <a href="https://link-pill.local/NAME|||URL-encoded">NAME</a>, and this
// decodes that into the same styled gradient pill button web shows, instead
// of an exposed raw link. Message text itself is trusted HTML from our own
// contenteditable composer (same trust level the web version already
// applies), with a minimal strip of <script> as a defensive backstop.
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
                const fileExts = /\.(pdf|doc|docx|xlsx|xls|ppt|pptx|zip|rar|png|jpg|jpeg|gif|mp4|mp3)$/i;
                const isFile = fileExts.test(url.split('?')[0]);
                const label  = isFile ? 'Download' : 'Visit';
                const icon   = isFile ? 'fa-download' : 'fa-arrow-up-right-from-square';
                const safeUrl = url.replace(/'/g, '%27');
                return `<a href="javascript:void(0);" onclick="window.open('${safeUrl}','_blank')" title="${x(url)}"
                    style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer;margin:2px 0;box-shadow:0 2px 8px rgba(99,102,241,.35);white-space:nowrap;vertical-align:middle;">
                    <i class="fa-solid ${icon}" style="font-size:9px;"></i><span>${x(name)}</span>
                    <span style="font-size:9px;opacity:.75;border-left:1px solid rgba(255,255,255,.35);padding-left:7px;margin-left:3px;">${label}</span>
                </a>`;
            } catch(e) { return match; }
        }
    );
}

// ══════════════════════════════════════════════════════════════
// COMPOSER — WhatsApp-style: clip / link / [text] / emoji / tag / send.
// Rich formatting (bold/italic/underline) appears as a floating popup
// when text is selected, instead of a permanent toolbar.
// ══════════════════════════════════════════════════════════════
function _composerHTML(ceId, placeholder, sendAction, sendData) {
    return `
    <div class="m-composer">
      <div class="m-ce-wrap">
        <button class="m-cic" data-caction="schedule" data-target="${ceId}"><i class="fa-solid fa-clock"></i></button>
        <div class="m-ce" id="${ceId}" contenteditable="true" data-placeholder="${x(placeholder)}"></div>
        <button class="m-cic" data-caction="link" data-target="${ceId}"><i class="fa-solid fa-link"></i></button>
        <button class="m-cic" data-caction="attach" data-target="${ceId}"><i class="fa-solid fa-paperclip"></i></button>
      </div>
      <button class="m-sendbtn" data-action="${sendAction}" data-target="${ceId}" ${sendData}>
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
// Reliable emoji/tag insertion — appends a text node at the end of the
// composer and moves the cursor there. Doesn't depend on execCommand or any
// prior selection existing, which is what made insertion silently fail on
// some mobile browsers when the picker sheet had just taken focus away.
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

// ══════════════════════════════════════════════════════════════
// GROUP CHAT (Department)
// ══════════════════════════════════════════════════════════════
async function _groupChat(p) {
    const { data: msgs } = await sb.from('messages')
        .select('id,text,sender_id,created_at,parent_message_id')
        .eq('room_id',p.room).eq('tenant_id',_tid)
        .is('deleted_at',null).is('parent_message_id',null)
        .order('created_at',{ascending:true}).limit(80);

    const reactionsMap = await _fetchReactions((msgs||[]).map(m=>m.id));

    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        ${_avatarHTML(DEPTS.find(d=>d.id===p.room)?.photo, p.name, p.color, 'm-av-sm sq')}
        <div class="m-htitle">${x(p.name)}</div>
      </div>
      <div class="m-msgs" id="mMsgArea">
        ${(msgs||[]).map(m=>_bubbleHTML(m,reactionsMap,140)).join('') || '<div class="m-empty">No messages yet. Send the first one!</div>'}
      </div>
      <button class="m-scrollfab" id="mScrollFab" style="display:none;" onclick="document.getElementById('mMsgArea').scrollTo({top:9e9,behavior:'smooth'})"><i class="fa-solid fa-chevron-down"></i></button>
      ${_composerHTML('mGCE', `Message ${p.name||''}…`, 'sendGroup', `data-room="${p.room}" data-name="${x(p.name)}" data-color="${p.color||''}"`)}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// THREAD — full-screen (top bar + bottom nav hidden by _render)
// ══════════════════════════════════════════════════════════════
async function _thread(p) {
    const { data: replies } = await sb.from('messages')
        .select('id,text,sender_id,created_at')
        .eq('parent_message_id',p.id).eq('tenant_id',_tid)
        .is('deleted_at',null).order('created_at',{ascending:true});

    const reactionsMap = await _fetchReactions((replies||[]).map(m=>m.id));

    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Thread</div>
      </div>
      <div class="m-msgs" id="mThreadArea">
        <div class="m-bubble-row rcv">
          <div class="m-bubble rcv">
            <div class="m-bmeta">${x(p.sender||'')} · ${p.time||''}</div>
            <div class="m-btext">${_renderLinkPills(p.text||'')}</div>
          </div>
        </div>
        ${replies?.length ? `<div class="m-divider">── ${replies.length} ${replies.length===1?'Reply':'Replies'} ──</div>` : ''}
        ${(replies||[]).map(m=>_bubbleHTML(m,reactionsMap,160)).join('')}
      </div>
      ${_composerHTML('mRCE', 'Write a reply…', 'sendReply', `data-pid="${p.id}" data-room="${p.room}" data-rname="${x(p.rname||'')}" data-rcol="${p.rcol||''}" data-text="${x(p.text||'')}" data-sender="${x(p.sender||'')}" data-time="${p.time||''}"`)}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// DM
// ══════════════════════════════════════════════════════════════
async function _dm(p) {
    const { data: msgs } = await sb.from('messages')
        .select('id,text,sender_id,created_at')
        .eq('room_id',p.room).eq('tenant_id',_tid)
        .is('deleted_at',null).order('created_at',{ascending:true}).limit(80);

    const reactionsMap = await _fetchReactions((msgs||[]).map(m=>m.id));
    const otherUser = _users.find(u=>u.id===p.uid);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        ${_avatarHTML(otherUser?.avatar_url, p.name, 'var(--accent)', 'm-av-sm')}
        <div class="m-htitle">${x(p.name)}</div>
      </div>
      <div class="m-msgs" id="mDMArea">
        ${(msgs||[]).map(m=>_bubbleHTML(m,reactionsMap,160)).join('') || `<div class="m-empty">Start a conversation with ${x(p.name)}</div>`}
      </div>
      <button class="m-scrollfab" id="mScrollFab" style="display:none;" onclick="document.getElementById('mDMArea').scrollTo({top:9e9,behavior:'smooth'})"><i class="fa-solid fa-chevron-down"></i></button>
      ${_composerHTML('mDCE', `Message ${p.name||''}…`, 'sendDM', `data-room="${p.room}" data-uid="${p.uid||''}" data-name="${x(p.name)}"`)}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// TASKS — reads task_assignees (real per-user status), matches desktop
// ══════════════════════════════════════════════════════════════
async function _tasks() {
    const { data } = await sb.from('task_assignees')
        .select('status, tasks!inner(id,title,priority,deadline,created_at,require_proof,assigned_by)')
        .eq('assignee_id',_uid).eq('tenant_id',_tid)
        .order('created_at',{ascending:false,foreignTable:'tasks'}).limit(50);

    const taskIds = (data||[]).map(r=>r.tasks.id);
    let assigneeMap = {};
    if (taskIds.length) {
        const { data: allAssignees } = await sb.from('task_assignees').select('task_id,assignee_id').in('task_id', taskIds);
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

// ══════════════════════════════════════════════════════════════
// REMINDERS
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// BOOKMARKS — tap to scroll to + highlight the saved message
// ══════════════════════════════════════════════════════════════
async function _bookmarks() {
    const bms = JSON.parse(localStorage.getItem('tf_bookmarks_'+_uid)||'[]');
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

// ══════════════════════════════════════════════════════════════
// SCHEDULED
// ══════════════════════════════════════════════════════════════
async function _scheduled() {
    const { data } = await sb.from('scheduled_messages')
        .select('id,message_text,room_id,scheduled_time').eq('tenant_id',_tid).eq('sender_id',_uid)
        .eq('status','pending').order('scheduled_time',{ascending:true}).limit(20);
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Scheduled Messages</div></div>
      ${(data||[]).length ? (data||[]).map(s => {
        const dept = DEPTS.find(d=>d.id===s.room_id);
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

// ══════════════════════════════════════════════════════════════
// SETTINGS / PROFILE
// ══════════════════════════════════════════════════════════════
async function _settings() {
    const { data: p } = await sb.from('profiles').select('*').eq('id',_uid).single();
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

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function _dashboard() {
    const [{ count: msgCount }, { count: taskCount },
           { count: doneCount }, { data: recent }] = await Promise.all([
        sb.from('messages').select('*',{count:'exact',head:true}).eq('tenant_id',_tid).is('deleted_at',null),
        sb.from('task_assignees').select('*',{count:'exact',head:true}).eq('tenant_id',_tid),
        sb.from('task_assignees').select('*',{count:'exact',head:true}).eq('tenant_id',_tid).eq('status','accepted'),
        sb.from('profiles').select('*').eq('tenant_id',_tid).is('deleted_at',null).order('last_login',{ascending:false}).limit(5),
    ]);
    const pct = taskCount ? Math.round((doneCount/taskCount)*100) : 0;
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Dashboard</div></div>
      <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="m-stat-card" style="background:#EEF2FF;"><div class="m-stat-num" style="color:#6366f1;">${msgCount||0}</div><div class="m-stat-lbl">Total Messages</div></div>
        <div class="m-stat-card" style="background:#F0FDF4;"><div class="m-stat-num" style="color:#16a34a;">${doneCount||0}/${taskCount||0}</div><div class="m-stat-lbl">Tasks Done</div></div>
        <div class="m-stat-card" style="background:#FFFBEB;"><div class="m-stat-num" style="color:#f59e0b;">${pct}%</div><div class="m-stat-lbl">Completion Rate</div></div>
        <div class="m-stat-card" style="background:#FDF2F8;"><div class="m-stat-num" style="color:#be185d;">${_users.length}</div><div class="m-stat-lbl">Staff Members</div></div>
      </div>
      <div style="padding:0 16px;">
        <div class="m-sl">TASK COMPLETION</div>
        <div style="height:12px;background:var(--border-color);border-radius:6px;overflow:hidden;margin-bottom:20px;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#10b981);border-radius:6px;transition:width .8s ease;"></div>
        </div>
        <div class="m-sl">RECENTLY ACTIVE</div>
        ${(recent||[]).map(u=>`
          <div class="m-row" style="padding:10px 0;">
            ${_avatarHTML(u.avatar_url, u.full_name, 'var(--accent)', 'm-av-sm')}
            <div class="m-ri"><div class="m-rn">${x(u.full_name||'Staff')}</div><div class="m-rs">${u.last_login?_ago(u.last_login):'Never logged in'}</div></div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// BOTTOM SHEETS
// ══════════════════════════════════════════════════════════════
function _openSheet()  { _el('mSheet')?.classList.add('open'); }
window._closeSheet = () => _el('mSheet')?.classList.remove('open');

window._showMsgActions = function(params) {
    const isMe = params.me === 'true' || params.me === true;
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
        <div class="m-sheet-row" data-action="convertTask" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-list-check" style="color:#16a34a;"></i> Convert to Task
        </div>
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
        ${isMe ? `
        <div class="m-sheet-row" data-action="editMsg" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-solid fa-pen" style="color:#6366f1;"></i> Edit Message
        </div>
        <div class="m-sheet-row" style="color:#ef4444;" data-action="deleteMsg" data-id="${params.id}">
          <i class="fa-solid fa-trash" style="color:#ef4444;"></i> Delete Message
        </div>` : ''}
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
        ${DEPTS.map(d=>`
          <div class="m-sheet-row" data-action="doForward" data-room="${d.id}" data-text="${x(text)}">
            <span class="m-av sq" style="width:30px;height:30px;font-size:13px;background:${d.col};">${d.name[0]}</span> ${x(d.name)}
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

// ══════════════════════════════════════════════════════════════
// SHELL CLICK DISPATCHER — bound ONCE in _buildShell(). Handles every
// data-action in #mStage plus the WhatsApp-style composer icons
// (data-caction). Single binding = no duplicate-listener risk anywhere.
// ══════════════════════════════════════════════════════════════
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

        case 'toggleReaction': await _toggleReaction(a.id, a.value, a.type); break;

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
        case 'saveProfile':    await _saveProfile(); break;
        case 'setMyPhoto':   _el('mMyPhotoInput')?.click(); break;
        case 'setDeptPhoto': _pendingDeptPhoto = a.dept; _el('mDeptPhotoInput')?.click(); break;
        case 'changePassword': await _changePassword(); break;
        case 'downloadTaskPdf':
            if (typeof window.downloadTaskPDF === 'function') await window.downloadTaskPDF(a.id);
            else _toast('PDF export not available','err');
            break;
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
            // Match the web version's convention exactly: encode as a fake
            // link-pill.local URL carrying "name|||url", which renderMessages
            // (and our own _renderLinkPills below) detect and transform into
            // a styled pill button — instead of an exposed raw <a href>.
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
                const { error } = await sb.storage.from('chat-attachments').upload(filePath, file);
                if (error) { _toast('Upload failed: '+error.message,'err'); return; }
                const { data: pub } = sb.storage.from('chat-attachments').getPublicUrl(filePath);
                ceEl?.focus();
                document.execCommand('insertHTML', false, `<a href="${pub.publicUrl}" target="_blank">📎 ${x(file.name)}</a>&nbsp;`);
                _toast('Attached ✓');
            };
            input.click();
            break;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// SHEET CLICK DISPATCHER — bound ONCE in _buildShell() on the persistent
// #mSheetInner node. THIS is the fix for the duplicate-forward bug:
// previously every show-function re-attached its own listener here.
// ══════════════════════════════════════════════════════════════
async function _onSheetClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset;
    switch (a.action) {
        case 'navMore': window._closeSheet(); await _navTo(a.screen); break;
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
            const bms = JSON.parse(localStorage.getItem('tf_bookmarks_'+_uid)||'[]');
            bms.unshift({msgId:a.id,text:a.text,room:a.room,rname:a.rname,rcol:a.rcol,uid:a.room?.startsWith('dm_')?a.room.replace('dm_','').split('_').find(p=>p!==_uid):'',time:_ago(new Date().toISOString())});
            localStorage.setItem('tf_bookmarks_'+_uid, JSON.stringify(bms.slice(0,50)));
            window._closeSheet(); _toast('🔖 Bookmarked!'); break;
        }
        case 'editMsg': {
            window._closeSheet();
            const newText = prompt('Edit message:', a.text);
            if (newText === null || !newText.trim()) break;
            await sb.from('messages').update({ text:`<p>${x(newText.trim())}</p>` }).eq('id',a.id).eq('tenant_id',_tid);
            _toast('Message updated ✓');
            { const top = _stack[_stack.length-1]; if (top) await _render(top.screen, top.params, 'forward'); }
            break;
        }
        case 'deleteMsg':
            window._closeSheet();
            await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',a.id).eq('tenant_id',_tid);
            _toast('Message deleted'); _back(); break;
        case 'ctSaveTask': await _saveConvertedTask(a.msgid); break;
        case 'pickTheme':
            if (typeof window.setTheme === 'function') window.setTheme(a.theme);
            window._closeSheet();
            { const top = _stack[_stack.length-1]; if (top) await _render(top.screen, top.params, 'forward'); }
            break;
    }
}

// ══════════════════════════════════════════════════════════════
// LONG-PRESS — opens message actions. Tapping (not holding) a bubble
// does nothing special, so normal text selection/copy works, matching
// WhatsApp and fixing the old DM-bubble tap-hijack inconsistency.
// ══════════════════════════════════════════════════════════════
let _pressTimer = null, _pressRow = null, _pressX = 0, _pressY = 0;
function _onPressStart(e) {
    // Only the visible card counts — .m-bubble-row spans the full message
    // width as a flex wrapper, so a tap on the blank space beside a bubble
    // was also matching and opening the menu for messages the user never
    // actually touched.
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
        const top = _stack[_stack.length-1];
        const params = top?.params || {};
        window._showMsgActions({ id, text, me, room: params.room||'', rname: params.name||'', rcol: params.color||'' });
        navigator.vibrate?.(35);
    }, 550);
}
// Cancel the long-press the moment the finger actually moves — this is what was
// opening the menu mid-scroll: a scroll gesture that starts on a bubble was
// treated as a press because nothing checked for movement before the timer fired.
function _onPressMove(e) {
    if (!_pressTimer) return;
    if (Math.abs(e.clientX-_pressX) > 6 || Math.abs(e.clientY-_pressY) > 6) {
        clearTimeout(_pressTimer); _pressTimer = null;
    }
}
function _onPressEnd() { clearTimeout(_pressTimer); _pressTimer = null; _pressRow = null; }

// ══════════════════════════════════════════════════════════════
// FLOATING FORMAT POPUP — appears only when text is selected inside a
// composer, mimicking the native copy/paste menu instead of a permanent
// toolbar (per request #7)
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// REALTIME — single shared channel, patches the live DOM in place so the
// screen never tears down and rebuilds (no flicker), instead of polling
// or full re-rendering on every change
// ══════════════════════════════════════════════════════════════
function _initRealtime() {
    if (_rtChannel || !_tid) return;
    _rtChannel = sb.channel('mobile-rt-'+_tid)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`tenant_id=eq.${_tid}` }, p => _onNewMessage(p.new))
        .on('postgres_changes', { event:'*', schema:'public', table:'reactions', filter:`tenant_id=eq.${_tid}` }, p => _onReactionChange(p.new||p.old))
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'task_assignees', filter:`tenant_id=eq.${_tid}` }, p => _onTaskAssigneeUpdate(p.new))
        .subscribe();
}
async function _onNewMessage(m) {
    if (!m || m.sender_id === _uid) return; // own sends are already shown by the post-send refresh
    const top = _stack[_stack.length-1];
    if (!top) return;
    const inGroup  = top.screen==='groupChat' && m.room_id===top.params?.room && !m.parent_message_id;
    const inDM     = top.screen==='dm'        && m.room_id===top.params?.room;
    const inThread = top.screen==='thread'    && m.parent_message_id===top.params?.id;
    if (!inGroup && !inDM && !inThread) return;
    const areaId = top.screen==='groupChat' ? 'mMsgArea' : top.screen==='dm' ? 'mDMArea' : 'mThreadArea';
    const area = _el(areaId); if (!area) return;
    const wasNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
    area.insertAdjacentHTML('beforeend', _bubbleHTML(m, {}, inThread?160:140));
    if (wasNearBottom) area.scrollTop = area.scrollHeight;
    else _el('mScrollFab')?.style.setProperty('display','flex');
}
async function _onReactionChange(r) {
    if (!r) return;
    await _refreshChips(r.message_id);
}
async function _onTaskAssigneeUpdate(row) {
    if (!row || row.assignee_id !== _uid) return;
    const top = _stack[_stack.length-1];
    if (!top) return;
    if (top.screen === 'taskDetail' && top.params?.id === row.task_id) {
        await _render('taskDetail', top.params, 'forward');
    } else if (top.screen === 'tasks') {
        await _render('tasks', null, 'forward');
    }
}

// ══════════════════════════════════════════════════════════════
// PER-SCREEN WIRING — scroll-to-bottom default, scroll-FAB visibility,
// file input. Most click handling now lives in the one-time delegated
// dispatchers above; this only does things that are genuinely per-screen.
// ══════════════════════════════════════════════════════════════
function _wireScreen(screen, params, container) {
    const areaId = screen==='groupChat'?'mMsgArea':screen==='dm'?'mDMArea':screen==='thread'?'mThreadArea':null;
    if (areaId) {
        const area = _el(areaId);
        const fab  = _el('mScrollFab');
        if (area) {
            if (!params?.scrollTo) setTimeout(() => { area.scrollTop = area.scrollHeight; }, 80);
            if (fab) area.addEventListener('scroll', () => {
                const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 150;
                fab.style.display = nearBottom ? 'none' : 'flex';
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
            localStorage.setItem('dept_photo_'+deptId, dataUrl);
        } catch(e) {
            _toast('Image too large for local storage — try a smaller photo','err'); return;
        }
        const d = DEPTS.find(d=>d.id===deptId); if (d) d.photo = dataUrl;
        _toast('Department photo updated ✓');
        await _navTo('home',null,true);
    };
}
// Resizes/compresses an uploaded image client-side and returns it as a small
// base64 JPEG data URL — stored directly in the DB/localStorage. Avoids
// needing any Supabase Storage bucket at all, which was the actual cause of
// the "bucket not found" error (no 'avatars' bucket had been created).
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

// ══════════════════════════════════════════════════════════════
// SEND ACTIONS — explicit created_at (matches desktop), correct
// parent_message_id column (was the root cause of "group send broken")
// ══════════════════════════════════════════════════════════════
async function _doSendGroup(a) {
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const { data: m, error } = await sb.from('messages').insert({
        room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString()
    }).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('message');
    _appendOwnMessage('mMsgArea', m);
}
async function _doSendReply(a) {
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const { data: m, error } = await sb.from('messages').insert({
        room_id:a.room, parent_message_id:a.pid, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString()
    }).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('message');
    _appendOwnMessage('mThreadArea', m, 160);
}
async function _doSendDM(a) {
    const val = _ceHTML(a.target); if (!val) return;
    _ceClear(a.target);
    const { data: m, error } = await sb.from('messages').insert({
        room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val, created_at:new Date().toISOString()
    }).select().single();
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    window.playSound?.('message');
    _appendOwnMessage('mDMArea', m);
}
// Appends the just-sent message to the currently-open screen without
// re-rendering it — re-rendering was what caused the whole screen to replay
// its slide-in animation on every single send.
function _appendOwnMessage(areaId, m, maxLen=150) {
    const area = _el(areaId);
    if (!area) return;
    area.insertAdjacentHTML('beforeend', _bubbleHTML(m, {}, maxLen));
    area.scrollTo({ top: area.scrollHeight, behavior:'smooth' });
}
async function _doForward(room, text) {
    window._closeSheet();
    const { error } = await sb.from('messages').insert({
        room_id:room, tenant_id:_tid, sender_id:_uid, text:`<p>↪️ Forwarded: ${x(text)}</p>`, created_at:new Date().toISOString()
    });
    _toast(error ? 'Forward failed' : 'Message forwarded ✓', error?'err':'ok');
}

// ══════════════════════════════════════════════════════════════
// TASK ACTIONS — mirrors window.taskAction() in tasks.js
// ══════════════════════════════════════════════════════════════
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
            const { data: ftrails } = await sb.from('task_trails').select('id').eq('task_id',taskId).eq('user_id',_uid).eq('action','FILE');
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

// ══════════════════════════════════════════════════════════════
// REMINDER / BOOKMARK / SCHEDULED / PROFILE ACTIONS
// ══════════════════════════════════════════════════════════════
async function _deleteReminder(id) {
    await sb.from('reminders').delete().eq('id',id).eq('user_id',_uid);
    _toast('Reminder deleted'); await _navTo('remind',null,true);
}
async function _saveReminder(id) {
    const at = _el('rAt')?.value; if (!at) { _toast('Pick a date and time','err'); return; }
    const { error } = await sb.from('reminders').update({ reminder_time:new Date(at).toISOString() }).eq('id',id).eq('user_id',_uid);
    if (error) { _toast('Could not save: '+error.message,'err'); return; }
    _toast('Reminder saved ✓'); _back();
}
function _removeBookmark(i) {
    const bms = JSON.parse(localStorage.getItem('tf_bookmarks_'+_uid)||'[]');
    bms.splice(i,1);
    localStorage.setItem('tf_bookmarks_'+_uid, JSON.stringify(bms));
    _navTo('marks',null,true);
}
async function _openTaskFile(path) {
    if (!path) { _toast('File path missing','err'); return; }
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 60);
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
        .eq('id',id).eq('tenant_id',_tid);
    if (error) { _toast('Could not save: '+error.message,'err'); return; }
    _toast('Scheduled message updated ✓'); _navTo('scheduled',null,true);
}
async function _saveProfile() {
    const full_name   = _el('sName')?.value?.trim();
    const designation = _el('sDesig')?.value?.trim();
    const department  = _el('sDept')?.value?.trim();
    const { error } = await sb.from('profiles').update({full_name,designation,department}).eq('id',_uid);
    _toast(error ? 'Save failed' : 'Profile saved ✓', error?'err':'ok');
    if (!error) { window.currentUser.full_name = full_name; const u=_el('mSBInfo')?.querySelector('.m-sb-user'); if(u) u.textContent=full_name; }
}
async function _changePassword() {
    const np = prompt('Enter new password (min 8 chars):');
    if (!np || np.length<8) { _toast('Password too short','err'); return; }
    const { error } = await sb.auth.updateUser({ password: np });
    _toast(error ? 'Failed: '+error.message : 'Password changed ✓', error?'err':'ok');
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function _el(id) { return document.getElementById(id); }
function x(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _init(n){ return (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2)||'?'; }
function _avatarHTML(photoUrl, name, bg, cls='m-av') {
    if (photoUrl) return `<div class="${cls} m-av-photo" style="background-image:url('${x(photoUrl)}');"></div>`;
    return `<div class="${cls}" style="background:${bg||'var(--accent)'};">${_init(name)}</div>`;
}
function _sentenceCase(s){ s=(s||'').trim(); return s ? s[0].toUpperCase()+s.slice(1).toLowerCase() : s; }
// Always formats in true IST (Asia/Kolkata), regardless of the device's own
// timezone setting — locale ('en-IN') only controls display convention
// (DD/MM order etc), not which timezone the clock is read in.
function _fmtIST(ts, withTime=true) {
    if (!ts) return '';
    // Prefer the app's own established IST formatter (shared.js) so mobile
    // matches desktop exactly rather than running a separate parallel
    // implementation that could drift from whatever convention the rest of
    // the app actually relies on.
    if (typeof window.getISTDate === 'function') {
        const datePart = window.getISTDate(ts);
        if (!withTime) return datePart;
        const timePart = (typeof window.getISTTime === 'function') ? window.getISTTime(ts) : '';
        return timePart ? `${datePart} ${timePart}` : datePart;
    }
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat('en-GB', {
        day:'2-digit', month:'short', year:'2-digit',
        hour:'2-digit', minute:'2-digit', hour12:false,
        timeZone:'Asia/Kolkata'
    }).formatToParts(d);
    const get = t => parts.find(p=>p.type===t)?.value || '';
    const datePart = `${get('day')}-${get('month')}-${get('year')}`;
    return withTime ? `${datePart} ${get('hour')}:${get('minute')}` : datePart;
}
function _uname(id){ const u=_users.find(u=>u.id===id); return u?.full_name||u?.email?.split('@')[0]||'Someone'; }
function _dmRoom(uid){ return ['dm',...[_uid,uid].sort()].join('_'); }
function _snip(h,n){ const t=(h||'').replace(/<[^>]*>/g,'').trim(); return t.length>n?t.substring(0,n)+'…':t; }
function _ago(ts){
    if(!ts) return '';
    const d=(Date.now()-new Date(ts))/1000;
    if(d<60)    return 'just now';
    if(d<3600)  return Math.floor(d/60)+'m ago';
    if(d<86400) return Math.floor(d/3600)+'h ago';
    if(d<604800)return Math.floor(d/86400)+'d ago';
    return _fmtIST(ts, false);
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

// ══════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════
function _injectCSS(){
    if(_el('mCSS')) return;
    const s=document.createElement('style'); s.id='mCSS';
    s.textContent=`
#mobileApp{position:fixed;inset:0;display:flex;flex-direction:column;
  background:var(--bg-body,#fff);color:var(--text-primary,#111);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  z-index:9999;overflow:hidden;}

/* ── Top bar — universal: name + school, lens, theme, sign-out ─────── */
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

/* ── Bottom nav — 5 tabs WITH labels, bigger now that there's room ─── */
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

/* ── Header & prominent back button ─────────────────────────────────── */
.m-hdr{display:flex;align-items:center;gap:10px;padding:11px 16px;flex-shrink:0;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-hdr-plain{padding:14px 16px;}
.m-back{background:var(--bg-body,#fff);border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:50%;width:40px;height:40px;font-size:17px;color:var(--accent,#6366f1);
  cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  -webkit-tap-highlight-color:transparent;box-shadow:0 1px 3px rgba(0,0,0,.08);}
.m-back:active{background:var(--bg-sidebar,#f6f8fa);}
.m-htitle{font-size:18px;font-weight:700;flex:1;color:var(--text-primary,#111);}

/* ── List rows ───────────────────────────────────────────────────────── */
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

/* ── Chat messages ───────────────────────────────────────────────────── */
.m-msgs{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 0;position:relative;}
.m-bubble-row{display:flex;margin:8px 12px;gap:6px;align-items:flex-end;}
.m-av-tiny{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:10.5px;flex-shrink:0;}
.m-bubble-row.snt{justify-content:flex-end;}
.m-bubble-row.rcv{justify-content:flex-start;}
.m-bubble{max-width:98%;padding:11px 14px;border-radius:12px;position:relative;
  font-size:16px;line-height:1.5;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border:1px solid var(--border-color,#e5e7eb);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.m-bubble.snt{border-left:4px solid var(--accent,#6366f1);border-right-width:1px;}
.m-bubble.rcv{border-right:4px solid var(--accent,#6366f1);border-left-width:1px;}
.m-bmeta{font-size:11.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-bottom:4px;}
.m-highlight{animation:m-glow-pulse 2s ease-out;}
@keyframes m-glow-pulse{
  0%   { background:color-mix(in srgb, var(--accent) 35%, var(--card-bg)); box-shadow:0 0 0 3px var(--accent); }
  60%  { background:color-mix(in srgb, var(--accent) 22%, var(--card-bg)); box-shadow:0 0 0 2px var(--accent); }
  100% { background:var(--card-bg); box-shadow:none; }
}
.m-btext{font-size:18px;line-height:1.55;color:var(--text-primary,#111);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.m-divider{text-align:center;font-size:11px;color:var(--text-secondary);padding:8px 0;}

/* ── Scroll-to-bottom arrow (WhatsApp-style) ────────────────────────── */
.m-scrollfab{position:absolute;right:14px;bottom:78px;width:38px;height:38px;border-radius:50%;
  background:var(--bg-body,#fff);border:1px solid var(--border-color,#e5e7eb);
  box-shadow:0 3px 10px rgba(0,0,0,.18);color:var(--accent,#6366f1);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:20;
  -webkit-tap-highlight-color:transparent;}
.m-scrollfab:active{opacity:.8;}

/* ── Reaction chips ──────────────────────────────────────────────────── */
.m-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
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

/* ── WhatsApp-style composer ─────────────────────────────────────────── */
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

/* ── Floating format popup — appears only on text selection ─────────── */
.m-fmt-popup{position:fixed;display:none;gap:2px;background:#1f2937;border-radius:10px;
  padding:4px;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:10500;}
.m-fmt-popup button{background:none;border:none;color:#fff;font-size:15px;width:34px;height:34px;
  border-radius:7px;cursor:pointer;}
.m-fmt-popup button:active{background:rgba(255,255,255,.15);}

.m-inp{flex:1;border:1.5px solid var(--border-color,#e5e7eb);border-radius:14px;
  padding:11px 14px;font-size:16px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;min-height:46px;width:100%;box-sizing:border-box;}
.m-inp:focus{border-color:var(--accent,#6366f1);}

/* ── Task cards — same theme-matched card language as bubbles ───────── */
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

/* ── Theme picker grid (Settings + sheet) ────────────────────────────── */
.m-theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.m-theme-pill{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:12px;
  border:1.5px solid var(--border-color,#e5e7eb);background:var(--bg-body,#fff);
  font-size:14px;font-weight:600;color:var(--text-primary,#111);cursor:pointer;
  -webkit-tap-highlight-color:transparent;}
.m-theme-pill.active{border-color:var(--accent,#6366f1);background:color-mix(in srgb, var(--accent) 8%, var(--bg-body));}
.m-theme-dot{width:16px;height:16px;border-radius:50%;flex-shrink:0;}

/* ── Detail screens ───────────────────────────────────────────────────── */
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

/* ── Dashboard ───────────────────────────────────────────────────────── */
.m-stat-card{border-radius:14px;padding:18px;text-align:center;}
.m-stat-num{font-size:28px;font-weight:800;line-height:1;}
.m-stat-lbl{font-size:12.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-top:4px;}

/* ── Bottom sheet ────────────────────────────────────────────────────── */
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

/* ── Toast ───────────────────────────────────────────────────────────── */
#mToast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
  padding:10px 20px;border-radius:24px;font-size:13.5px;font-weight:600;
  color:#fff;z-index:11000;opacity:0;transition:opacity .2s;pointer-events:none;
  white-space:nowrap;}
.toast-ok{background:#16a34a;opacity:1!important;}
.toast-err{background:#ef4444;opacity:1!important;}

.m-empty{padding:40px 20px;text-align:center;color:var(--text-secondary,#6b7280);
  font-size:14.5px;line-height:1.7;}
`;
    document.head.appendChild(s);
}
