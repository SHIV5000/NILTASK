/**
 * mobile.js — TaskFlow Native Mobile App  VER 5.0
 * 8-Tab: Home|Activity|Tasks|Reminders|Bookmarks|Scheduled|Settings|Dashboard
 * CHANGE LOG v4 → v5:
 *  • Added Activity tab (most important) — unified feed of recent messages
 *    across departments + your DMs, tap any item to jump + highlight it
 *  • Top bar: search box replaces clock/signal/battery
 *  • Bubbles & task cards restyled to match web's task-card theme (var(--card-bg)/
 *    var(--card-shadow)/accent side-border) so all 8 themes apply on mobile too
 *  • FIXED: convert-to-task never wrote a task_assignees row → task was
 *    invisible everywhere. Now inserts tasks + task_assignees + task_trails +
 *    notifies assignees, matching desktop's real creation flow exactly
 *  • FIXED: emoji/tag reactions wrote to a "message_reactions" table that
 *    doesn't exist — desktop reads "reactions". Now uses the same table,
 *    same toggle-on/off logic, and actually renders chips under bubbles
 *  • Added quick-text-tags (Thank You / Noted / Copied / Yes Sir / Yes Madam)
 *    matching desktop's tag system
 *  • Forward message now actually works — opens a picker, inserts to target room
 *  • Thread screen now hides top bar + bottom nav for a true full-screen reply
 *    view; back restores both
 *  • Rich text (bold/italic/bullet list via Quill — same library desktop uses)
 *    on every input: group send, DM send, thread reply, task update note
 *  • "Channels" renamed to "Departments" throughout
 *  • Bottom nav icons bigger; bubble/task-card text bumped toward WhatsApp size
 *  • Bookmarks now actually scroll to + highlight the saved message
 *  • Notification chime fix lives in notifications.js v1.1 (shared,
 *    gesture-unlocked AudioContext) — covers desktop too, not mobile-only
 * ★ STABLE RESTORE POINT — previous file (v4.0, 1209 lines) is preserved in
 *   git history. `git checkout HEAD~1 -- js/mobile.js` reverts this file alone.
 */
import { sb } from './shared.js';

const MOB = 768;
let _stack  = [];
let _dark   = localStorage.getItem('tf_theme') === 'dark';
let _uid    = null;
let _tid    = null;
let _users  = [];
let _pendingUploadTaskId = null;
let _activeQuill = null;

const DEPTS = [
    {id:'general',   name:localStorage.getItem('dept_name_general')   ||'General',   col:localStorage.getItem('dept_color_general')   ||'#6366f1'},
    {id:'math',      name:localStorage.getItem('dept_name_math')      ||'Mathematics',col:localStorage.getItem('dept_color_math')      ||'#0ea5e9'},
    {id:'science',   name:localStorage.getItem('dept_name_science')   ||'Science',   col:localStorage.getItem('dept_color_science')   ||'#10b981'},
    {id:'leadership',name:localStorage.getItem('dept_name_leadership')||'Leadership',col:localStorage.getItem('dept_color_leadership')||'#f59e0b'},
];

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════
window.initMobileApp = async function() {
    if (window.innerWidth > MOB) return;
    await _ctx();
    _injectCSS();
    _buildShell();
    _applyDark();
    _clock();
    await _navTo('home');
    window.addEventListener('resize', () => {
        const m = window.innerWidth <= MOB;
        _el('mobileApp')?.style.setProperty('display', m ? 'flex' : 'none', 'important');
        _el('root')?.style.setProperty('display', m ? 'none' : '', 'important');
    }, { passive: true });
};

async function _ctx() {
    _uid = window.currentUser?.id;
    _tid = window.currentTenantId;
    _users = window.globalUsersCache || [];
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
        const { data } = await sb.from('profiles').select('id,full_name,email,designation').eq('tenant_id',_tid).is('deleted_at',null);
        _users = data || [];
        window.globalUsersCache = _users;
    }
}

