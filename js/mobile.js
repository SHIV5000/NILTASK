/**
 * mobile.js — TaskFlow Mobile App  VER 3.0
 * Built from Mr. Suri's design: Home|Tasks|Reminders|Bookmarks
 * Bottom nav · Group chats · DMs · Thread view · Dark mode
 */
import { sb } from './shared.js';

const MOB = 768;
let _screen = [];   // navigation stack
let _darkMode = localStorage.getItem('tf_theme') === 'dark';

// ── ENTRY POINT ────────────────────────────────────────────────
window.initMobileApp = function() {
    if (window.innerWidth > MOB) return;
    _injectStyles();
    _buildShell();
    _applyTheme();
    _startClock();
    _navTo('home');
    window.addEventListener('resize', () => {
        const mob = window.innerWidth <= MOB;
        document.getElementById('mobileApp')?.style.setProperty('display', mob ? 'flex' : 'none', 'important');
        document.getElementById('root')?.style.setProperty('display',      mob ? 'none' : '',     'important');
    }, { passive: true });
};

// ── SHELL ──────────────────────────────────────────────────────
function _buildShell() {
    document.getElementById('root')?.style.setProperty('display','none','important');
    if (document.getElementById('mobileApp')) return;
    const app = document.createElement('div');
    app.id = 'mobileApp';
    app.innerHTML = `
      <div id="mStatusBar">
        <span id="mClock">9:41</span>
        <div style="display:flex;gap:10px;align-items:center;">
          <button id="mThemeBtn" onclick="window._toggleTheme()"></button>
          <span>📶🔋</span>
        </div>
      </div>
      <div id="mContent"></div>
      <div id="mBottomNav">
        <div class="m-tab active" data-tab="home"   onclick="window._navTo('home')">🏠<span>Home</span></div>
        <div class="m-tab"        data-tab="tasks"  onclick="window._navTo('tasks')">✅<span>Tasks</span></div>
        <div class="m-tab"        data-tab="remind" onclick="window._navTo('remind')">⏰<span>Reminders</span></div>
        <div class="m-tab"        data-tab="marks"  onclick="window._navTo('marks')">🔖<span>Bookmarks</span></div>
      </div>`;
    document.body.appendChild(app);
}

// ── NAVIGATION ─────────────────────────────────────────────────
window._navTo = function(screen, params) {
    _screen.push({ screen, params });
    _render(screen, params);
    _setActiveTab(screen);
};
window._back = function() {
    if (_screen.length > 1) { _screen.pop(); const prev = _screen[_screen.length-1]; _render(prev.screen, prev.params); _setActiveTab(prev.screen); }
};
function _setActiveTab(s) {
    const tab = {home:'home', groupChat:'home', thread:'home', dm:'home', tasks:'tasks', remind:'remind', marks:'marks'}[s] || 'home';
    document.querySelectorAll('.m-tab').forEach(t => { t.classList.toggle('active', t.dataset.tab === tab); });
}
function _render(screen, params) {
    const c = document.getElementById('mContent');
    if (!c) return;
    c.innerHTML = '<div class="m-loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    const map = { home: _renderHome, groupChat: _renderGroupChat, thread: _renderThread, dm: _renderDM, tasks: _renderTasks, remind: _renderReminders, marks: _renderBookmarks };
    (map[screen] || _renderHome)(params);
}

