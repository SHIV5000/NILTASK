import { sb } from './shared.js';

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

// Type config: icon class, hex color, label for each event type
const _FEED_TYPES = {
    message:        { fa: 'fa-comment',         color: '#6366f1', label: 'Message'     },
    reply:          { fa: 'fa-reply',            color: '#8b5cf6', label: 'Reply'       },
    reaction:       { fa: 'fa-heart',            color: '#ec4899', label: 'Reaction'    },
    task:           { fa: 'fa-clipboard-check',  color: '#3b82f6', label: 'Task'        },
    task_created:   { fa: 'fa-clipboard-list',   color: '#0ea5e9', label: 'Task Assigned'},
    task_updated:   { fa: 'fa-rotate',           color: '#f59e0b', label: 'Task Updated'},
    task_completed: { fa: 'fa-circle-check',     color: '#22c55e', label: 'Task Done'   },
    reminder:       { fa: 'fa-stopwatch',        color: '#a855f7', label: 'Reminder'    },
    scheduled:      { fa: 'fa-clock',            color: '#f59e0b', label: 'Scheduled'   },
    general:        { fa: 'fa-bell',             color: '#f59e0b', label: 'Alert'       },
};

// Convert ISO timestamp to "5m ago", "2h ago", "3d ago"
function _feedTimeAgo(isoStr) {
    try {
        const diff = Date.now() - new Date(isoStr).getTime();
        const s = Math.floor(diff / 1000);
        if (s < 60)  return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60)  return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24)  return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d < 7)   return d + 'd ago';
        return new Date(isoStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
    } catch(e) { return ''; }
}

const _esc  = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _strip = s => String(s||'').replace(/<[^>]*>/g,'').trim();

// ── Card palette (exact spec) ────────────────────────────────────────────────
const _AF_PAL = {
    chats:     { hex:'#2563EB', bg:'#DBEAFE', badge:'💬 Chats',     label:'Chats' },
    tasks:     { hex:'#F97316', bg:'#FFEDD5', badge:'📋 Tasks',     label:'Tasks' },
    reminders: { hex:'#22C55E', bg:'#DCFCE7', badge:'⏰ Reminder',  label:'Reminders' },
    system:    { hex:'#A855F7', bg:'#F3E8FF', badge:'🛠 System',    label:'System' },
};
// Locally-dismissed non-notification feed items (raw messages / task trails),
// which have no per-user deletable row — hidden client-side per tenant+user.
function _afDismissKey() { return 'af_dismissed_' + (window.currentTenantId||'') + '_' + (window.currentUser?.id||''); }
function _afGetDismissed() {
    try { return JSON.parse(localStorage.getItem(_afDismissKey()) || '[]'); } catch(e) { return []; }
}
function _afAddDismissed(id) {
    try {
        const s = new Set(_afGetDismissed()); s.add(id);
        localStorage.setItem(_afDismissKey(), JSON.stringify([...s].slice(-500)));
    } catch(e) {}
}