// ══════════════════════════════════════════════════════════════
// SHELL — 8 tabs, icon-only, search bar replaces clock/signal/battery
// ══════════════════════════════════════════════════════════════
function _buildShell() {
    _el('root')?.style.setProperty('display','none','important');
    if (_el('mobileApp')) return;
    const tabs = [
        { id:'home',      icon:'fa-house',      tip:'Home'      },
        { id:'activity',  icon:'fa-bolt',        tip:'Activity'  },
        { id:'tasks',     icon:'fa-list-check',  tip:'Tasks'     },
        { id:'remind',    icon:'fa-bell',        tip:'Reminders' },
        { id:'marks',     icon:'fa-bookmark',    tip:'Bookmarks' },
        { id:'scheduled', icon:'fa-clock',       tip:'Scheduled' },
        { id:'settings',  icon:'fa-gear',        tip:'Settings'  },
        { id:'dashboard', icon:'fa-chart-bar',   tip:'Dashboard' },
    ];
    const app = document.createElement('div');
    app.id = 'mobileApp';
    app.innerHTML = `
      <div id="mSB">
        <div id="mSearchWrap" onclick="window._navTo('search')">
          <i class="fa-solid fa-magnifying-glass" style="font-size:14px;color:var(--text-secondary);"></i>
          <span id="mSearchPlaceholder">Search messages, staff…</span>
        </div>
        <button id="mDark" title="Toggle theme" onclick="window._togDark()"></button>
      </div>
      <div id="mStage"></div>
      <div id="mNav">
        ${tabs.map(t=>`
          <button class="mn-btn" id="mnt-${t.id}" title="${t.tip}"
            onclick="window._navTo('${t.id}')">
            <i class="fa-solid ${t.icon}"></i>
          </button>`).join('')}
      </div>
      <div id="mSheet" onclick="window._closeSheet()"><div id="mSheetInner" onclick="event.stopPropagation()"></div></div>
      <div id="mToast"></div>`;
    document.body.appendChild(app);
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
window._navTo = async function(screen, params, replace = false) {
    if (replace) _stack.pop();
    _stack.push({ screen, params });
    await _render(screen, params, 'forward');
    _setTab(screen);
};
window._back = function() {
    if (_stack.length < 2) return;
    _stack.pop();
    const prev = _stack[_stack.length-1];
    _render(prev.screen, prev.params, 'back');
    _setTab(prev.screen);
};
async function _render(screen, params, dir='forward') {
    const stage = _el('mStage');
    if (!stage) return;
    const fns = {
        home: _home, activity: _activity, tasks: _tasks, remind: _reminders,
        marks: _bookmarks, scheduled: _scheduled,
        settings: _settings, dashboard: _dashboard,
        groupChat: _groupChat, thread: _thread,
        dm: _dm, taskDetail: _taskDetail, remindEdit: _remindEdit,
        search: _search,
    };
    _activeQuill = null;
    const html = await (fns[screen]?.(params) || Promise.resolve('<div style="padding:40px;text-align:center;">Coming soon</div>'));
    const scr  = document.createElement('div');
    scr.className = `mScr ${dir==='back'?'slide-back':'slide-fwd'}`;
    scr.innerHTML  = html;
    stage.innerHTML = '';
    stage.appendChild(scr);

    // Thread is a true full-screen reply view — hide chrome, restore on any other screen
    const immersive = screen === 'thread';
    _el('mSB')?.style.setProperty('display', immersive ? 'none' : 'flex');
    _el('mNav')?.style.setProperty('display', immersive ? 'none' : 'flex');

    _attachEvents(screen, params, scr);
    _scrollTop('mStage');

    if (params?.scrollTo) {
        setTimeout(() => {
            const target = document.getElementById('row-'+params.scrollTo);
            if (!target) return;
            target.scrollIntoView({ behavior:'smooth', block:'center' });
            target.classList.add('glow-target');
            setTimeout(() => target.classList.add('active-glow'), 50);
            setTimeout(() => target.classList.remove('glow-target','active-glow'), 3000);
        }, 150);
    }
}
function _setTab(screen) {
    const map = { home:'home', groupChat:'home', thread:'home', dm:'home',
                  activity:'activity', search:'activity',
                  tasks:'tasks', taskDetail:'tasks',
                  remind:'remind', remindEdit:'remind',
                  marks:'marks', scheduled:'scheduled',
                  settings:'settings', dashboard:'dashboard' };
    const active = map[screen] || screen;
    document.querySelectorAll('.mn-btn').forEach(b => {
        b.classList.toggle('active', b.id === 'mnt-'+active);
    });
}

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
        <div class="m-row" data-action="groupChat" data-room="${d.id}"
             data-name="${x(d.name)}" data-color="${d.col}">
          <div class="m-av sq" style="background:${d.col};">${d.name[0].toUpperCase()}</div>
          <div class="m-ri">
            <div class="m-rn">${x(d.name)}</div>
            <div class="m-rs">${lm ? _snip(lm.text,38)+' · '+_ago(lm.created_at) : 'No messages yet'}</div>
          </div>
          <i class="fa-solid fa-chevron-right m-chv"></i>
        </div>`; }).join('')}

      <div class="m-sl" style="margin-top:4px;">STAFF MEMBERS</div>
      ${others.length ? others.map(u => {
        const dm = _dmRoom(u.id);
        const lm = last[dm];
        const init = _init(u.full_name||u.email);
        return `
        <div class="m-row" data-action="dm"
             data-uid="${u.id}" data-name="${x(u.full_name||u.email.split('@')[0])}" data-room="${dm}">
          <div class="m-av" style="background:var(--accent);">${init}</div>
          <div class="m-ri">
            <div class="m-rn">${x(u.full_name||u.email.split('@')[0])}</div>
            <div class="m-rs">${lm ? _snip(lm.text,38)+' · '+_ago(lm.created_at) : x(u.designation||'Staff')}</div>
          </div>
          <i class="fa-solid fa-chevron-right m-chv"></i>
        </div>`; }).join('') : '<div class="m-empty">No staff added yet</div>'}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ACTIVITY — most important tab. Unified recent-message feed across
// every department + your DMs. Tap any item to jump straight to it,
// highlighted, inside its real conversation.
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
        let roomName = dept?.name, roomColor = dept?.col;
        let otherUid = null;
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
// SEARCH — replaces the clock/signal/battery strip
// ══════════════════════════════════════════════════════════════
async function _search() {
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <input class="m-inp" id="mSearchInput" placeholder="Search messages, staff…" autofocus style="flex:1;">
      </div>
      <div class="m-msgs" id="mSearchResults">
        <div class="m-empty">Type to search across your departments and DMs</div>
      </div>
    </div>`;
}
async function _runSearch(q) {
    const box = _el('mSearchResults');
    if (!box) return;
    if (!q || q.trim().length < 2) { box.innerHTML = '<div class="m-empty">Type at least 2 characters</div>'; return; }
    box.innerHTML = '<div class="m-empty">Searching…</div>';

    const [{ data: msgs }, staffMatches] = await Promise.all([
        sb.from('messages').select('id,room_id,text,created_at,sender_id')
          .eq('tenant_id',_tid).is('deleted_at',null).ilike('text',`%${q}%`)
          .order('created_at',{ascending:false}).limit(30),
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
          <div class="m-ri"><div class="m-rn">${x(_uname(m.sender_id))}</div><div class="m-rs">${_snip(m.text,50)}</div></div>
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
    const list = reactionsMap[msgId] || [];
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
    if (existing && existing.length) {
        await sb.from('reactions').delete().eq('message_id',msgId).eq('value',value).eq('user_id',_uid);
    } else {
        await sb.from('reactions').insert({ message_id:msgId, user_id:_uid, tenant_id:_tid, value, type, count:1 });
    }
    const top = _stack[_stack.length-1];
    await _render(top.screen, top.params, 'forward');
}

// ══════════════════════════════════════════════════════════════
// GROUP CHAT (Department)
// ══════════════════════════════════════════════════════════════
async function _groupChat(p) {
    const { data: msgs } = await sb.from('messages')
        .select('id,text,sender_id,created_at,parent_id')
        .eq('room_id',p.room).eq('tenant_id',_tid)
        .is('deleted_at',null).is('parent_id',null)
        .order('created_at',{ascending:true}).limit(80);

    const reactionsMap = await _fetchReactions((msgs||[]).map(m=>m.id));

    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-av-sm sq" style="background:${p.color||'var(--accent)'};">${(p.name||'D')[0]}</div>
        <div class="m-htitle">${x(p.name)}</div>
      </div>
      <div class="m-msgs" id="mMsgArea">
        ${(msgs||[]).map(m => {
          const me = m.sender_id===_uid;
          const nm = me?'You':_uname(m.sender_id);
          const cl = _snip(m.text,140);
          return `
          <div class="m-bubble-row ${me?'snt':'rcv'}" id="row-${m.id}">
            <div class="m-bubble ${me?'snt':'rcv'}">
              <div class="m-bmeta">${x(nm)} · ${_ago(m.created_at)}</div>
              <div class="m-btext">${x(cl)}</div>
              ${_chipsHTML(m.id, reactionsMap)}
              <div class="m-msgfooter">
                <button class="m-threadbtn" data-action="thread"
                  data-id="${m.id}" data-text="${x(cl)}" data-sender="${x(nm)}"
                  data-time="${_ago(m.created_at)}" data-room="${p.room}"
                  data-rname="${x(p.name)}" data-rcol="${p.color||''}">
                  <i class="fa-solid fa-reply"></i> Reply
                </button>
                <button class="m-morebtn" data-action="actions"
                  data-id="${m.id}" data-text="${x(cl)}" data-me="${me}"
                  data-room="${p.room}" data-rname="${x(p.name)}" data-rcol="${p.color||''}">
                  <i class="fa-solid fa-ellipsis"></i>
                </button>
              </div>
            </div>
          </div>`; }).join('') || '<div class="m-empty">No messages yet. Send the first one!</div>'}
      </div>
      <div class="m-inputrow">
        <div class="m-rich-wrap"><div id="mGInputQ"></div></div>
        <button class="m-sendbtn" data-action="sendGroup"
          data-room="${p.room}" data-name="${x(p.name)}" data-color="${p.color||''}">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// THREAD — full-screen (top bar + bottom nav hidden by _render)
// ══════════════════════════════════════════════════════════════
async function _thread(p) {
    const { data: replies } = await sb.from('messages')
        .select('id,text,sender_id,created_at')
        .eq('parent_id',p.id).eq('tenant_id',_tid)
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
            <div class="m-bmeta">${x(p.sender)} · ${p.time}</div>
            <div class="m-btext">${x(p.text)}</div>
          </div>
        </div>
        ${replies?.length ? `<div class="m-divider">── ${replies.length} ${replies.length===1?'Reply':'Replies'} ──</div>` : ''}
        ${(replies||[]).map(r => {
          const me = r.sender_id===_uid;
          const cl = _snip(r.text,160);
          return `
          <div class="m-bubble-row ${me?'snt':'rcv'}" id="row-${r.id}">
            <div class="m-bubble ${me?'snt':'rcv'}">
              <div class="m-bmeta">${me?'You':x(_uname(r.sender_id))} · ${_ago(r.created_at)}</div>
              <div class="m-btext">${x(cl)}</div>
              ${_chipsHTML(r.id, reactionsMap)}
            </div>
          </div>`; }).join('')}
      </div>
      <div class="m-inputrow">
        <div class="m-rich-wrap"><div id="mRInputQ"></div></div>
        <button class="m-sendbtn" data-action="sendReply"
          data-pid="${p.id}" data-room="${p.room}" data-rname="${x(p.rname||'')}"
          data-rcol="${p.rcol||''}" data-text="${x(p.text)}"
          data-sender="${x(p.sender)}" data-time="${p.time}">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
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
    const init = _init(p.name);
    return `<div class="mFlex">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-av-sm" style="background:var(--accent);">${init}</div>
        <div class="m-htitle">${x(p.name)}</div>
      </div>
      <div class="m-msgs" id="mDMArea">
        ${(msgs||[]).map(m => {
          const me = m.sender_id===_uid;
          const cl = _snip(m.text,160);
          return `
          <div class="m-bubble-row ${me?'snt':'rcv'}" id="row-${m.id}">
            <div class="m-bubble ${me?'snt':'rcv'}" data-action="msgActions"
                 data-id="${m.id}" data-text="${x(cl)}" data-me="${me}" data-room="${p.room}">
              <div class="m-bmeta">${me?'You':x(p.name)} · ${_ago(m.created_at)}</div>
              <div class="m-btext">${x(cl)}</div>
              ${_chipsHTML(m.id, reactionsMap)}
            </div>
          </div>`; }).join('') || `<div class="m-empty">Start a conversation with ${x(p.name)}</div>`}
      </div>
      <div class="m-inputrow">
        <div class="m-rich-wrap"><div id="mDMInpQ"></div></div>
        <button class="m-sendbtn" data-action="sendDM" data-room="${p.room}"
          data-uid="${p.uid}" data-name="${x(p.name)}">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
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
        return `
        <div class="m-taskcard" data-action="taskDetail" data-id="${t.id}" data-title="${x(t.title)}">
          <div class="m-tc-top">
            <div class="m-tc-title">${x(t.title)}</div>
            <span class="m-badge" style="background:${st.bg};color:${st.fg};">${st.lbl}</span>
          </div>
          <div class="m-tc-meta">
            ${t.deadline ? `<span>📅 ${new Date(t.deadline).toLocaleDateString('en-IN')}</span>` : ''}
            ${t.priority  ? `<span>⚡ ${t.priority}</span>` : ''}
            ${t.require_proof ? `<span>📎 Proof required</span>` : ''}
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

    return `<div class="mScr-inner">
      <div class="m-hdr">
        <button class="m-back" onclick="window._back()"><i class="fa-solid fa-arrow-left"></i></button>
        <div class="m-htitle">Task Details</div>
      </div>
      <div style="padding:16px;">
        <h2 style="font-size:20px;font-weight:800;margin-bottom:16px;">${x(t.title||p.title)}</h2>
        <div class="m-detail-row"><span class="m-detail-lbl">Status</span><span class="m-detail-val">${stLbl}</span></div>
        <div class="m-detail-row"><span class="m-detail-lbl">Priority</span><span class="m-detail-val">${x(t.priority||'Normal')}</span></div>
        <div class="m-detail-row"><span class="m-detail-lbl">Deadline</span><span class="m-detail-val">${t.deadline ? new Date(t.deadline).toLocaleDateString('en-IN') : 'No deadline'}</span></div>
        ${t.require_proof ? `<div class="m-detail-row"><span class="m-detail-lbl">Proof required</span><span class="m-detail-val">${hasProof?'✅ Attached':'⚠️ Not yet attached'}</span></div>` : ''}
      </div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:10px;">
        ${status==='pending_ack' ? `
        <button class="m-action-btn" style="background:#16a34a;" data-action="mobTaskAction" data-task="${p.id}" data-act="ack">
          <i class="fa-solid fa-check-double"></i> Acknowledge Task
        </button>` : ''}
        ${(status==='in_progress'||status==='needs_review') ? `
        <div class="m-rich-wrap"><div id="mTaskNoteQ"></div></div>
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
          <div style="padding:8px 0;border-bottom:1px solid var(--border-color);font-size:14px;">
            <div style="color:var(--text-secondary);font-size:11px;margin-bottom:2px;">${_ago(tr.created_at)}</div>
            ${tr.action==='FILE' ? `📎 ${x((tr.comment||'').split('|')[0])}` : x(tr.comment||'')}
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
        .select('id,title,remind_at,note')
        .eq('tenant_id',_tid).order('remind_at',{ascending:true}).limit(30);

    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Reminders</div></div>
      ${(data||[]).length ? (data||[]).map(r => {
        const d = new Date(r.remind_at);
        const past = d < new Date();
        return `
        <div class="m-row" style="gap:12px;">
          <div class="m-av" style="background:${past?'#9ca3af':'#f59e0b'};border-radius:12px;font-size:18px;">⏰</div>
          <div class="m-ri">
            <div class="m-rn" style="${past?'text-decoration:line-through;opacity:.6;':''}">${x(r.title)}</div>
            <div class="m-rs">${d.toLocaleDateString('en-IN')} at ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
            ${r.note?`<div class="m-rs" style="margin-top:2px;">${x(r.note)}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button class="m-icon-btn" data-action="editReminder" data-id="${r.id}" data-title="${x(r.title)}" data-at="${r.remind_at}" data-note="${x(r.note||'')}">
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
        <div class="m-field"><label class="m-label">Title</label>
          <input class="m-inp" id="rTitle" value="${x(p.title)}" placeholder="Reminder title"></div>
        <div class="m-field"><label class="m-label">Date & Time</label>
          <input class="m-inp" id="rAt" type="datetime-local" value="${p.at ? new Date(p.at).toISOString().slice(0,16) : ''}"></div>
        <div class="m-field"><label class="m-label">Note (optional)</label>
          <input class="m-inp" id="rNote" value="${x(p.note||'')}" placeholder="Add a note"></div>
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
          <div class="m-ri" style="cursor:pointer;" data-action="gotoBookmark"
               data-isdm="${b.room?.startsWith('dm_')?'1':'0'}" data-room="${b.room}" data-rname="${x(b.rname||'')}"
               data-rcol="${b.rcol||''}" data-uid="${b.uid||''}" data-msgid="${b.msgId}">
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
        .select('id,text,room_id,send_at').eq('tenant_id',_tid).eq('sender_id',_uid)
        .gt('send_at', new Date().toISOString()).order('send_at',{ascending:true}).limit(20);
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Scheduled Messages</div></div>
      ${(data||[]).length ? (data||[]).map(s => {
        const d = new Date(s.send_at);
        return `
        <div class="m-row">
          <div class="m-av" style="background:#6366f1;border-radius:12px;font-size:18px;">🕐</div>
          <div class="m-ri">
            <div class="m-rn">${_snip(s.text,50)}</div>
            <div class="m-rs">${s.room_id} · ${d.toLocaleDateString('en-IN')} ${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <button class="m-icon-btn" style="color:#ef4444;" data-action="cancelScheduled" data-id="${s.id}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>`; }).join('') : '<div class="m-empty">No scheduled messages.</div>'}
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// SETTINGS / PROFILE
// ══════════════════════════════════════════════════════════════
async function _settings() {
    const { data: p } = await sb.from('profiles').select('*').eq('id',_uid).single();
    const init = _init(p?.full_name||p?.email||'?');
    const permState = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permLabel = { granted:'✅ Enabled', denied:'🚫 Blocked in browser settings', default:'⚠️ Not yet enabled', unsupported:'Not supported on this browser' }[permState];
    return `<div class="mScr-inner">
      <div class="m-hdr m-hdr-plain"><div class="m-htitle">Profile & Settings</div></div>
      <div style="display:flex;flex-direction:column;align-items:center;padding:28px 20px 20px;">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px;font-weight:700;margin-bottom:12px;">${init}</div>
        <div style="font-size:18px;font-weight:700;">${x(p?.full_name||'')}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;">${x(p?.email||'')}</div>
        <div style="font-size:12px;color:var(--accent);margin-top:4px;font-weight:600;">${x(p?.designation||'Staff')}</div>
      </div>
      <div style="padding:0 16px;display:flex;flex-direction:column;gap:12px;">
        <div class="m-detail-row"><span class="m-detail-lbl">Notifications</span><span class="m-detail-val">${permLabel}</span></div>
        ${permState==='default' ? `<button class="m-action-btn" style="background:#16a34a;" data-action="enableNotifs">
          <i class="fa-solid fa-bell"></i> Enable Notifications
        </button>` : ''}
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
        <button class="m-action-btn" style="background:#ef4444;" data-action="logout">
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
        sb.from('profiles').select('full_name,last_login').eq('tenant_id',_tid).is('deleted_at',null).order('last_login',{ascending:false}).limit(5),
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
            <div class="m-av-sm" style="background:var(--accent);">${_init(u.full_name)}</div>
            <div class="m-ri"><div class="m-rn">${x(u.full_name||'Staff')}</div><div class="m-rs">${u.last_login?_ago(u.last_login):'Never logged in'}</div></div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// MESSAGE ACTIONS BOTTOM SHEET
// ══════════════════════════════════════════════════════════════
window._showMsgActions = function(params) {
    const isMe = params.me === 'true' || params.me === true;
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Message Actions</div>
      <div style="padding:0 8px 16px;display:flex;flex-direction:column;gap:2px;">
        <div class="m-sheet-row" data-action="addEmoji" data-id="${params.id}" data-text="${x(params.text)}">
          <i class="fa-regular fa-face-smile" style="color:#f59e0b;"></i> Add Emoji Reaction
        </div>
        <div class="m-sheet-row" data-action="addTag" data-id="${params.id}" data-text="${x(params.text)}">
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
    _attachSheetActions(sheet);
};

window._showEmojiPicker = function(msgId) {
    const emojis = ['👍','👎','❤️','😂','😮','😢','🙏','🔥','✅','⚡','💡','📌'];
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Add Reaction</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;justify-content:center;">
        ${emojis.map(e=>`<button onclick="window._addReactionAndRefresh('${msgId}','${e}','emoji')"
          style="font-size:28px;background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;">${e}</button>`).join('')}
      </div>`;
    _openSheet();
};
window._showTagPicker = function(msgId) {
    const tags = ['Thank You','Noted','Copied','Yes Sir','Yes Madam'];
    const sheet = _el('mSheetInner');
    sheet.innerHTML = `
      <div class="m-sheet-handle"></div>
      <div class="m-sheet-title">Quick Reply Tag</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 16px 20px;">
        ${tags.map(t=>{const c=TAG_COLORS[t];return`<button onclick="window._addReactionAndRefresh('${msgId}','${t}','tag')"
          style="font-size:13px;font-weight:700;background:none;border:1.5px solid ${c};color:${c};padding:8px 14px;border-radius:20px;cursor:pointer;">${t}</button>`;}).join('')}
      </div>`;
    _openSheet();
};
window._addReactionAndRefresh = async function(msgId, value, type) {
    _closeSheet();
    await sb.from('reactions').insert({ message_id:msgId, user_id:_uid, tenant_id:_tid, value, type, count:1 });
    _toast(type==='tag' ? `Tagged: ${value}` : `${value} added`);
    const top = _stack[_stack.length-1];
    await _render(top.screen, top.params, 'forward');
};

function _openSheet()  { _el('mSheet')?.classList.add('open');  }
window._closeSheet = () => _el('mSheet')?.classList.remove('open');

// ── FORWARD ─────────────────────────────────────────────────────
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
    _attachSheetActions(sheet);
}
async function _doForward(room, text) {
    _closeSheet();
    const { error } = await sb.from('messages').insert({ room_id:room, tenant_id:_tid, sender_id:_uid, text:`<p>↪️ Forwarded: ${x(text)}</p>` });
    _toast(error ? 'Forward failed' : 'Message forwarded ✓', error?'err':'ok');
}

// ── CONVERT TO TASK — fixed: now actually creates task_assignees + trail + notify ──
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
        <button class="m-action-btn" style="background:#16a34a;" id="ctSave">
          <i class="fa-solid fa-list-check"></i> Create Task
        </button>
      </div>`;
    _openSheet();
    _el('ctSave')?.addEventListener('click', async () => {
        const title    = _el('ctTitle')?.value?.trim(); if (!title) { _toast('Title required','err'); return; }
        const deadline = _el('ctDeadline')?.value || null;
        const priority = _el('ctPriority')?.value || 'normal';
        const aids = Array.from(document.querySelectorAll('.ctAssignee:checked')).map(cb=>cb.value);
        if (!aids.length) { _toast('Pick at least one assignee','err'); return; }

        const { data: task, error } = await sb.from('tasks').insert({
            title, deadline, priority, status:'pending',
            original_message_id: msgId, assigned_by: _uid, tenant_id: _tid
        }).select().single();
        if (error || !task) { _toast('Failed to create task','err'); return; }

        await sb.from('task_assignees').insert(aids.map(aid => ({
            task_id: task.id, assignee_id: aid, tenant_id: _tid, status:'pending_ack', state:'pending'
        })));
        await sb.from('task_trails').insert({ task_id: task.id, user_id:_uid, tenant_id:_tid, action:'UPDATE', comment:'Task Created' });
        if (window.notifyUser) {
            for (const aid of aids) await window.notifyUser(aid, `📋 New Task Assigned: ${title}`, msgId, 'task', task.id);
        }
        _closeSheet();
        _toast('✅ Task created!');
    });
}

// ══════════════════════════════════════════════════════════════
// RICH TEXT — same Quill library the desktop app already loads.
// Mounted fresh per screen render so every send/update input gets
// bold/italic/bullet-list formatting, not just plain text.
// ══════════════════════════════════════════════════════════════
function _mountRich(containerId, placeholder) {
    const el = _el(containerId);
    if (!el || !window.Quill) { _activeQuill = null; return; }
    _activeQuill = new Quill('#'+containerId, {
        theme: 'snow',
        placeholder: placeholder || 'Type a message…',
        modules: { toolbar: [['bold','italic','underline'], [{list:'bullet'},{list:'ordered'}]] }
    });
}
function _richHTML() {
    if (!_activeQuill) return _el('mFallbackInput')?.value?.trim() || '';
    const html = _activeQuill.root.innerHTML.trim();
    return (html === '<p><br></p>') ? '' : html;
}
function _richClear() { if (_activeQuill) _activeQuill.setText(''); }

// ══════════════════════════════════════════════════════════════
// EVENT DELEGATION
// ══════════════════════════════════════════════════════════════
function _attachEvents(screen, params, container) {
    // Mount the rich editor relevant to this screen
    if (screen === 'groupChat') _mountRich('mGInputQ', `Message ${params?.name||''}…`);
    if (screen === 'thread')    _mountRich('mRInputQ', 'Write a reply…');
    if (screen === 'dm')        _mountRich('mDMInpQ', `Message ${params?.name||''}…`);
    if (screen === 'taskDetail')_mountRich('mTaskNoteQ', 'Add an update or comment…');
    if (screen === 'search') {
        const inp = _el('mSearchInput');
        let t;
        inp?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(()=>_runSearch(inp.value), 300); });
    }

    container.addEventListener('click', async e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const a = el.dataset;
        switch (a.action) {
            case 'groupChat': await _navTo('groupChat',{room:a.room,name:a.name,color:a.color}); break;
            case 'dm':        await _navTo('dm',{uid:a.uid,name:a.name,room:a.room}); break;
            case 'thread':    await _navTo('thread',{id:a.id,text:a.text,sender:a.sender,time:a.time,room:a.room,rname:a.rname,rcol:a.rcol}); break;
            case 'taskDetail':await _navTo('taskDetail',{id:a.id,title:a.title}); break;
            case 'editReminder': await _navTo('remindEdit',{id:a.id,title:a.title,at:a.at,note:a.note}); break;
            case 'gotoBookmark':
                if (a.isdm === '1') await _navTo('dm',{uid:a.uid,name:a.rname,room:a.room,scrollTo:a.msgid});
                else await _navTo('groupChat',{room:a.room,name:a.rname,color:a.rcol,scrollTo:a.msgid});
                break;

            case 'actions':    window._showMsgActions(a); break;
            case 'msgActions': window._showMsgActions(a); break;
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

            case 'saveProfile':    await _saveProfile(); break;
            case 'changePassword': await _changePassword(); break;
            case 'enableNotifs':
                if (window.requestNotificationPermission) await window.requestNotificationPermission();
                await _navTo('settings',null,true);
                break;
            case 'logout': await sb.auth.signOut(); window.location.href='/'; break;
        }
    });

    let _pressTimer;
    container.addEventListener('pointerdown', e => {
        const row = e.target.closest('.m-bubble-row');
        if (!row) return;
        const id = row.id?.replace('row-','');
        _pressTimer = setTimeout(() => {
            window._showMsgActions({ id, text:row.querySelector('.m-btext')?.textContent||'', me: row.classList.contains('snt'), room:params?.room||'', rname:params?.name||'', rcol:params?.color||'' });
            navigator.vibrate?.(40);
        }, 550);
    });
    container.addEventListener('pointerup', () => clearTimeout(_pressTimer));
    container.addEventListener('pointerleave', () => clearTimeout(_pressTimer));

    const fi = _el('mFileInput');
    if (fi) {
        fi.onchange = async () => {
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

    ['mMsgArea','mThreadArea','mDMArea'].forEach(id => {
        const el = _el(id);
        if (el && !params?.scrollTo) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 80);
    });
}

function _attachSheetActions(sheet) {
    sheet.addEventListener('click', async e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const a = el.dataset;
        switch (a.action) {
            case 'addEmoji':   _closeSheet(); window._showEmojiPicker(a.id); break;
            case 'addTag':     _closeSheet(); window._showTagPicker(a.id); break;
            case 'replyThread':_closeSheet(); await _navTo('thread',{id:a.id,text:a.text,room:a.room,rname:a.rname,rcol:a.rcol,sender:'',time:''}); break;
            case 'convertTask':_closeSheet(); _showConvertTask(a.id, a.text); break;
            case 'forwardMsg': _showForwardSheet(a.text); break;
            case 'doForward':  await _doForward(a.room, a.text); break;
            case 'bookmarkMsg':
                const bms = JSON.parse(localStorage.getItem('tf_bookmarks_'+_uid)||'[]');
                bms.unshift({msgId:a.id,text:a.text,room:a.room,rname:a.rname,rcol:a.rcol,uid:a.room?.startsWith('dm_')?a.room.replace('dm_','').split('_').find(p=>p!==_uid):'',time:_ago(new Date().toISOString())});
                localStorage.setItem('tf_bookmarks_'+_uid, JSON.stringify(bms.slice(0,50)));
                _closeSheet(); _toast('🔖 Bookmarked!'); break;
            case 'editMsg':
                _closeSheet();
                const newText = prompt('Edit message:', a.text);
                if (newText === null || !newText.trim()) break;
                await sb.from('messages').update({ text:`<p>${x(newText.trim())}</p>` }).eq('id',a.id).eq('tenant_id',_tid);
                _toast('Message updated ✓');
                { const top = _stack[_stack.length-1]; await _render(top.screen, top.params, 'forward'); }
                break;
            case 'deleteMsg':
                _closeSheet();
                await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',a.id).eq('tenant_id',_tid);
                _toast('Message deleted'); _back(); break;
        }
    });
}

// ══════════════════════════════════════════════════════════════
// SEND ACTIONS — read rich text instead of plain input value
// ══════════════════════════════════════════════════════════════
async function _doSendGroup(a) {
    const val = _richHTML(); if (!val) return;
    _richClear();
    const { error } = await sb.from('messages').insert({ room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val });
    if (error) { _toast('Send failed: '+error.message,'err'); return; }
    await _render('groupChat', {room:a.room, name:a.name, color:a.color}, 'forward');
}
async function _doSendReply(a) {
    const val = _richHTML(); if (!val) return;
    _richClear();
    const { error } = await sb.from('messages').insert({ room_id:a.room, parent_id:a.pid, sender_id:_uid, tenant_id:_tid, text:val });
    if (error) { _toast('Send failed','err'); return; }
    await _render('thread', {id:a.pid,room:a.room,rname:a.rname,rcol:a.rcol,text:a.text,sender:a.sender,time:a.time});
}
async function _doSendDM(a) {
    const val = _richHTML(); if (!val) return;
    _richClear();
    const { error } = await sb.from('messages').insert({ room_id:a.room, sender_id:_uid, tenant_id:_tid, text:val });
    if (error) { _toast('Send failed','err'); return; }
    await _render('dm', {uid:a.uid, name:a.name, room:a.room});
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
        const note = _richHTML();
        if (!note) { _toast('Write something first','err'); return; }
        _richClear();
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
    await sb.from('reminders').delete().eq('id',id).eq('tenant_id',_tid);
    _toast('Reminder deleted'); await _navTo('remind',null,true);
}
async function _saveReminder(id) {
    const title = _el('rTitle')?.value?.trim(); if(!title) return;
    const remind_at = _el('rAt')?.value;
    const note = _el('rNote')?.value?.trim()||null;
    await sb.from('reminders').update({title, remind_at, note}).eq('id',id).eq('tenant_id',_tid);
    _toast('Reminder saved ✓'); _back();
}
function _removeBookmark(i) {
    const bms = JSON.parse(localStorage.getItem('tf_bookmarks_'+_uid)||'[]');
    bms.splice(i,1);
    localStorage.setItem('tf_bookmarks_'+_uid, JSON.stringify(bms));
    _navTo('marks',null,true);
}
async function _cancelScheduled(id) {
    await sb.from('scheduled_messages').delete().eq('id',id).eq('tenant_id',_tid);
    _toast('Scheduled message cancelled'); _navTo('scheduled',null,true);
}
async function _saveProfile() {
    const full_name   = _el('sName')?.value?.trim();
    const designation = _el('sDesig')?.value?.trim();
    const department  = _el('sDept')?.value?.trim();
    const { error } = await sb.from('profiles').update({full_name,designation,department}).eq('id',_uid);
    _toast(error ? 'Save failed' : 'Profile saved ✓', error?'err':'ok');
}
async function _changePassword() {
    const np = prompt('Enter new password (min 8 chars):');
    if (!np || np.length<8) { _toast('Password too short','err'); return; }
    const { error } = await sb.auth.updateUser({ password: np });
    _toast(error ? 'Failed: '+error.message : 'Password changed ✓', error?'err':'ok');
}

// ══════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════
window._togDark = function() {
    _dark = !_dark;
    localStorage.setItem('tf_theme', _dark?'dark':'light');
    if (typeof window.setTheme === 'function') window.setTheme(_dark?'dark':'light');
    else document.documentElement.setAttribute('data-theme', _dark?'dark':'light');
    _applyDark();
};
function _applyDark() {
    const btn = _el('mDark'); if (btn) btn.textContent = _dark?'☀️':'🌙';
    _el('mobileApp')?.classList.toggle('tf-dark', _dark);
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function _el(id) { return document.getElementById(id); }
function x(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _init(n){ return (n||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2)||'?'; }
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
    return new Date(ts).toLocaleDateString('en-IN');
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
function _clock(){
    const fn=()=>{const c=_el('mClock');if(c)c.textContent=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false});};
    fn(); setInterval(fn,30000);
}

// ══════════════════════════════════════════════════════════════
// CSS — bubbles/task-cards now use the SAME theme variables as the
// web app's task-card style (var(--card-bg)/var(--card-shadow)/accent
// side-border), so all 8 themes apply identically on mobile.
// Font sizes bumped toward WhatsApp scale (16px body text).
// ══════════════════════════════════════════════════════════════
function _injectCSS(){
    if(_el('mCSS')) return;
    const s=document.createElement('style'); s.id='mCSS';
    s.textContent=`
#mobileApp{position:fixed;inset:0;display:flex;flex-direction:column;
  background:var(--bg-body,#fff);color:var(--text-primary,#111);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  z-index:9999;overflow:hidden;}

/* ── Top bar: search replaces clock/signal/battery ──────────────── */
#mSB{display:flex;align-items:center;gap:10px;
  padding:10px 14px;flex-shrink:0;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);
  transition:transform .2s,opacity .2s;}
#mSearchWrap{flex:1;display:flex;align-items:center;gap:8px;
  background:var(--bg-body,#fff);border:1.5px solid var(--border-color,#e5e7eb);
  border-radius:20px;padding:9px 14px;cursor:pointer;}
#mSearchPlaceholder{font-size:14px;color:var(--text-secondary,#6b7280);}
#mDark{background:none;border:none;font-size:19px;cursor:pointer;padding:0;flex-shrink:0;}

#mStage{flex:1;overflow:hidden;position:relative;}
.mScr{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  display:flex;flex-direction:column;background:var(--bg-body,#fff);}
.mScr-inner{overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;}
.mFlex{display:flex;flex-direction:column;height:100%;overflow:hidden;}
.slide-fwd{animation:sfwd .25s cubic-bezier(.4,0,.2,1);}
.slide-back{animation:sback .25s cubic-bezier(.4,0,.2,1);}
@keyframes sfwd{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes sback{from{transform:translateX(-30%)}to{transform:translateX(0)}}

/* ── Bottom nav — 8 tabs, bigger icons ──────────────────────────── */
#mNav{display:flex;background:var(--bg-sidebar,#f6f8fa);
  border-top:1.5px solid var(--border-color,#e5e7eb);
  padding-bottom:env(safe-area-inset-bottom,0);flex-shrink:0;
  transition:transform .2s,opacity .2s;}
.mn-btn{flex:1;display:flex;align-items:center;justify-content:center;
  padding:12px 2px;font-size:25px;
  color:var(--text-secondary,#6b7280);border:none;background:none;
  cursor:pointer;-webkit-tap-highlight-color:transparent;
  transition:color .15s;min-height:54px;}
.mn-btn.active{color:var(--accent,#6366f1);}
.mn-btn.active i{transform:scale(1.15);}
.mn-btn:active{opacity:.6;}
.mn-btn i{transition:transform .2s;}

/* ── Header ──────────────────────────────────────────────────────── */
.m-hdr{display:flex;align-items:center;gap:10px;padding:13px 16px;flex-shrink:0;
  background:var(--bg-sidebar,#f6f8fa);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-hdr-plain{padding:14px 16px;}
.m-back{background:none;border:none;font-size:22px;color:var(--accent,#6366f1);
  cursor:pointer;padding:4px 8px 4px 0;-webkit-tap-highlight-color:transparent;min-height:44px;}
.m-htitle{font-size:18px;font-weight:700;flex:1;color:var(--text-primary,#111);}

/* ── List rows ───────────────────────────────────────────────────── */
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
.m-ri{flex:1;min-width:0;}
.m-rn{font-size:16px;font-weight:600;color:var(--text-primary,#111);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-rs{font-size:13.5px;color:var(--text-secondary,#6b7280);margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.m-chv{color:var(--text-secondary,#9ca3af);font-size:13px;}

/* ── Department/channel message rows ───────────────────────────────── */
.m-msgs{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 0;}
.m-msgfooter{display:flex;gap:8px;margin-top:8px;}
.m-threadbtn,.m-morebtn{background:none;border:1px solid var(--border-color,#e5e7eb);
  border-radius:20px;padding:4px 12px;font-size:12.5px;cursor:pointer;
  color:var(--text-secondary,#6b7280);-webkit-tap-highlight-color:transparent;}
.m-threadbtn:active,.m-morebtn:active{background:var(--bg-sidebar);}

/* ── Bubbles — task-card style, matches web theme.css exactly ──────── */
.m-bubble-row{display:flex;margin:8px 12px;}
.m-bubble-row.snt{justify-content:flex-end;}
.m-bubble-row.rcv{justify-content:flex-start;}
.m-bubble{max-width:84%;padding:11px 14px;border-radius:12px;
  font-size:16px;line-height:1.5;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border:1px solid var(--border-color,#e5e7eb);}
.m-bubble.snt{border-left:4px solid var(--accent,#6366f1);border-right-width:1px;}
.m-bubble.rcv{border-right:4px solid var(--accent,#6366f1);border-left-width:1px;}
.m-bmeta{font-size:11.5px;font-weight:600;color:var(--text-secondary,#6b7280);margin-bottom:4px;}
.m-btext{font-size:16px;line-height:1.5;color:var(--text-primary,#111);}
.m-divider{text-align:center;font-size:11px;color:var(--text-secondary);padding:8px 0;}

/* Glow highlight — identical animation to web (defined in theme.css, reused here) */
#mobileApp .glow-target{position:relative;}

/* ── Reaction chips ──────────────────────────────────────────────────── */
.m-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.m-chip{font-size:13px;font-weight:600;background:var(--bg-sidebar,#f6f8fa);
  border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:3px 9px;
  cursor:pointer;color:var(--text-primary,#111);-webkit-tap-highlight-color:transparent;}
.m-chip.mine{background:color-mix(in srgb, var(--accent) 12%, var(--bg-sidebar));border-color:var(--accent);}
.m-chip-cnt{font-size:11px;color:var(--text-secondary);}
.m-chip-tag{background:none;}

/* ── Rich text input wrap (Quill) ────────────────────────────────────── */
.m-inputrow{display:flex;gap:8px;padding:8px 10px;background:var(--bg-sidebar,#f6f8fa);
  border-top:1px solid var(--border-color,#e5e7eb);flex-shrink:0;align-items:flex-end;}
.m-rich-wrap{flex:1;border:1.5px solid var(--border-color,#e5e7eb);border-radius:16px;
  overflow:hidden;background:var(--bg-body,#fff);}
.m-rich-wrap .ql-toolbar{border:none;border-bottom:1px solid var(--border-color,#e5e7eb);
  padding:4px 6px;background:var(--bg-sidebar,#f6f8fa);}
.m-rich-wrap .ql-toolbar button{width:26px;height:26px;}
.m-rich-wrap .ql-toolbar .ql-stroke{stroke:var(--text-secondary,#6b7280);}
.m-rich-wrap .ql-container{border:none;}
.m-rich-wrap .ql-editor{min-height:40px;max-height:110px;font-size:16px;
  padding:9px 13px;color:var(--text-primary,#111);}
.m-rich-wrap .ql-editor.ql-blank::before{color:var(--text-secondary,#9ca3af);font-style:normal;font-size:16px;}
.m-sendbtn{background:var(--accent,#6366f1);border:none;color:#fff;
  padding:10px 16px;border-radius:18px;font-size:17px;cursor:pointer;
  min-height:44px;min-width:48px;-webkit-tap-highlight-color:transparent;flex-shrink:0;}
.m-sendbtn:active{opacity:.8;}
.m-inp{flex:1;border:1.5px solid var(--border-color,#e5e7eb);border-radius:14px;
  padding:11px 14px;font-size:16px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;min-height:46px;}
.m-inp:focus{border-color:var(--accent,#6366f1);}

/* ── Task cards — same theme-matched card language as bubbles ───────── */
.m-taskcard{margin:10px 14px;padding:16px;border-radius:14px;cursor:pointer;
  background:var(--card-bg,#fff);box-shadow:var(--card-shadow,0 2px 8px rgba(0,0,0,.07));
  border-left:4px solid var(--accent,#6366f1);border-top:1px solid var(--border-color,#e5e7eb);
  border-right:1px solid var(--border-color,#e5e7eb);border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-taskcard:active{opacity:.85;}
.m-tc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
.m-tc-title{font-size:16px;font-weight:700;flex:1;line-height:1.4;}
.m-badge{font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
.m-tc-meta{display:flex;gap:12px;margin-top:8px;font-size:13px;color:var(--text-secondary,#6b7280);}

/* ── Detail screens ───────────────────────────────────────────────────── */
.m-detail-row{display:flex;align-items:center;justify-content:space-between;
  padding:12px 0;border-bottom:1px solid var(--border-color,#e5e7eb);}
.m-detail-lbl{font-size:13.5px;font-weight:600;color:var(--text-secondary,#6b7280);}
.m-detail-val{font-size:15px;font-weight:600;}
.m-sel{border:1.5px solid var(--border-color,#e5e7eb);border-radius:10px;
  padding:9px 12px;font-size:15px;background:var(--bg-body,#fff);
  color:var(--text-primary,#111);outline:none;min-height:44px;}
.m-field{display:flex;flex-direction:column;gap:5px;}
.m-label{font-size:12px;font-weight:700;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:.05em;}
.m-action-btn{display:flex;align-items:center;justify-content:center;gap:8px;
  padding:13px 20px;border-radius:12px;border:none;color:#fff;
  font-size:15px;font-weight:700;cursor:pointer;min-height:50px;
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
  border-radius:22px 22px 0 0;max-height:85vh;overflow-y:auto;
  transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);
  padding-bottom:env(safe-area-inset-bottom,0);}
#mSheet.open #mSheetInner{transform:translateY(0);}
.m-sheet-handle{width:40px;height:4px;background:var(--border-color,#e5e7eb);
  border-radius:2px;margin:12px auto 4px;cursor:grab;}
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