// ── HOME ───────────────────────────────────────────────────────
async function _renderHome() {
    const [{ data: messages }, users] = await Promise.all([
        sb.from('messages').select('room_id, text, created_at, sender_id').eq('tenant_id', window.currentTenantId).order('created_at', { ascending: false }),
        Promise.resolve(window.globalUsersCache || [])
    ]);

    // Build last message per room
    const lastMsg = {};
    (messages || []).forEach(m => { if (!lastMsg[m.room_id]) lastMsg[m.room_id] = m; });

    const depts = ['general','math','science','leadership'];
    const deptLabels = { general:'General', math:'Mathematics', science:'Science', leadership:'Leadership' };
    const deptColors = { general:'#6366f1', math:'#0ea5e9', science:'#10b981', leadership:'#f59e0b' };

    const groups = depts.map(d => ({
        id: d, name: localStorage.getItem('dept_name_'+d) || deptLabels[d],
        color: localStorage.getItem('dept_color_'+d) || deptColors[d],
        last: lastMsg[d]
    }));

    const me = window.currentUser?.id;
    const staff = (users || []).filter(u => u.id !== me).slice(0, 20);

    function lastPreview(room) {
        const m = lastMsg[room];
        if (!m) return '<span style="color:var(--text-secondary);">No messages yet</span>';
        const t = m.text?.replace(/<[^>]*>/g,'').substring(0,40) || '📎 File';
        const ago = _timeAgo(m.created_at);
        return `<span style="color:var(--text-secondary);font-size:12px;">${_esc(t)} · ${ago}</span>`;
    }

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen">
        <div class="m-section-title">GROUPS & CHANNELS</div>
        ${groups.map(g => `
          <div class="m-list-item" onclick="window._navTo('groupChat',{roomId:'${g.id}',name:'${_esc(g.name)}',color:'${g.color}'})">
            <div class="m-avatar m-avatar-sq" style="background:${g.color};">${g.name.charAt(0).toUpperCase()}</div>
            <div class="m-item-info">
              <div class="m-item-name">${_esc(g.name)}</div>
              <div class="m-item-sub">${lastPreview(g.id)}</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:12px;"></i>
          </div>`).join('')}

        <div class="m-section-title" style="margin-top:8px;">STAFF MEMBERS</div>
        ${staff.length ? staff.map(u => {
            const initials = (u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);
            const dmRoom = _dmRoom(me, u.id);
            return `
          <div class="m-list-item" onclick="window._navTo('dm',{userId:'${u.id}',name:'${_esc(u.full_name||u.email)}',roomId:'${dmRoom}'})">
            <div class="m-avatar" style="background:var(--accent);">${initials}</div>
            <div class="m-item-info">
              <div class="m-item-name">${_esc(u.full_name||u.email)}</div>
              <div class="m-item-sub">${lastPreview(dmRoom)}</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-secondary);font-size:12px;"></i>
          </div>`;}).join('') : '<div style="padding:20px;color:var(--text-secondary);text-align:center;">No staff added yet</div>'}
      </div>`;
}

// ── GROUP CHAT ─────────────────────────────────────────────────
async function _renderGroupChat(p) {
    const { data: msgs, error } = await sb.from('messages')
        .select('id, text, sender_id, created_at')
        .eq('room_id', p.roomId)
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(60);

    const users = window.globalUsersCache || [];
    function senderName(id) {
        if (id === window.currentUser?.id) return 'You';
        const u = users.find(u => u.id === id);
        return u?.full_name || u?.email?.split('@')[0] || 'Someone';
    }

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen m-flex-col">
        <div class="m-header">
          <button class="m-back" onclick="window._back()">←</button>
          <div class="m-avatar-sm m-avatar-sq" style="background:${p.color||'var(--accent)'};">${(p.name||'G')[0]}</div>
          <div class="m-header-title">${_esc(p.name)}</div>
        </div>
        <div class="m-messages" id="mMsgList">
          ${(msgs||[]).map(m => {
            const isMe = m.sender_id === window.currentUser?.id;
            const clean = m.text?.replace(/<[^>]*>/g,'') || '📎 File';
            return `
            <div class="m-msg-item" onclick="window._navTo('thread',{msgId:'${m.id}',roomId:'${p.roomId}',roomName:'${_esc(p.name)}',roomColor:'${p.color||''}',text:'${_esc(clean.substring(0,80))}',sender:'${_esc(senderName(m.sender_id))}',time:'${_timeAgo(m.created_at)}'})">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <strong style="font-size:13px;">${_esc(senderName(m.sender_id))}</strong>
                <span style="font-size:11px;color:var(--text-secondary);">${_timeAgo(m.created_at)}</span>
              </div>
              <div style="font-size:14px;">${_esc(clean.substring(0,80))}${clean.length>80?'…':''}</div>
            </div>`;}).join('') || '<div style="padding:32px;text-align:center;color:var(--text-secondary);">No messages yet.<br>Be the first to say something!</div>'}
        </div>
        <div class="m-input-row">
          <input class="m-input" id="mMsgInput" placeholder="Type a message..." type="text">
          <button class="m-send-btn" onclick="_sendGroupMsg('${p.roomId}','${_esc(p.name)}','${p.color||''}')">Send</button>
        </div>
      </div>`;
    _scrollBottom('mMsgList');
    document.getElementById('mMsgInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') _sendGroupMsg(p.roomId, p.name, p.color);
    });
}

