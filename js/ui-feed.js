/**
 * ui-feed.js — MPGS TaskFlow
 * ─────────────────────────────────────────────────────────────────────────────
 * Activity Feed (real-time events) and Personal Dashboard (stats + PDF export).
 * Depends on: ui-core.js, ui-panels.js
 *
 * Functions: openActivityFeed, closeActivityFeed, refreshActivityFeed,
 *            renderActivityFeedItems, openDashboard, closeDashboard,
 *            loadDashboard (Today/Week/Month/All), downloadDashboardPDF
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';
window.openActivityFeed = async function() {
    const rs = document.getElementById('rightSidebar');
    if (!rs) return;
    if (window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }
    const existing = document.getElementById('activityFeedPanel');
    if (existing) { existing.remove(); document.getElementById('tasksPanel')?.style.removeProperty('display'); document.getElementById('rightSidebarFilters')?.style.removeProperty('display'); return; }

    const tasksPanelEl = document.getElementById('tasksPanel');
    if (tasksPanelEl) tasksPanelEl.style.display = 'none';
    const filtersEl = document.getElementById('rightSidebarFilters');
    if (filtersEl) filtersEl.style.display = 'none';
    const dateRangeEl = document.getElementById('dateRangeFilter');
    if (dateRangeEl) dateRangeEl.style.display = 'none';

    window._activityFeedOpen = true;

    const feed = document.createElement('div');
    feed.id = 'activityFeedPanel';
    feed.className = 'flex-1 flex flex-col overflow-hidden';
    feed.style.backgroundColor = 'var(--bg-body)';
    feed.innerHTML = `
    <div class="p-3 border-b flex items-center justify-between flex-shrink-0" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
        <span class="font-bold text-sm flex items-center gap-2" style="color:var(--text-primary);">
            <i class="fa-solid fa-bolt" style="color:var(--accent);"></i> Activity Feed
        </span>
        <div style="display:flex;gap:6px;align-items:center;">
            <button onclick="window._clearAllActivity()" title="Clear all"
                style="font-size:11px;padding:3px 10px;border-radius:8px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);">
                Clear All
            </button>
            <button onclick="window.closeActivityFeed()" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;">
                <i class="fa-solid fa-times text-sm"></i>
            </button>
        </div>
    </div>
    <div class="flex-1 overflow-y-auto p-3" id="activityFeedList">
        <p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>
    </div>`;

    const innerWrap = tasksPanelEl ? tasksPanelEl.parentElement : rs.querySelector('.w-full.h-full.flex');
    if (innerWrap) innerWrap.appendChild(feed);

    await window._loadActivityFeed();
};

window._loadActivityFeed = async function() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;
    list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>';

    const [{ data: msgs }, { data: trails }, { data: notifs }] = await Promise.all([
        sb.from('messages').select('*, profiles(full_name, email)')
            .eq('tenant_id', window.currentTenantId).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(40),
        sb.from('task_trails').select('*, profiles(full_name, email), tasks(title)')
            .eq('tenant_id', window.currentTenantId)
            .order('created_at', { ascending: false }).limit(20),
        sb.from('notifications').select('*')
            .eq('user_id', window.currentUser.id)
            .order('created_at', { ascending: false }).limit(30)
    ]);

    const items = [];
    (msgs||[]).forEach(m  => items.push({ kind:'message', time:m.created_at, data:m }));
    (trails||[]).forEach(t => items.push({ kind:'trail',  time:t.created_at, data:t }));
    (notifs||[]).forEach(n => {
        if (['reminder','scheduled','task'].includes(n.type))
            items.push({ kind:'notif', time:n.created_at, data:n });
    });
    items.sort((a,b) => new Date(b.time) - new Date(a.time));

    if (!items.length) {
        list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;">No activity yet.</p>';
        return;
    }

    const iconMap  = { reminder:'fa-stopwatch', task:'fa-clipboard-check', scheduled:'fa-clock', general:'fa-bell' };
    const colorMap = { reminder:'#a855f7', task:'#3b82f6', scheduled:'#f59e0b', general:'#f59e0b' };

    list.innerHTML = items.map(item => {
        const t = typeof window.getISTTime === 'function' ? window.getISTTime(item.time)
            : new Date(item.time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true});

        if (item.kind === 'message') {
            const m = item.data;
            const isMine = m.sender_id === window.currentUser.id;
            const name = isMine ? 'You' : (window.toSentenceCase?.(m.profiles?.full_name||m.profiles?.email?.split('@')[0]||'Unknown')||'Unknown');
            const txt  = (window.stripHtml?window.stripHtml(m.text):m.text||'').substring(0,90)||'📎 Attachment';
            const roomLabel = window.getRoomDisplayName?.(m.room_id)||m.room_id;
            const col  = isMine ? 'var(--accent)' : '#6366f1';
            return '<div style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="window.goToMessage&&window.goToMessage(''+m.id+'',null,''+m.room_id+'')">'
                +'<div style="width:30px;height:30px;border-radius:50%;background:'+col+';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:#fff;">'+name.charAt(0).toUpperCase()+'</div>'
                +'<div style="flex:1;min-width:0;">'
                +'<div style="font-size:12px;font-weight:600;color:var(--text-primary);">'+window.escapeHtml(name)+' <span style="font-weight:400;color:var(--text-secondary);">in '+window.escapeHtml(roomLabel)+'</span></div>'
                +'<div style="font-size:12px;color:var(--text-secondary);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+window.escapeHtml(txt)+'</div>'
                +'<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">'+t+'</div>'
                +'</div></div>';
        }
        if (item.kind === 'trail') {
            const tr = item.data;
            const tName = window.toSentenceCase?.(tr.profiles?.full_name||tr.profiles?.email?.split('@')[0]||'Unknown')||'Unknown';
            return '<div style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="window.goToTask&&window.goToTask(''+(tr.task_id||'')+'')">'
                +'<div style="width:30px;height:30px;border-radius:50%;background:#3b82f618;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-clipboard-check" style="color:#3b82f6;font-size:13px;"></i></div>'
                +'<div style="flex:1;min-width:0;">'
                +'<div style="font-size:12px;font-weight:600;color:var(--text-primary);">'+window.escapeHtml(tName)+'</div>'
                +'<div style="font-size:12px;color:var(--text-secondary);">'+window.escapeHtml(tr.tasks?.title||'Task')+' · '+(tr.action||'update')+'</div>'
                +'<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">'+t+'</div>'
                +'</div></div>';
        }
        const n   = item.data;
        const ic  = iconMap[n.type]||'fa-bell';
        const col = colorMap[n.type]||'#f59e0b';
        const msg = (window.stripHtml?window.stripHtml(n.message):n.message)||'';
        return '<div style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);">'
            +'<div style="width:30px;height:30px;border-radius:50%;background:'+col+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid '+ic+'" style="color:'+col+';font-size:13px;"></i></div>'
            +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:12px;color:var(--text-primary);">'+window.escapeHtml(msg.substring(0,120))+'</div>'
            +'<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">'+t+'</div>'
            +'</div></div>';
    }).join('');
};
window._deleteActivityItem = async function(id, btn) {
    await sb.from('notifications').delete().eq('id', id);
    btn.closest('div[style*="border-bottom"]')?.remove();
};

window._clearAllActivity = async function() {
    if (!confirm('Clear all activity?')) return;
    await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    const list = document.getElementById('activityFeedList');
    if (list) list.innerHTML = '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;">All cleared.</p>';
};

window.refreshActivityFeed = async function() {
    if (!window._activityFeedOpen) return;
    await window._loadActivityFeed();
};

window.closeActivityFeed = function() {
    window._activityFeedOpen = false;
    document.getElementById('activityFeedPanel')?.remove();
    const tp = document.getElementById('tasksPanel');
    if (tp) tp.style.removeProperty('display');
window.closeActivityFeed = function() {
    window._activityFeedOpen = false;
    document.getElementById('activityFeedPanel')?.remove();
    const tp = document.getElementById('tasksPanel');
    if (tp) tp.style.removeProperty('display');
    const fi = document.getElementById('rightSidebarFilters');
    if (fi) fi.style.removeProperty('display');
};

// Called by subscriptions when feed is open — refresh items list only

window.refreshActivityFeed = async function() {
    if (!window._activityFeedOpen) return;
    const list = document.getElementById('activityFeedList');
    if (!list) return;
    const [{ data: msgs }, { data: trails }] = await Promise.all([
        sb.from('messages').select('*, profiles(full_name, email)').order('created_at', {ascending: false}).limit(40),
        sb.from('task_trails').select('*, profiles(full_name, email), tasks(title)').order('created_at', {ascending: false}).limit(20)
    ]);
    const items = [];
    msgs?.forEach(m => items.push({ kind: 'message', time: m.created_at, data: m }));
    trails?.forEach(t => items.push({ kind: 'trail', time: t.created_at, data: t }));
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    // Update count badge
    const badge = document.querySelector('#activityFeedPanel .text-\[10px\]');
    if (badge) badge.textContent = items.length + ' items';
    // Re-render list (trigger openActivityFeed logic by calling the render part)
    window._activityFeedItems = items;
    window.renderActivityFeedItems(items, list);
};

window.renderActivityFeedItems = function(items, list) {
    if (!list) return;
    if (!items.length) { list.innerHTML = '<p class="text-xs italic text-center py-8" style="color:var(--text-secondary);">No recent activity.</p>'; return; }
    list.innerHTML = items.map(item => {
        const t = typeof window.getISTTime === 'function'
            ? window.getISTTime(item.time)
            : new Date(item.time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata',hour12:true});
        if (item.kind === 'message') {
            const m = item.data;
            const isMine = m.sender_id === window.currentUser.id;
            const name = isMine ? 'You' : (window.toSentenceCase?.(m.profiles?.full_name || m.profiles?.email?.split('@')[0] || 'Unknown') || 'Unknown');
            const txt = window.stripHtml(m.text).substring(0, 90) || '📎 Attachment';
            const roomLabel = m.room_id?.startsWith('dm_') ? '💬 DM' : `# ${m.room_id}`;
            const av = name.charAt(0).toUpperCase();
            const bgAv = isMine ? 'var(--accent)' : '#6366f1';
            return `<div class="mb-2 rounded-xl overflow-hidden border cursor-pointer group transition-all hover:shadow-md" style="border-color:var(--border-color);border-left:3px solid ${bgAv};" onclick="window.goToMessage('${m.id}',null,'${m.room_id}')">
                <div class="p-2.5" style="background-color:var(--bg-sidebar);">
                    <div class="flex items-center gap-2 mb-1.5">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm" style="background:${bgAv};">${av}</div>
                        <span class="text-[11px] font-bold truncate flex-1" style="color:var(--text-primary);">${window.escapeHtml(name)}</span>
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style="background:rgba(99,102,241,0.1);color:#6366f1;">${roomLabel}</span>
                        <span class="text-[9px] flex-shrink-0 whitespace-nowrap" style="color:var(--text-secondary);">${t}</span>
                    </div>
                    <p class="text-[11px] line-clamp-2 pl-8 leading-relaxed" style="color:var(--text-secondary);">${window.escapeHtml(txt)}</p>
                </div>
            </div>`;
        } else {
            const tr = item.data;
            const tName = window.toSentenceCase?.(tr.profiles?.full_name || tr.profiles?.email?.split('@')[0] || 'Unknown') || 'Unknown';
            const taskTitle = tr.tasks?.title || 'Task';
            const action = tr.action || 'UPDATE';
            const comment = tr.comment ? ` — ${tr.comment.split('|')[0]}` : '';
            const co = ({FILE:'#10b981',UPDATE:'#3b82f6',CREATE:'#6366f1'})[action] || '#6b7280';
            return `<div class="mb-2 rounded-xl overflow-hidden border cursor-pointer group transition-all hover:shadow-md" style="border-color:var(--border-color);border-left:3px solid ${co};" onclick="window.goToTask('${tr.task_id||''}')">
                <div class="p-2.5" style="background-color:var(--bg-sidebar);">
                    <div class="flex items-center gap-2 mb-1.5">
                        <div class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm" style="background:${co}18;">
                            <i class="fa-solid ${action==='FILE'?'fa-paperclip':action==='CREATE'?'fa-plus':'fa-tasks'}" style="color:${co};font-size:10px;"></i>
                        </div>
                        <span class="text-[11px] font-bold truncate flex-1" style="color:var(--text-primary);">${window.escapeHtml(tName)}</span>
                        <span class="text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0" style="background:${co}15;color:${co};">${action}</span>
                        <span class="text-[9px] flex-shrink-0 whitespace-nowrap" style="color:var(--text-secondary);">${t}</span>
                    </div>
                    <p class="text-[11px] line-clamp-2 pl-8 leading-relaxed" style="color:var(--text-secondary);">📋 ${window.escapeHtml(taskTitle)}${window.escapeHtml(comment)}</p>
                </div>
            </div>`;
        }
    }).join('');
};

// ─── SETTINGS ──────────────────────────────────────────────────────────────
// ─── PROFILE SETTINGS: Open settings modal with current user profile data ──────

window.openDashboard = async function() {
    const modal = document.getElementById('dashboardModal');
    if (!modal) { window.showCenterToast('Dashboard modal not found','fa-solid fa-info-circle','text-yellow-400'); return; }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await window.loadDashboard('this_month');
};

window.closeDashboard = function() {
    const modal = document.getElementById('dashboardModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// Fetch and render dashboard stats — calls same get_staff_scorecard RPC as admin panel

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

    const now = new Date();
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

    const { data, error } = await sb.rpc('get_staff_scorecard', {
        p_tenant_id: window.currentTenantId,
        p_from,
        p_to
    });

    if (error) {
        el.innerHTML = '<p style="text-align:center;padding:32px;color:#ef4444;">Error: ' + error.message + '</p>';
        return;
    }

    const myEmail = (window.currentUser && window.currentUser.email ? window.currentUser.email : '').toLowerCase();
    const s = (data || []).find(r => (r.email || '').toLowerCase() === myEmail);

    if (!s) {
        el.innerHTML = '<p style="text-align:center;padding:32px;color:var(--text-secondary);">No scorecard data for ' + periodLabel + '.<br><small>Tasks must be assigned to you for a score to appear.</small></p>';
        return;
    }

    window._dashStats = Object.assign({}, s, { filter: filter, periodLabel: periodLabel });

    const gColors = { 'A+':'#16a34a', 'A':'#1d4ed8', 'B':'#854d0e', 'C':'#c2410c', 'D':'#b91c1c', 'N/A':'#64748b' };
    const gc   = gColors[s.grade] || '#64748b';
    const pct  = s.score != null ? s.score : 0;
    const barC = pct >= 90 ? '#16a34a' : pct >= 65 ? '#f59e0b' : '#ef4444';
    const ackR = s.msgs_received > 0 ? Math.round(s.acknowledged / s.msgs_received * 100) + '%' : '—';

    function dimBar(label, score, weight) {
        const v = score != null ? score : 0;
        const c = v >= 80 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#ef4444';
        const pctW = Math.min(100, v);
        const scoreText = score != null ? v + '%' : 'N/A';
        return '<div style="margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<span style="font-size:12px;font-weight:600;color:var(--text-primary);">' + label + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:' + c + ';">' + scoreText + ' <span style="font-size:10px;font-weight:400;color:var(--text-secondary);">x ' + weight + '</span></span>' +
            '</div>' +
            '<div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;">' +
            '<div style="width:' + pctW + '%;height:100%;background:' + c + ';border-radius:6px;"></div>' +
            '</div></div>';
    }

    function statBox(label, val, color) {
        return '<div style="background:var(--bg-body);border:1px solid var(--border-color);border-radius:12px;padding:12px 8px;text-align:center;">' +
            '<div style="font-size:20px;font-weight:800;color:' + color + ';">' + val + '</div>' +
            '<div style="font-size:10px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">' + label + '</div>' +
            '</div>';
    }

    const gradeLegend = [['A+','#16a34a'],['A','#1d4ed8'],['B','#854d0e'],['C','#c2410c'],['D','#b91c1c']]
        .map(function(pair) {
            return '<span style="font-size:10px;padding:1px 8px;border-radius:20px;font-weight:700;background:' + pair[1] + '18;color:' + pair[1] + ';">' + pair[0] + '</span>';
        }).join('');

    const taskGrid = [
        statBox('Total',       s.tasks_total || 0,       '#6366f1'),
        statBox('On Time',     s.tasks_on_time || 0,     '#16a34a'),
        statBox('Delayed',     s.tasks_delayed || 0,     '#f59e0b'),
        statBox('Pending',     s.tasks_pending || 0,     '#ef4444'),
        statBox('Transferred', s.tasks_transferred || 0, '#8b5cf6')
    ].join('');

    const commGrid = [
        statBox('Msgs Sent',   s.msgs_sent || 0,     '#0ea5e9'),
        statBox('Msgs Rcvd',   s.msgs_received || 0, '#64748b'),
        statBox('Ack Rate',    ackR,                  '#10b981'),
        statBox('Active Days', s.active_days || 0,   '#f59e0b')
    ].join('');

    const scoreText = s.score != null ? s.score + '%' : 'N/A';
    const barW = Math.min(100, pct);

    el.innerHTML =
        '<div id="dashboardReport" style="padding:4px 0;">' +

        '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-body);border:1px solid var(--border-color);border-radius:16px;margin-bottom:14px;">' +
        '<div style="width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' + gc + '15;border:3px solid ' + gc + '40;">' +
        '<div style="font-size:28px;font-weight:900;color:' + gc + ';line-height:1;">' + s.grade + '</div>' +
        '<div style="font-size:9px;font-weight:700;color:' + gc + ';letter-spacing:1px;text-transform:uppercase;">Grade</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:42px;font-weight:900;color:' + barC + ';line-height:1;">' + scoreText + '</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Overall Score · ' + periodLabel + '</div>' +
        '<div style="height:6px;background:var(--border-color);border-radius:6px;overflow:hidden;width:140px;margin:6px 0 0 auto;">' +
        '<div style="width:' + barW + '%;height:100%;background:' + barC + ';border-radius:6px;"></div>' +
        '</div></div></div>' +

        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' + gradeLegend +
        '<span style="font-size:10px;color:var(--text-secondary);">A+&ge;90 A&ge;80 B&ge;65 C&ge;50 D&lt;50</span></div>' +

        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Task Performance (40%)</div>' +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;">' + taskGrid + '</div>' +

        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px;">Communication &bull; Responsiveness &bull; Presence</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">' + commGrid + '</div>' +

        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:10px;">Score Breakdown</div>' +
        dimBar('Task Delivery',  s.score_task,     '40%') +
        dimBar('Communication',  s.score_comm,     '25%') +
        dimBar('Responsiveness', s.score_resp,     '20%') +
        dimBar('Presence',       s.score_presence, '15%') +

                '</div>';
};

// Download dashboard as a PDF progress card using html2pdf.js

window.downloadDashboardPDF = function() {
    const s = window._dashStats;
    if (!s) { window.showCenterToast('Generate scorecard first','fa-solid fa-info-circle','text-blue-400'); return; }
    const name   = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';
    const school = window.currentSchoolName || 'School';
    const period = s.periodLabel || '';
    const gColors = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c','N/A':'#64748b'};
    const gc   = gColors[s.grade] || '#64748b';
    const pct  = s.score != null ? s.score : 0;
    const barC = pct>=90?'#16a34a':pct>=65?'#f59e0b':'#ef4444';
    const ackR = s.msgs_received > 0 ? Math.round(s.acknowledged/s.msgs_received*100)+'%' : '0%';

    function bar(label, score, weight) {
        var v = score != null ? score : 0;
        var c = v>=80?'#16a34a':v>=50?'#f59e0b':'#ef4444';
        return '<div style="margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
            '<span style="font-size:11px;font-weight:600;color:#374151;">' + label + '</span>' +
            '<span style="font-size:11px;font-weight:700;color:' + c + ';">' + (score!=null?v+'%':'N/A') + ' <span style="color:#9ca3af;font-weight:400;">x'+weight+'</span></span>' +
            '</div>' +
            '<div style="height:6px;background:#f1f5f9;border-radius:6px;overflow:hidden;">' +
            '<div style="width:' + Math.min(100,v) + '%;height:100%;background:' + c + ';border-radius:6px;"></div>' +
            '</div></div>';
    }

    function sbox(label, val, color) {
        return '<div style="text-align:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px 6px;">' +
            '<div style="font-size:18px;font-weight:800;color:' + color + ';">' + val + '</div>' +
            '<div style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">' + label + '</div>' +
            '</div>';
    }

    var w = window.open('','_blank');
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
        '<title>Staff Scorecard - ' + name + '</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">' +
        '<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Inter,sans-serif;background:#fff;padding:28px;}' +
        '.hdr{background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;padding:24px 28px;border-radius:14px;margin-bottom:20px;position:relative;overflow:hidden;}' +
        '.hdr::after{content:"";position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);}' +
        'h1{font-size:18px;font-weight:900;margin-bottom:2px;position:relative;z-index:1;}' +
        '.hdr-sub{font-size:12px;opacity:.8;position:relative;z-index:1;}' +
        '.score-row{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px;}' +
        '.grade-circ{width:64px;height:64px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;}' +
        '.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;}' +
        '.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}' +
        '.sec-lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px;}' +
        '.foot{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center;}' +
        '@media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
        '</style></head><body>' +
        '<div class="hdr">' +
        '<h1>Staff Performance Scorecard</h1>' +
        '<div class="hdr-sub">' + school + ' &nbsp;&bull;&nbsp; ' + name + ' &nbsp;&bull;&nbsp; ' + period + '</div>' +
        '</div>' +
        '<div class="score-row">' +
        '<div class="grade-circ" style="background:' + gc + '15;border:3px solid ' + gc + '40;">' +
        '<div style="font-size:26px;font-weight:900;color:' + gc + ';line-height:1;">' + s.grade + '</div>' +
        '<div style="font-size:8px;font-weight:700;color:' + gc + ';letter-spacing:1px;text-transform:uppercase;">Grade</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:38px;font-weight:900;color:' + barC + ';line-height:1;">' + (s.score!=null?s.score+'%':'N/A') + '</div>' +
        '<div style="font-size:10px;color:#9ca3af;margin-top:2px;">Overall Performance Score</div>' +
        '<div style="height:5px;background:#e5e7eb;border-radius:5px;overflow:hidden;width:130px;margin:5px 0 0 auto;">' +
        '<div style="width:' + Math.min(100,pct) + '%;height:100%;background:' + barC + ';border-radius:5px;"></div>' +
        '</div></div></div>' +
        '<div class="sec-lbl">Task Performance (40%)</div>' +
        '<div class="grid5">' +
        sbox('Total',        s.tasks_total||0,       '#6366f1') +
        sbox('On Time',      s.tasks_on_time||0,     '#16a34a') +
        sbox('Delayed',      s.tasks_delayed||0,     '#f59e0b') +
        sbox('Pending',      s.tasks_pending||0,     '#ef4444') +
        sbox('Transferred',  s.tasks_transferred||0, '#8b5cf6') +
        '</div>' +
        '<div class="sec-lbl">Communication (25%) &bull; Responsiveness (20%) &bull; Presence (15%)</div>' +
        '<div class="grid4">' +
        sbox('Msgs Sent',    s.msgs_sent||0,     '#0ea5e9') +
        sbox('Msgs Rcvd',    s.msgs_received||0, '#64748b') +
        sbox('Ack Rate',     ackR,               '#10b981') +
        sbox('Active Days',  s.active_days||0,   '#f59e0b') +
        '</div>' +
        '<div class="sec-lbl">Score Breakdown</div>' +
        bar('Task Delivery',  s.score_task,     '40%') +
        bar('Communication',  s.score_comm,     '25%') +
        bar('Responsiveness', s.score_resp,     '20%') +
        bar('Presence',       s.score_presence, '15%') +
        '<div class="foot">Generated by Noted For Action &bull; ' + new Date().toLocaleString('en-IN') + ' &bull; Objective &amp; Transparent</div>' +
        '<script>setTimeout(function(){window.print();},400);<\/script>' +
        '</body></html>');
    w.document.close();
};


// ─── GROUP SETTINGS ──────────────────────────────────────────────────────────
// Opens group settings modal for a department — loads name, colour, members.