// Map a raw notification/trail type to a feed category.
function _afCat(type) {
    if (type==='task' || (type||'').startsWith('task_')) return 'tasks';
    if (type==='reminder' || type==='scheduled')         return 'reminders';
    if (type==='message' || type==='reply' || type==='reaction') return 'chats';
    return 'system';
}
function _istDateStr(ts) {
    try { return new Date(new Date(ts).toLocaleString('en-US',{timeZone:'Asia/Kolkata'})).toDateString(); }
    catch(e){ return ''; }
}
function _afDayLabel(ts) {
    const d = _istDateStr(ts);
    const today = _istDateStr(Date.now());
    const yest  = _istDateStr(Date.now()-86400000);
    if (d===today) return 'Today';
    if (d===yest)  return 'Yesterday';
    try { return new Date(ts).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; }
}
function _afDateTime(ts) {
    try { return new Date(ts).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}); }
    catch(e){ return ''; }
}
// Render one normalized card.
function _afCard(it) {
    const p = _AF_PAL[it.cat] || _AF_PAL.system;
    const click = it.click ? ' onclick="' + it.click + '" style="cursor:pointer;' : ' style="';
    const btn = it.click
        ? '<button ' + (it.click ? 'onclick="event.stopPropagation();' + it.click + '"' : '') + ' style="margin-top:10px;padding:5px 14px;border-radius:40px;font-size:11.5px;font-weight:600;border:none;cursor:pointer;background:' + p.hex + ';color:#fff;">' + (it.cat==='tasks'?'📂 View Task':'🚀 Open') + '</button>'
        : '';
    const clr = '<button onclick="event.stopPropagation();window._webClearActivityItem(\'' + it.src + '\',\'' + String(it.id).replace(/'/g,"\\'") + '\')" title="Clear" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(148,163,184,.16);color:#64748b;font-size:11px;cursor:pointer;line-height:1;z-index:2;">✕</button>';
    return '<div' + click
        + 'background:#FFFFFF;border-radius:14px;padding:13px 14px;margin-bottom:11px;position:relative;'
        + 'border-left:4px solid ' + p.hex + ';box-shadow:0 1px 2px rgba(0,0,0,.06),0 1px 3px rgba(0,0,0,.05);'
        + (it.unread ? 'background:#F8FBFF;' : '') + '">'
        + clr
        + '<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 10px;border-radius:40px;background:' + p.bg + ';color:' + p.hex + ';display:inline-block;margin-bottom:6px;">' + p.badge + '</span>'
        + (it.unread ? '<span style="position:absolute;top:13px;right:40px;width:7px;height:7px;border-radius:50%;background:' + p.hex + ';"></span>' : '')
        + '<div style="font-size:13.5px;font-weight:600;color:var(--text-primary);line-height:1.4;">' + _esc(it.title) + '</div>'
        + (it.sender ? '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">by ' + _esc(it.sender) + '</div>' : '')
        + '<div style="font-size:11px;color:var(--text-secondary);margin-top:5px;"><i class="fa-regular fa-clock"></i> ' + _feedTimeAgo(it.ts) + ' · ' + _afDateTime(it.ts) + '</div>'
        + btn
        + '</div>';
}

// Render a single notification row (real-time prepend + full-reload reuse)
function _renderNotifItem(n) {
    const cfg  = _FEED_TYPES[n.type] || _FEED_TYPES.general;
    const msg  = _strip(n.message||'').substring(0, 120);
    const ago  = _feedTimeAgo(n.created_at);
    const unread = !n.is_read;
    const clickTarget = n.task_id
        ? `window.goToTask&&window.goToTask('${n.task_id}','${n.id}')`
        : n.message_id
            ? `window.goToMessage&&window.goToMessage('${n.message_id}','${n.id}')`
            : '';
    return '<div id="feed-notif-' + n.id + '" style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);align-items:flex-start;'
        + (unread ? 'background:rgba(99,102,241,.06);' : '')
        + (clickTarget ? 'cursor:pointer;" onclick="' + clickTarget + '"' : '"')
        + '>'
        + '<div style="width:32px;height:32px;border-radius:50%;background:' + cfg.color + '18;flex-shrink:0;display:flex;align-items:center;justify-content:center;">'
        + '<i class="fa-solid ' + cfg.fa + '" style="color:' + cfg.color + ';font-size:13px;"></i></div>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:11px;font-weight:700;color:' + cfg.color + ';text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">' + cfg.label + '</div>'
        + '<div style="font-size:12px;color:var(--text-primary);' + (unread ? 'font-weight:600;' : '') + 'line-height:1.4;">' + _esc(msg) + '</div>'
        + '<div style="font-size:10px;color:var(--text-secondary);margin-top:3px;display:flex;align-items:center;gap:6px;">'
        + ago
        + (unread ? '<span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;display:inline-block;"></span>' : '')
        + '</div>'
        + '</div></div>';
}

window.openActivityFeed = async function() {
    // If already open — close it and restore task hub
    if (document.getElementById('activityFeedPanel')) {
        window.closeActivityFeed();
        return;
    }

    // Show right sidebar if hidden
    const rs = document.getElementById('rightSidebar');
    if (!rs) return;
    if (window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }

    // Hide task hub panels
    ['tasksPanel','rightSidebarFilters','dateRangeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    window._activityFeedOpen = true;
    // Track when feed was last opened to detect new items
    localStorage.setItem('feedLastOpened', Date.now());

    // Build panel and append DIRECTLY to rightSidebar
    const panel = document.createElement('div');
    panel.id = 'activityFeedPanel';
    panel.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--bg-body);';
    panel.innerHTML =
        '<div style="padding:12px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-sidebar);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<span style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--accent);"></i> Activity Feed</span>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<button onclick="window._clearAllActivity()" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);">Clear All</button>' +
        '<button onclick="window.closeActivityFeed()" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--text-secondary);font-size:14px;">✕</button>' +
        '</div></div>' +
        '<div id="activityFeedList" style="overflow-y:auto;padding:12px;background:#F8FAFC;max-height:calc(100vh - 60px);"><p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>';

    rs.appendChild(panel);
    await window._loadActivityFeed();

    // Opening the feed IS "seeing" your notifications — mark personal unread
    // notifications read and clear the bell badge (the feed replaces the old
    // alerts panel, so this is where the actionable count is consumed).
    try {
        await sb.from('notifications').update({ is_read: true })
            .eq('user_id', window.currentUser?.id).eq('is_read', false);
    } catch(e) {}
    window._clearBellBadge?.();
};

window._loadActivityFeed = async function() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;

    const tid = window.currentTenantId;
    const uid = window.currentUser?.id;
    if (!tid || !uid) {
        list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;">Session loading — close and reopen.</p>';
        return;
    }

    const [r1, r2, r3] = await Promise.all([
        sb.from('messages')
            .select('id,created_at,room_id,sender_id,text,parent_message_id,profiles(full_name,email)')
            .eq('tenant_id', tid).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(60),
        sb.from('task_trails')
            .select('id,created_at,action,task_id,comment,profiles(full_name,email),tasks(title)')
            .eq('tenant_id', tid)
            .order('created_at', { ascending: false }).limit(30),
        sb.from('notifications')
            .select('id,created_at,type,message,task_id,message_id,is_read')
            .eq('user_id', uid)
            .order('created_at', { ascending: false }).limit(60)
    ]);

    let msgData = r1.data || [];
    if (!msgData.length && window.currentRoom) {
        const { data: fb } = await sb.from('messages')
            .select('id,created_at,room_id,sender_id,text,parent_message_id,profiles(full_name,email)')
            .eq('tenant_id', tid)
            .eq('room_id', window.currentRoom).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(60);
        msgData = fb || [];
    }

    // Deduplicate: notifications already cover message events for the user,
    // so only show raw messages that are NOT already in notifications
    const notifMsgIds = new Set((r3.data||[]).map(n => n.message_id).filter(Boolean));
    const filteredMsgs = msgData.filter(m => !notifMsgIds.has(m.id));

    const myId = window.currentUser?.id;
    const nameOf = (prof, fallback) => {
        const fn = prof?.full_name || (prof?.email ? prof.email.split('@')[0] : '') || fallback || '';
        return fn ? fn.charAt(0).toUpperCase() + fn.slice(1) : '';
    };

    // Locally-dismissed (non-notification) item ids
    const dismissed = new Set(_afGetDismissed());

    // ── Normalize all three sources into a single card shape ──
    const items = [];
    filteredMsgs.forEach(m => {
        if (dismissed.has('msg:'+m.id)) return;
        const mine = m.sender_id === myId;
        const nm  = mine ? 'You' : nameOf(m.profiles, '');
        const rm  = (window.getRoomDisplayName && window.getRoomDisplayName(m.room_id)) || m.room_id || '';
        const tx  = _strip(m.text).substring(0,90) || 'Attachment';
        items.push({
            id:'msg:'+m.id, src:'local', cat:'chats', ts:m.created_at, unread:false, sender:nm,
            title:(m.parent_message_id?'Reply':'Message') + ' in ' + rm + ' — ' + tx,
            click:"window.goToMessage&&window.goToMessage('" + m.id + "',null,'" + m.room_id + "')"
        });
    });
    (r2.data||[]).forEach(tr => {
        if (dismissed.has('trail:'+tr.id)) return;
        const nm  = nameOf(tr.profiles, 'Staff');
        const ttl = (tr.tasks && tr.tasks.title) || 'Task';
        const act = tr.action || 'update';
        const actLabel = ({ created:'assigned', accepted:'completed', submitted:'submitted', update:'updated', delegate:'delegated', transfer:'transferred', review:'reviewed' })[act] || act;
        items.push({
            id:'trail:'+tr.id, src:'local', cat:'tasks', ts:tr.created_at, unread:false, sender:nm,
            title:'Task ' + actLabel + ': ' + ttl,
            click: tr.task_id ? "window.goToTask&&window.goToTask('" + tr.task_id + "')" : ''
        });
    });
    (r3.data||[]).forEach(n => {
        const cat = _afCat(n.type);
        const click = n.task_id
            ? "window.goToTask&&window.goToTask('" + n.task_id + "','" + n.id + "')"
            : n.message_id
                ? "window.goToMessage&&window.goToMessage('" + n.message_id + "',null,null)"
                : '';
        items.push({
            id:n.id, src:'notif', cat, ts:n.created_at, unread:!n.is_read, sender:'',
            title:_strip(n.message||'').substring(0,120), click
        });
    });
    items.sort((a,b) => new Date(b.ts) - new Date(a.ts));
    // Track loaded local (non-notification) ids so Clear-all can dismiss them.
    window._afLocalShown = items.filter(it => it.src === 'local').map(it => it.id);

    // Update bell badge to reflect actual unread count
    const unreadCount = (r3.data||[]).filter(n => !n.is_read).length;
    window._setBellBadge?.(unreadCount);

    // ── Filters ──
    const filter = window._webAfFilter || 'all';
    const senderFilter = window._webAfSender || '';
    let shown = items.filter(it => filter==='all' || it.cat===filter);
    const senders = [...new Set(shown.map(it=>it.sender).filter(s=>s && s!=='You'))].sort();
    if (senderFilter) shown = shown.filter(it => it.sender === senderFilter);

    const pills = [['all','All types'],['chats','💬 Chats'],['tasks','📋 Tasks'],['reminders','⏰ Reminders'],['system','🛠 System']];
    const selStyle = 'flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--text-primary);background:var(--bg-body);border:1px solid var(--border-color);border-radius:9px;padding:7px 9px;cursor:pointer;';
    const typeSel = '<select onchange="window._webSetAfFilter(this.value)" style="' + selStyle + '">'
        + pills.map(p=>'<option value="' + p[0] + '"' + (filter===p[0]?' selected':'') + '>' + p[1] + '</option>').join('') + '</select>';
    const userSel = '<select onchange="window._webSetAfSender(this.value)"' + (senders.length?'':' disabled') + ' style="' + selStyle + '">'
        + '<option value=""' + (senderFilter?'':' selected') + '>👥 Everyone</option>'
        + senders.map(s=>'<option value="' + _esc(s) + '"' + (senderFilter===s?' selected':'') + '>' + _esc(s) + '</option>').join('') + '</select>';

    const filtersHtml = '<div style="display:flex;gap:8px;padding:2px 2px 12px;">' + typeSel + userSel + '</div>';

    if (!shown.length) {
        list.innerHTML = filtersHtml
            + '<div style="text-align:center;padding:40px 20px;color:var(--text-secondary);"><div style="font-size:42px;margin-bottom:8px;">🚀</div>'
            + '<div style="font-weight:700;font-size:15px;color:var(--text-primary);">All caught up!</div>'
            + '<div style="font-size:12px;margin-top:6px;">' + (filter==='all'&&!senderFilter?'Your activity will appear here when teammates chat, assign tasks, or reminders fire.':'No activity matches this filter.') + '</div></div>';
        return;
    }

    // ── Date-grouped cards ──
    let out = filtersHtml, curDay = null;
    shown.forEach(it => {
        const day = _afDayLabel(it.ts);
        if (day !== curDay) {
            curDay = day;
            out += '<div style="display:flex;align-items:center;gap:10px;margin:8px 0 10px;"><span style="font-size:11px;font-weight:700;color:var(--text-secondary);background:var(--bg-body);padding:3px 12px;border-radius:30px;">' + day + '</span><div style="flex:1;height:1px;background:var(--border-color);"></div></div>';
        }
        try { out += _afCard(it); } catch(e){}
    });
    list.innerHTML = out;
};