async function _sendGroupMsg(roomId, roomName, roomColor) {
    const input = document.getElementById('mMsgInput');
    const text  = input?.value?.trim();
    if (!text) return;
    input.value = '';
    await sb.from('messages').insert({
        room_id:   roomId,
        tenant_id: window.currentTenantId,
        sender_id: window.currentUser.id,
        text:      `<p>${_esc(text)}</p>`
    });
    _render('groupChat', { roomId, name: roomName, color: roomColor });
}

// ── THREAD VIEW ────────────────────────────────────────────────
async function _renderThread(p) {
    const { data: replies } = await sb.from('messages')
        .select('id, text, sender_id, created_at')
        .eq('parent_id', p.msgId)
        .eq('tenant_id', window.currentTenantId)
        .order('created_at', { ascending: true });

    const users = window.globalUsersCache || [];
    function senderName(id) {
        if (id === window.currentUser?.id) return 'You';
        const u = users.find(u => u.id === id);
        return u?.full_name || u?.email?.split('@')[0] || 'Someone';
    }

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen m-flex-col">
        <div class="m-header">
          <button class="m-back" onclick="window._back()">←</button>
          <div class="m-header-title">Thread</div>
        </div>
        <div class="m-messages" id="mThreadList">
          <div class="m-bubble received">
            <div class="m-bubble-meta">${_esc(p.sender)} · ${p.time}</div>
            ${_esc(p.text)}
          </div>
          <div style="text-align:center;font-size:11px;color:var(--text-secondary);padding:8px 0;">── Replies ──</div>
          ${(replies||[]).map(r => {
            const isMe = r.sender_id === window.currentUser?.id;
            const clean = r.text?.replace(/<[^>]*>/g,'') || '';
            return `<div class="m-bubble ${isMe?'sent':'received'}">
              <div class="m-bubble-meta">${_esc(senderName(r.sender_id))} · ${_timeAgo(r.created_at)}</div>
              ${_esc(clean)}
            </div>`;}).join('') || ''}
        </div>
        <div class="m-input-row">
          <input class="m-input" id="mReplyInput" placeholder="Write a reply..." type="text">
          <button class="m-send-btn" onclick="_sendReply('${p.msgId}','${p.roomId}','${_esc(p.roomName||'')}','${p.roomColor||''}','${_esc(p.text)}','${_esc(p.sender)}','${p.time}')">Reply</button>
        </div>
      </div>`;
    _scrollBottom('mThreadList');
    document.getElementById('mReplyInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') _sendReply(p.msgId, p.roomId, p.roomName, p.roomColor, p.text, p.sender, p.time);
    });
}

async function _sendReply(msgId, roomId, roomName, roomColor, text, sender, time) {
    const input = document.getElementById('mReplyInput');
    const val   = input?.value?.trim();
    if (!val) return;
    input.value = '';
    await sb.from('messages').insert({
        room_id:   roomId,
        parent_id: msgId,
        tenant_id: window.currentTenantId,
        sender_id: window.currentUser.id,
        text:      `<p>${_esc(val)}</p>`
    });
    _render('thread', { msgId, roomId, roomName, roomColor, text, sender, time });
}

// ── DM ─────────────────────────────────────────────────────────
async function _renderDM(p) {
    const { data: msgs } = await sb.from('messages')
        .select('id, text, sender_id, created_at')
        .eq('room_id', p.roomId)
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(60);

    const initials = (p.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().substring(0,2);

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen m-flex-col">
        <div class="m-header">
          <button class="m-back" onclick="window._back()">←</button>
          <div class="m-avatar-sm" style="background:var(--accent);">${initials}</div>
          <div class="m-header-title">${_esc(p.name)}</div>
        </div>
        <div class="m-messages" id="mDMList">
          ${(msgs||[]).map(m => {
            const isMe = m.sender_id === window.currentUser?.id;
            const clean = m.text?.replace(/<[^>]*>/g,'') || '📎';
            return `<div class="m-bubble-wrap ${isMe?'sent':'received'}">
              <div class="m-bubble ${isMe?'sent':'received'}">
                <div class="m-bubble-meta">${isMe?'You':_esc(p.name)} · ${_timeAgo(m.created_at)}</div>
                ${_esc(clean)}
              </div>
            </div>`;}).join('') || '<div style="padding:32px;text-align:center;color:var(--text-secondary);">Say hi to ${_esc(p.name)}!</div>'}
        </div>
        <div class="m-input-row">
          <input class="m-input" id="mDMInput" placeholder="Message ${_esc(p.name)}..." type="text">
          <button class="m-send-btn" onclick="_sendDM('${p.roomId}','${p.userId}','${_esc(p.name)}')">Send</button>
        </div>
      </div>`;
    _scrollBottom('mDMList');
    document.getElementById('mDMInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') _sendDM(p.roomId, p.userId, p.name);
    });
}

