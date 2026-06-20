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
    // Show right sidebar if hidden
    if (window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }
    // Toggle off if already open
    const existing = document.getElementById('activityFeedPanel');
    if (existing) {
        existing.remove();
        document.getElementById('tasksPanel')?.style.removeProperty('display');
        document.getElementById('rightSidebarFilters')?.style.removeProperty('display');
        return;
    }
    // Hide BOTH filter bar AND tasks panel so feed stretches full height
    const tasksPanelEl = document.getElementById('tasksPanel');
    if (tasksPanelEl) tasksPanelEl.style.display = 'none';
    const filtersEl = document.getElementById('rightSidebarFilters');
    if (filtersEl) filtersEl.style.display = 'none';
    const dateRangeEl = document.getElementById('dateRangeFilter');
    if (dateRangeEl) dateRangeEl.style.display = 'none';

    window._activityFeedOpen = true;
    // Fetch data — Activity Feed = raw activity (messages + task trails). NOT notifications table.
    const [{ data: msgs }, { data: trails }] = await Promise.all([
        sb.from('messages').select('*, profiles(full_name, email)').order('created_at', {ascending: false}).limit(40),
        sb.from('task_trails').select('*, profiles(full_name, email), tasks(title)').order('created_at', {ascending: false}).limit(20)
    ]);

    // Merge and sort newest first
    const items = [];
    msgs?.forEach(m => items.push({ kind: 'message', time: m.created_at, data: m }));
    trails?.forEach(t => items.push({ kind: 'trail', time: t.created_at, data: t }));
    items.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Create feed panel — same flex-1 as tasksPanel, NOT absolute
    const feed = document.createElement('div');
    feed.id = 'activityFeedPanel';
    feed.className = 'flex-1 flex flex-col overflow-hidden';
    feed.style.backgroundColor = 'var(--bg-body)';

    feed.innerHTML = `
    <div class="p-3 border-b flex items-center justify-between flex-shrink-0" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
        <span class="font-bold text-sm flex items-center gap-2" style="color:var(--text-primary);">
            <i class="fa-solid fa-bolt" style="color:var(--accent);"></i> Activity Feed
            <span class="text-[10px] font-normal px-1.5 py-0.5 rounded-full" style="background:rgba(99,102,241,0.1);color:#6366f1;">${items.length} items</span>
        </span>
        <button onclick="window.closeActivityFeed()" title="Close & show Task Hub"
            class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
            style="color:var(--text-secondary);">
            <i class="fa-solid fa-times text-sm"></i>
        </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3" id="activityFeedList"></div>`;

    // Insert right after tasksPanel's parent flex container
    const innerWrap = tasksPanelEl ? tasksPanelEl.parentElement : rs.querySelector('.w-full.h-full.flex');
    if (innerWrap) innerWrap.appendChild(feed);

    const list = document.getElementById('activityFeedList');
    if (!items.length) {
        list.innerHTML = '<p class="text-xs italic text-center py-8" style="color:var(--text-secondary);">No recent activity.</p>';
        return;
    }

    list.innerHTML = items.map(item => {
        const t = typeof window.getISTTime === 'function'
            ? window.getISTTime(item.time)
            : new Date(item.time).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata',hour12:true});
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
            // Task trail entry
            const tr = item.data;
            const tName = window.toSentenceCase?.(tr.profiles?.full_name || tr.profiles?.email?.split('@')[0] || 'Unknown') || 'Unknown';
            const taskTitle = tr.tasks?.title || 'Task';
            const action = tr.action || 'UPDATE';
            const comment = tr.comment ? ` — ${tr.comment.split('|')[0]}` : '';
            const actionColors = { FILE:'#10b981', UPDATE:'#3b82f6', CREATE:'#6366f1' };
            const co = actionColors[action] || '#6b7280';
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

// ─── Close activity feed and restore the task hub ──────────────────────────────

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

        '<div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);">' +
        'Formula: (On-time&times;4 + Delayed&times;2 &minus; Pending&times;1 &minus; Transferred&times;1) &divide; (Total&times;4) &times; 100' +
        '</div></div>';
};

// Download dashboard as a PDF progress card using html2pdf.js

window.downloadDashboardPDF = function() {
    if (typeof html2pdf === 'undefined') {
        window.showCenterToast('html2pdf not loaded on this page — add it to index.html','fa-solid fa-exclamation-triangle','text-yellow-500');
        return;
    }
    const el = document.getElementById('dashboardReport');
    if (!el) { window.showCenterToast('Open dashboard first','fa-solid fa-info-circle','text-blue-400'); return; }
    const d    = window._dashStats || {};
    const name = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:24px;font-family:Inter,sans-serif;background:#fff;color:#111;max-width:700px;';
    wrap.innerHTML = `
        <div style="text-align:center;border-bottom:3px solid #6366f1;padding-bottom:14px;margin-bottom:20px;">
            <h2 style="color:#6366f1;margin:0 0 4px;font-size:22px;font-weight:900;">MPGS TaskFlow — Progress Card</h2>
            <p style="color:#6b7280;margin:0;font-size:12px;">${name} &nbsp;·&nbsp; ${new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p>
        </div>
        <div style="text-align:center;background:linear-gradient(135deg,#6366f118,#6366f105);border:1px solid #6366f130;border-radius:16px;padding:20px;margin-bottom:20px;">
            <div style="font-size:52px;font-weight:900;color:#6366f1;">${d.score||0}</div>
            <div style="font-size:13px;font-weight:700;color:#6366f1;margin-top:4px;">Overall Performance Score</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <tr style="background:#f8f9fa;">
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Metric</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:right;width:80px;">Count</th>
            </tr>
            ${[['Messages Sent',d.msgSent],['Messages Received',d.msgRcvd],
               ['Tasks Created',d.tasksCreated],['Tasks Assigned to Me',d.tasksAssigned],
               ['Tasks Completed',d.tasksCompleted],['Tasks Pending',d.tasksPending],
               ['Reactions Given',d.reactions],['Replies Sent',d.replies]]
              .map(([k,v]) => `<tr><td style="padding:8px 10px;border:1px solid #e5e7eb;">${k}</td>
                  <td style="padding:8px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:700;">${v||0}</td></tr>`).join('')}
        </table>`;
    html2pdf().from(wrap).set({
        margin:10,
        filename:`MPGS_Progress_${name.replace(/\s+/g,'_')}.pdf`,
        html2canvas:{scale:2, useCORS:true},
        jsPDF:{unit:'mm', format:'a4', orientation:'portrait'}
    }).save().then(() => window.showCenterToast('Progress Card Downloaded!','fa-solid fa-file-pdf','text-green-500'));
};


// ─── GROUP SETTINGS ──────────────────────────────────────────────────────────
// Opens group settings modal for a department — loads name, colour, members.
