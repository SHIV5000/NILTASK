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
    await window.loadDashboard('today');
};

window.closeDashboard = function() {
    const modal = document.getElementById('dashboardModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// Fetch and render dashboard stats for the given period (today/week/month/all)

window.loadDashboard = async function(filter) {
    // Update active tab styling
    document.querySelectorAll('.dash-tab').forEach(b => {
        const on = b.dataset.period === filter;
        b.style.background   = on ? 'var(--accent)' : 'var(--bg-body)';
        b.style.color        = on ? '#fff' : 'var(--text-secondary)';
        b.style.borderColor  = on ? 'var(--accent)' : 'var(--border-color)';
    });
    const el = document.getElementById('dashboardContent');
    if (!el) return;
    el.innerHTML = '<div class="flex items-center justify-center py-12" style="color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin mr-2 text-xl"></i> Loading stats...</div>';

    const uid = window.currentUser.id;
    const now = new Date();
    let since = null;
    if (filter === 'today') { const d = new Date(now); d.setHours(0,0,0,0); since = d.toISOString(); }
    else if (filter === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); since = d.toISOString(); }
    else if (filter === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); since = d.toISOString(); }

    // Safe query helper — returns 0 on any error (missing column, RLS, etc.)
    const q = async (fn) => { try { const {count,error} = await fn(); return error ? 0 : (count||0); } catch(e){ return 0; } };

    const msgSent      = await q(() => { let x=sb.from('messages').select('*',{count:'exact',head:true}).eq('sender_id',uid); if(since)x=x.gte('created_at',since); return x; });
    const msgRcvd      = await q(() => { let x=sb.from('messages').select('*',{count:'exact',head:true}).neq('sender_id',uid); if(since)x=x.gte('created_at',since); return x; });
    const tasksCreated = await q(() => { let x=sb.from('tasks').select('*',{count:'exact',head:true}).eq('assigned_by',uid); if(since)x=x.gte('created_at',since); return x; });
    const replies      = await q(() => { let x=sb.from('messages').select('*',{count:'exact',head:true}).eq('sender_id',uid).not('parent_message_id','is',null); if(since)x=x.gte('created_at',since); return x; });
    // task_assignees has no created_at — no date filter
    const tasksAssigned  = await q(() => sb.from('task_assignees').select('*',{count:'exact',head:true}).eq('assignee_id',uid));
    const tasksCompleted = await q(() => sb.from('task_assignees').select('*',{count:'exact',head:true}).eq('assignee_id',uid).eq('status','accepted'));
    const tasksPending   = await q(() => sb.from('task_assignees').select('*',{count:'exact',head:true}).eq('assignee_id',uid).neq('status','accepted'));
    const reactions      = await q(() => { let x=sb.from('reactions').select('*',{count:'exact',head:true}).eq('user_id',uid); if(since)x=x.gte('created_at',since); return x; });

    // Calculate score
    const completionRate  = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;
    const engagementScore = Math.min(100, Math.round(((msgSent*2) + (replies*3) + reactions) / 5));
    const score           = Math.round(completionRate*0.6 + engagementScore*0.4);
    const scoreColor      = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
    const scoreLabel      = score >= 80 ? 'Excellent ⭐' : score >= 60 ? 'Good 👍' : 'Needs Attention ⚠️';

    // Stat card helper
    const card = (icon,color,label,val) => `
        <div class="rounded-xl p-3 border" style="background:var(--bg-body);border-color:${color}22;">
            <div class="flex items-center gap-2 mb-1">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${color}18;">
                    <i class="fa-solid ${icon}" style="color:${color};font-size:12px;"></i>
                </div>
                <span class="text-[9px] font-black uppercase tracking-wider flex-1" style="color:${color};">${label}</span>
            </div>
            <div class="text-2xl font-black" style="color:var(--text-primary);">${val}</div>
        </div>`;

    // Store stats for PDF
    window._dashStats = { msgSent, msgRcvd, tasksCreated, tasksAssigned, tasksCompleted, tasksPending, reactions, replies, score, filter };

    el.innerHTML = `
    <div id="dashboardReport">
        <div class="rounded-2xl p-4 mb-4 text-center" style="background:linear-gradient(135deg,${scoreColor}18,${scoreColor}05);border:1px solid ${scoreColor}30;">
            <div class="text-5xl font-black mb-1" style="color:${scoreColor};">${score}</div>
            <div class="font-bold mb-1 text-sm" style="color:${scoreColor};">${scoreLabel}</div>
            <div class="text-xs" style="color:var(--text-secondary);">Overall Performance · ${filter==='all'?'All Time':filter.charAt(0).toUpperCase()+filter.slice(1)}</div>
            <div class="flex gap-4 justify-center mt-2 text-xs" style="color:var(--text-secondary);">
                <span>Task Completion <b style="color:${scoreColor};">${completionRate}%</b></span>
                <span>Engagement <b style="color:${scoreColor};">${engagementScore}%</b></span>
            </div>
            <div style="height:6px;border-radius:3px;background:var(--border-color);overflow:hidden;margin-top:10px;">
                <div style="height:100%;border-radius:3px;background:${scoreColor};width:${score}%;transition:width 0.6s ease;"></div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
            ${card('fa-paper-plane','#6366f1','Messages Sent',msgSent)}
            ${card('fa-inbox','#10b981','Messages Received',msgRcvd)}
            ${card('fa-plus-circle','#f59e0b','Tasks Created',tasksCreated)}
            ${card('fa-user-check','#3b82f6','Assigned to Me',tasksAssigned)}
            ${card('fa-check-circle','#16a34a','Tasks Completed',tasksCompleted)}
            ${card('fa-hourglass-half','#ef4444','Tasks Pending',tasksPending)}
            ${card('fa-face-smile','#a855f7','Reactions Given',reactions)}
            ${card('fa-reply','#0ea5e9','Replies Sent',replies)}
        </div>
    </div>`;
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