async function _sendDM(roomId, userId, name) {
    const input = document.getElementById('mDMInput');
    const val   = input?.value?.trim();
    if (!val) return;
    input.value = '';
    await sb.from('messages').insert({
        room_id:   roomId,
        tenant_id: window.currentTenantId,
        sender_id: window.currentUser.id,
        text:      `<p>${_esc(val)}</p>`
    });
    _render('dm', { roomId, userId, name });
}

// ── TASKS ──────────────────────────────────────────────────────
async function _renderTasks() {
    const { data: tasks } = await sb.from('tasks')
        .select('id, title, state, priority, created_at, due_date')
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30);

    const statusColors = {
        pending:    { bg:'#fef9c3', color:'#854d0e', label:'Pending' },
        done:       { bg:'#dcfce7', color:'#16a34a', label:'Done ✓' },
        in_progress:{ bg:'#dbeafe', color:'#1d4ed8', label:'In Progress' },
        overdue:    { bg:'#fee2e2', color:'#b91c1c', label:'Overdue' },
    };

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen">
        <div class="m-header"><div class="m-header-title">My Tasks</div></div>
        <div style="padding:8px 0;">
          ${(tasks||[]).length ? (tasks||[]).map(t => {
            const sc = statusColors[t.state] || statusColors['pending'];
            return `
            <div class="m-task-card" onclick="window._navTo('taskDetail',${JSON.stringify({id:t.id,title:t.title,state:t.state,due:t.due_date})})">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div style="font-weight:700;font-size:15px;flex:1;">${_esc(t.title)}</div>
                <span style="background:${sc.bg};color:${sc.color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;">${sc.label}</span>
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-secondary);display:flex;gap:12px;">
                ${t.due_date ? `<span>📅 ${new Date(t.due_date).toLocaleDateString('en-IN')}</span>` : ''}
                ${t.priority ? `<span>⚡ ${t.priority}</span>` : ''}
              </div>
            </div>`; }).join('') : '<div style="padding:40px;text-align:center;color:var(--text-secondary);">No tasks assigned yet</div>'}
        </div>
      </div>`;
}

// ── REMINDERS ──────────────────────────────────────────────────
async function _renderReminders() {
    const { data: rems } = await sb.from('reminders')
        .select('id, title, remind_at, note')
        .eq('tenant_id', window.currentTenantId)
        .gte('remind_at', new Date().toISOString())
        .order('remind_at', { ascending: true })
        .limit(20);

    document.getElementById('mContent').innerHTML = `
      <div class="m-screen">
        <div class="m-header"><div class="m-header-title">Reminders</div></div>
        ${(rems||[]).length ? (rems||[]).map(r => {
            const d = new Date(r.remind_at);
            return `
          <div class="m-list-item">
            <div style="width:40px;height:40px;border-radius:12px;background:#fef9c3;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">⏰</div>
            <div class="m-item-info">
              <div class="m-item-name">${_esc(r.title)}</div>
              <div class="m-item-sub">${d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · ${d.toLocaleDateString('en-IN')}</div>
              ${r.note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${_esc(r.note)}</div>` : ''}
            </div>
          </div>`;}).join('') : '<div style="padding:40px;text-align:center;color:var(--text-secondary);">No upcoming reminders</div>'}
      </div>`;
}

// ── BOOKMARKS ──────────────────────────────────────────────────
function _renderBookmarks() {
    const bms = JSON.parse(localStorage.getItem('tf_bookmarks') || '[]');
    document.getElementById('mContent').innerHTML = `
      <div class="m-screen">
        <div class="m-header"><div class="m-header-title">Bookmarks</div></div>
        ${bms.length ? bms.map((b,i) => `
          <div class="m-list-item">
            <div style="width:40px;height:40px;border-radius:12px;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🔖</div>
            <div class="m-item-info">
              <div class="m-item-name">${_esc(b.title)}</div>
              <div class="m-item-sub">${_esc(b.room)} · ${b.time}</div>
            </div>
            <button onclick="_removeBookmark(${i})" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:16px;">✕</button>
          </div>`).join('') : '<div style="padding:40px;text-align:center;color:var(--text-secondary);">No bookmarks yet.<br><span style="font-size:12px;">Long-press a message to bookmark it.</span></div>'}
      </div>`;
}

window._removeBookmark = function(i) {
    const bms = JSON.parse(localStorage.getItem('tf_bookmarks') || '[]');
    bms.splice(i, 1);
    localStorage.setItem('tf_bookmarks', JSON.stringify(bms));
    _renderBookmarks();
};

// ── THEME ──────────────────────────────────────────────────────
window._toggleTheme = function() {
    _darkMode = !_darkMode;
    localStorage.setItem('tf_theme', _darkMode ? 'dark' : 'light');
    // Sync with main app theme
    const root = document.documentElement;
    if (_darkMode) {
        root.setAttribute('data-theme','dark');
        document.body.classList.add('dark');
    } else {
        root.setAttribute('data-theme','light');
        document.body.classList.remove('dark');
    }
    _applyTheme();
};

function _applyTheme() {
    const btn = document.getElementById('mThemeBtn');
    if (btn) btn.textContent = _darkMode ? '☀️' : '🌙';
    const app = document.getElementById('mobileApp');
    if (app) {
        if (_darkMode) app.classList.add('mob-dark');
        else app.classList.remove('mob-dark');
    }
    // Sync
    if (_darkMode) {
        document.documentElement.setAttribute('data-theme','dark');
    } else {
        document.documentElement.setAttribute('data-theme','light');
    }
}

// ── HELPERS ────────────────────────────────────────────────────
function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _dmRoom(a, b) {
    const sorted = [a,b].sort();
    return `dm_${sorted[0]}_${sorted[1]}`;
}
function _timeAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return new Date(ts).toLocaleDateString('en-IN');
}
function _scrollBottom(id) {
    setTimeout(() => { const el = document.getElementById(id); if(el) el.scrollTop = el.scrollHeight; }, 60);
}
function _startClock() {
    function update() {
        const cl = document.getElementById('mClock');
        if (cl) cl.textContent = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false});
    }
    update();
    setInterval(update, 30000);
}