window._webSetAfFilter = function(f) { window._webAfFilter = f; window._webAfSender = ''; window._loadActivityFeed(); };
window._webSetAfSender = function(s) { window._webAfSender = s || ''; window._loadActivityFeed(); };

// Clear a single card: delete the notification row, or dismiss a raw item locally.
window._webClearActivityItem = async function(src, id) {
    if (src === 'notif') {
        try { await sb.from('notifications').delete().eq('id', id).eq('user_id', window.currentUser?.id); } catch(e){}
    } else {
        _afAddDismissed(id);
    }
    window._loadActivityFeed();
};

// Real-time: a new notification arrived — re-render the card feed so the new
// item slots into the correct date group / filter with the card styling.
window.prependFeedItem = function(notif) {
    if (!notif) return;
    if (document.getElementById('activityFeedList')) window._loadActivityFeed();
};

window.closeActivityFeed = function() {
    window._activityFeedOpen = false;
    document.getElementById('activityFeedPanel')?.remove();
    ['tasksPanel','rightSidebarFilters','dateRangeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.removeProperty('display');
    });
};

window.refreshActivityFeed = async function() {
    if (window._activityFeedOpen && document.getElementById('activityFeedPanel')) {
        await window._loadActivityFeed();
    }
};

window._clearAllActivity = async function() {
    if (!confirm('Clear all activity?')) return;
    await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    // Also dismiss every currently-loaded raw (message/trail) item so the feed empties.
    try {
        const cur = new Set(_afGetDismissed());
        (window._afLocalShown || []).forEach(id => cur.add(id));
        localStorage.setItem(_afDismissKey(), JSON.stringify([...cur].slice(-500)));
    } catch(e) {}
    await window._loadActivityFeed();
};


// ─── DASHBOARD ────────────────────────────────────────────────────────────────
window.openDashboard = async function() {
    const modal = document.getElementById('dashboardModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await window.loadDashboard('this_month');
};

window.closeDashboard = function() {
    const modal = document.getElementById('dashboardModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window.loadDashboard = async function(filter) {
    document.querySelectorAll('.dash-tab').forEach(b => {
        const on = b.dataset.period === filter;
        b.style.background  = on ? 'var(--accent)' : 'var(--bg-body)';
        b.style.color       = on ? '#fff' : 'var(--text-secondary)';
        b.style.borderColor = on ? 'var(--accent)' : 'var(--border-color)';
    });
    const el = document.getElementById('dashboardContent');
    if (!el) return;
    el.innerHTML = '<p style="text-align:center;padding:48px;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading scorecard...</p>';

    // Use IST time for period calculation to match server
    const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}));
    const pad = n => String(n).padStart(2,'0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
    const today = ymd(now);
    let p_from, p_to = today, periodLabel;

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

    const { data, error } = await sb.rpc('get_staff_scorecard', { p_tenant_id: window.currentTenantId, p_from, p_to });
    if (error) { el.innerHTML = '<p style="text-align:center;padding:32px;color:#ef4444;">Error: ' + error.message + '</p>'; return; }

    const myEmail = (window.currentUser?.email || '').toLowerCase();
    const s = (data || []).find(r => (r.email || '').toLowerCase() === myEmail);
    if (!s) { el.innerHTML = '<p style="text-align:center;padding:32px;color:var(--text-secondary);">No scorecard data for ' + periodLabel + '.</p>'; return; }

    window._dashStats = Object.assign({}, s, { filter, periodLabel });

    const gColors = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c','N/A':'#64748b'};
    const gc   = gColors[s.grade] || '#64748b';
    const pct  = s.score != null ? s.score : 0;
    const barC = pct >= 90 ? '#16a34a' : pct >= 65 ? '#f59e0b' : '#ef4444';
    const ackR = s.msgs_received > 0 ? Math.round(s.acknowledged / s.msgs_received * 100) + '%' : '—';

    const dimBar = (label, score, weight) => {
        const v = score != null ? score : 0, c = v>=80?'#16a34a':v>=50?'#f59e0b':'#ef4444';
        return '<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;font-weight:600;color:var(--text-primary);">' + label + '</span><span style="font-size:12px;font-weight:700;color:' + c + ';">' + (score!=null?v+'%':'N/A') + ' <span style="font-size:10px;color:var(--text-secondary);">x' + weight + '</span></span></div><div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;"><div style="width:' + Math.min(100,v) + '%;height:100%;background:' + c + ';border-radius:6px;"></div></div></div>';
    };
    const sBox = (label, val, color) => '<div style="background:var(--bg-body);border:1px solid var(--border-color);border-radius:12px;padding:12px 8px;text-align:center;"><div style="font-size:20px;font-weight:800;color:' + color + ';">' + val + '</div><div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">' + label + '</div></div>';

    const gradeLegend = [['A+','#16a34a'],['A','#1d4ed8'],['B','#854d0e'],['C','#c2410c'],['D','#b91c1c']].map(([g,c]) => '<span style="font-size:10px;padding:1px 8px;border-radius:20px;font-weight:700;background:' + c + '18;color:' + c + ';">' + g + '</span>').join('');

    el.innerHTML = '<div id="dashboardReport" style="padding:4px 0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-body);border:1px solid var(--border-color);border-radius:16px;margin-bottom:14px;">' +
        '<div style="width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' + gc + '15;border:3px solid ' + gc + '40;"><div style="font-size:28px;font-weight:900;color:' + gc + ';line-height:1;">' + s.grade + '</div><div style="font-size:9px;font-weight:700;color:' + gc + ';letter-spacing:1px;text-transform:uppercase;">Grade</div></div>' +
        '<div style="text-align:right;"><div style="font-size:42px;font-weight:900;color:' + barC + ';line-height:1;">' + (s.score!=null?s.score+'%':'N/A') + '</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Overall Score · ' + periodLabel + '</div><div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;width:140px;margin:6px 0 0 auto;"><div style="width:' + Math.min(100,pct) + '%;height:100%;background:' + barC + ';border-radius:6px;"></div></div></div></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' + gradeLegend + '<span style="font-size:10px;color:var(--text-secondary);">A+≥90 A≥80 B≥65 C≥50 D&lt;50</span></div>' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Task Performance (40%)</div>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;">' + [sBox('Total',s.tasks_total||0,'#6366f1'),sBox('On Time',s.tasks_on_time||0,'#16a34a'),sBox('Delayed',s.tasks_delayed||0,'#f59e0b'),sBox('Pending',s.tasks_pending||0,'#ef4444'),sBox('Transferred',s.tasks_transferred||0,'#8b5cf6')].join('') + '</div>' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Communication · Responsiveness · Presence</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">' + [sBox('Msgs Sent',s.msgs_sent||0,'#0ea5e9'),sBox('Msgs Rcvd',s.msgs_received||0,'#64748b'),sBox('Ack Rate',ackR,'#10b981'),sBox('Active Days',s.active_days||0,'#f59e0b')].join('') + '</div>' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:10px;">Score Breakdown</div>' +
        dimBar('Task Delivery',s.score_task,'40%') + dimBar('Communication',s.score_comm,'25%') + dimBar('Responsiveness',s.score_resp,'20%') + dimBar('Presence',s.score_presence,'15%') +
        '</div>';
};