// ── CSS INJECTION ──────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('mobAppStyle')) return;
    const s = document.createElement('style');
    s.id = 'mobAppStyle';
    s.textContent = `
#mobileApp {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  background: var(--bg-body, #fff);
  color: var(--text-primary, #111);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  z-index: 9999;
  overflow: hidden;
}
#mStatusBar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px 8px;
  font-size: 14px; font-weight: 600;
  background: var(--bg-sidebar, #f6f8fa);
  border-bottom: 1px solid var(--border-color, #d0d7de);
  flex-shrink: 0;
}
#mThemeBtn {
  background: none; border: none; font-size: 18px; cursor: pointer;
  padding: 2px; line-height: 1;
}
#mContent {
  flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  display: flex; flex-direction: column;
}
#mBottomNav {
  display: flex;
  background: var(--bg-sidebar, #f6f8fa);
  border-top: 1.5px solid var(--border-color, #d0d7de);
  padding-bottom: env(safe-area-inset-bottom, 0);
  flex-shrink: 0;
}
.m-tab {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 10px 4px 8px;
  font-size: 11px; font-weight: 600;
  color: var(--text-secondary, #57606a);
  cursor: pointer; border: none; background: none;
  gap: 3px; -webkit-tap-highlight-color: transparent;
  min-height: 60px;
}
.m-tab span { font-size: 11px; }
.m-tab > :first-child { font-size: 22px; }
.m-tab.active { color: var(--accent, #6366f1); font-weight: 700; }
.m-tab:active { opacity: .65; }

.m-screen {
  flex: 1; display: flex; flex-direction: column;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.m-flex-col { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.m-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; flex-shrink: 0;
  background: var(--bg-sidebar, #f6f8fa);
  border-bottom: 1px solid var(--border-color, #d0d7de);
}
.m-back {
  background: none; border: none; font-size: 26px; cursor: pointer;
  color: var(--accent, #6366f1); line-height: 1; padding: 2px 6px 2px 0;
  -webkit-tap-highlight-color: transparent;
}
.m-header-title {
  font-size: 18px; font-weight: 700;
  color: var(--text-primary, #111); flex: 1;
}
.m-section-title {
  font-size: 11px; font-weight: 700;
  color: var(--text-secondary, #57606a);
  padding: 16px 16px 8px; text-transform: uppercase;
  letter-spacing: .07em;
}
.m-list-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border-color, #d0d7de);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  min-height: 68px;
}
.m-list-item:active { background: var(--bg-sidebar, #f6f8fa); }
.m-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 16px;
  flex-shrink: 0;
}
.m-avatar-sm {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: 12px; flex-shrink: 0;
}
.m-avatar-sq { border-radius: 13px; }
.m-item-info { flex: 1; min-width: 0; }
.m-item-name {
  font-size: 16px; font-weight: 600;
  color: var(--text-primary, #111);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m-item-sub {
  font-size: 13px; color: var(--text-secondary, #57606a);
  margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m-messages {
  flex: 1; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 0;
}
.m-msg-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #d0d7de);
  cursor: pointer;
}
.m-msg-item:active { background: var(--bg-sidebar); }
.m-bubble-wrap {
  display: flex; margin: 6px 12px;
}
.m-bubble-wrap.sent { justify-content: flex-end; }
.m-bubble-wrap.received { justify-content: flex-start; }
.m-bubble {
  max-width: 78%; padding: 10px 14px;
  border-radius: 18px; font-size: 15px; line-height: 1.45;
  border: 1px solid;
}
.m-bubble.received {
  background: var(--bg-sidebar, #f6f8fa);
  border-color: var(--border-color, #d0d7de);
  border-bottom-left-radius: 4px;
}
.m-bubble.sent {
  background: #ddf4ff; border-color: #80ccff;
  border-bottom-right-radius: 4px; color: #0550ae;
}
.mob-dark .m-bubble.sent { background: rgba(31,111,235,.15); border-color: #1f6feb; color: #79c0ff; }
.m-bubble-meta {
  font-size: 11px; font-weight: 600;
  color: var(--text-secondary, #57606a);
  margin-bottom: 4px;
}
.m-input-row {
  display: flex; gap: 8px; padding: 10px 12px;
  background: var(--bg-sidebar, #f6f8fa);
  border-top: 1px solid var(--border-color, #d0d7de);
  flex-shrink: 0;
}
.m-input {
  flex: 1; border: 1px solid var(--border-color, #d0d7de);
  border-radius: 24px; padding: 10px 16px;
  font-size: 15px;
  background: var(--bg-body, #fff);
  color: var(--text-primary, #111);
  outline: none; min-height: 44px;
}
.m-send-btn {
  background: var(--accent, #6366f1); border: none;
  color: #fff; padding: 10px 18px;
  border-radius: 24px; font-size: 14px; font-weight: 700;
  cursor: pointer; min-height: 44px; min-width: 64px;
}
.m-send-btn:active { opacity: .8; }
.m-task-card {
  margin: 10px 14px;
  padding: 16px;
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 16px; cursor: pointer;
  background: var(--bg-body, #fff);
}
.m-task-card:active { background: var(--bg-sidebar); }
.m-loading {
  flex: 1; display: flex; align-items: center;
  justify-content: center; color: var(--text-secondary);
  font-size: 28px; padding: 40px;
}
`;
    document.head.appendChild(s);
}