window.downloadDashboardPDF = function() {
    const s = window._dashStats;
    if (!s) { window.showCenterToast('Generate scorecard first','fa-solid fa-info-circle','text-blue-400'); return; }
    const name = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';
    const school = window.currentSchoolName || 'School';
    const w = window.open('','_blank');
    const pct = s.score||0, barC = pct>=90?'#16a34a':pct>=65?'#f59e0b':'#ef4444';
    const gc = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c'}[s.grade]||'#64748b';
    const ackR = s.msgs_received>0?Math.round(s.acknowledged/s.msgs_received*100)+'%':'0%';
    const bar=(label,score,weight)=>{const v=score||0,c=v>=80?'#16a34a':v>=50?'#f59e0b':'#ef4444';return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:11px;font-weight:600;">'+label+'</span><span style="font-size:11px;font-weight:700;color:'+c+';">'+(score!=null?v+'%':'N/A')+' x'+weight+'</span></div><div style="height:5px;background:#f1f5f9;border-radius:5px;"><div style="width:'+Math.min(100,v)+'%;height:100%;background:'+c+';border-radius:5px;"></div></div></div>';};
    const sb2=(label,val,color)=>'<div style="text-align:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px 6px;"><div style="font-size:18px;font-weight:800;color:'+color+';">'+val+'</div><div style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-top:2px;">'+label+'</div></div>';
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scorecard - '+name+'</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,sans-serif;background:#fff;padding:28px}.hdr{background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;padding:24px 28px;border-radius:14px;margin-bottom:20px}.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}.foot{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center}@media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'+
        '<div class="hdr"><div style="font-size:18px;font-weight:900;margin-bottom:4px;">Staff Performance Scorecard</div><div style="font-size:12px;opacity:.8;">'+school+' · '+name+' · '+s.periodLabel+'</div></div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px;">'+
        '<div style="width:64px;height:64px;border-radius:50%;background:'+gc+'15;border:3px solid '+gc+'40;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:26px;font-weight:900;color:'+gc+';">'+s.grade+'</div><div style="font-size:8px;font-weight:700;color:'+gc+';">Grade</div></div>'+
        '<div style="text-align:right;"><div style="font-size:38px;font-weight:900;color:'+barC+';">'+(s.score!=null?s.score+'%':'N/A')+'</div><div style="font-size:10px;color:#9ca3af;margin-top:2px;">Overall Score</div><div style="height:5px;background:#e5e7eb;border-radius:5px;overflow:hidden;width:130px;margin:5px 0 0 auto;"><div style="width:'+Math.min(100,pct)+'%;height:100%;background:'+barC+';border-radius:5px;"></div></div></div></div>'+
        '<div class="lbl">Task Performance</div><div class="g5">'+sb2('Total',s.tasks_total||0,'#6366f1')+sb2('On Time',s.tasks_on_time||0,'#16a34a')+sb2('Delayed',s.tasks_delayed||0,'#f59e0b')+sb2('Pending',s.tasks_pending||0,'#ef4444')+sb2('Transferred',s.tasks_transferred||0,'#8b5cf6')+'</div>'+
        '<div class="lbl">Communication · Responsiveness · Presence</div><div class="g4">'+sb2('Msgs Sent',s.msgs_sent||0,'#0ea5e9')+sb2('Msgs Rcvd',s.msgs_received||0,'#64748b')+sb2('Ack Rate',ackR,'#10b981')+sb2('Active Days',s.active_days||0,'#f59e0b')+'</div>'+
        '<div class="lbl">Score Breakdown</div>'+bar('Task Delivery',s.score_task,'40%')+bar('Communication',s.score_comm,'25%')+bar('Responsiveness',s.score_resp,'20%')+bar('Presence',s.score_presence,'15%')+
        '<div class="foot">Generated by Noted For Action · '+new Date().toLocaleString('en-IN')+' · Objective &amp; Transparent</div>'+
        '<script>setTimeout(()=>window.print(),400)<\/script></body></html>');
    w.document.close();
};
