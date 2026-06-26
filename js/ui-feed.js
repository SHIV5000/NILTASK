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
    panel.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-body);';
    panel.innerHTML =
        '<div style="padding:12px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-sidebar);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">' +
        '<span style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-bolt" style="color:var(--accent);"></i> Activity Feed</span>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<button onclick="window._clearAllActivity()" style="font-size:11px;padding:3px 10px;border-radius:8px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);">Clear All</button>' +
        '<button onclick="window.closeActivityFeed()" style="width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:var(--text-secondary);font-size:14px;">✕</button>' +
        '</div></div>' +
        '<div id="activityFeedList" style="flex:1;overflow-y:auto;padding:8px;"><p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>';

    rs.appendChild(panel);
    await window._loadActivityFeed();
};

window._loadActivityFeed = async function() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;

    const tid = window.currentTenantId;
    const uid = window.currentUser?.id;
    console.log('[feed] opening — tenant:', tid, 'user:', uid);
    if (!tid || !uid) {
        console.warn('[feed] missing tenant or user — aborting');
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

    console.log('[feed] msgs fetched:', r1.data?.length ?? 0, r1.error ? '❌ ' + r1.error.message : '✓');
    console.log('[feed] trails fetched:', r2.data?.length ?? 0, r2.error ? '❌ ' + r2.error.message : '✓');
    console.log('[feed] notifs fetched:', r3.data?.length ?? 0, r3.error ? '❌ ' + r3.error.message : '✓');
    if (r1.error) console.warn('[feed] messages error:', r1.error);
    if (r2.error) console.warn('[feed] trails error:', r2.error);
    if (r3.error) console.warn('[feed] notifs error:', r3.error);

    let msgData = r1.data || [];
    if (!msgData.length && window.currentRoom) {
        const { data: fb } = await sb.from('messages')
            .select('id,created_at,room_id,sender_id,text,parent_message_id,profiles(full_name,email)')
            .eq('room_id', window.currentRoom).is('deleted_at', null)
            .order('created_at', { ascending: false }).limit(60);
        msgData = fb || [];
    }

    // Deduplicate: notifications already cover message events for the user,
    // so only show raw messages that are NOT already in notifications
    const notifMsgIds = new Set((r3.data||[]).map(n => n.message_id).filter(Boolean));
    const filteredMsgs = msgData.filter(m => !notifMsgIds.has(m.id));

    const items = [];
    filteredMsgs.forEach(m  => items.push({ k:'msg',   t:m.created_at,  d:m }));
    (r2.data||[]).forEach(tr => items.push({ k:'trail', t:tr.created_at, d:tr }));
    (r3.data||[]).forEach(n  => items.push({ k:'notif', t:n.created_at,  d:n }));
    items.sort((a,b) => new Date(b.t) - new Date(a.t));

    // Update bell badge to reflect actual unread count
    const unreadCount = (r3.data||[]).filter(n => !n.is_read).length;
    window._setBellBadge?.(unreadCount);

    console.log('[feed] total items after merge:', items.length, '| unread notifs:', unreadCount);

    if (!items.length) {
        console.log('[feed] nothing to show — rendering empty state');
        list.innerHTML = '<p style="text-align:center;padding:32px;color:var(--text-secondary);font-size:12px;">No activity yet.</p>';
        return;
    }

    let renderedCount = 0;
    const html = items.map((item, idx) => {
        try {
            const ago = _feedTimeAgo(item.t);

            if (item.k === 'msg') {
                const m = item.d;
                const mine = m.sender_id === (window.currentUser && window.currentUser.id);
                const prof = m.profiles || {};
                const fn  = prof.full_name || (prof.email ? prof.email.split('@')[0] : '') || '?';
                const nm  = mine ? 'You' : fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase();
                const rm  = (window.getRoomDisplayName && window.getRoomDisplayName(m.room_id)) || m.room_id || '';
                const tx  = _strip(m.text).substring(0,90) || 'Attachment';
                const bg  = mine ? 'var(--accent)' : '#6366f1';
                const typeLabel = m.parent_message_id ? 'Reply' : 'Message';
                renderedCount++;
                return '<div style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);align-items:flex-start;cursor:pointer;" onclick="window.goToMessage&&window.goToMessage(\'' + m.id + '\',null,\'' + m.room_id + '\')">'
                    + '<div style="width:32px;height:32px;border-radius:50%;background:' + bg + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">' + _esc((nm.charAt(0)||'?').toUpperCase()) + '</div>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">' + _esc(nm) + '<span style="font-weight:400;font-size:10px;color:var(--text-secondary);margin-left:4px;">' + typeLabel + ' in ' + _esc(rm) + '</span></div>'
                    + '<div style="font-size:12px;color:var(--text-secondary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(tx) + '</div>'
                    + '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">' + ago + '</div>'
                    + '</div></div>';
            }

            if (item.k === 'trail') {
                const tr = item.d;
                const tprof = tr.profiles || {};
                const fn  = tprof.full_name || (tprof.email ? tprof.email.split('@')[0] : '') || 'Staff';
                const nm  = fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase();
                const ttl = (tr.tasks && tr.tasks.title) || 'Task';
                const act = tr.action || 'update';
                const trailType = act === 'created' ? 'task_created' : act === 'accepted' ? 'task_completed' : 'task_updated';
                const cfg = _FEED_TYPES[trailType] || _FEED_TYPES.task_updated;
                const actLabel = ({ created:'ASSIGNED', accepted:'DONE', submitted:'SUBMITTED', update:'UPDATED', delegate:'DELEGATED', transfer:'TRANSFERRED', review:'REVIEWED' })[act] || act.toUpperCase();
                renderedCount++;
                return '<div style="display:flex;gap:10px;padding:10px 8px;border-bottom:1px solid var(--border-color);align-items:flex-start;cursor:pointer;" onclick="window.goToTask&&window.goToTask(\'' + (tr.task_id||'') + '\')">'
                    + '<div style="width:32px;height:32px;border-radius:50%;background:' + cfg.color + '18;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fa-solid ' + cfg.fa + '" style="color:' + cfg.color + ';font-size:13px;"></i></div>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-size:12px;font-weight:600;color:var(--text-primary);">' + _esc(nm) + '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;background:' + cfg.color + '18;color:' + cfg.color + ';margin-left:6px;">' + actLabel + '</span></div>'
                    + '<div style="font-size:12px;color:var(--text-secondary);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(ttl) + '</div>'
                    + '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">' + ago + '</div>'
                    + '</div></div>';
            }

            // Notification item
            renderedCount++;
            return _renderNotifItem(item.d);
        } catch(err) {
            console.error('[feed] render error at index', idx, 'kind:', item.k, err, item);
            return '';
        }
    }).join('');

    console.log('[feed] rendered:', renderedCount, '/ html length:', html.length);
    list.innerHTML = html || '<p style="text-align:center;padding:32px;color:var(--text-secondary);font-size:12px;">No activity yet.</p>';
};

// Real-time: prepend a single incoming notification to the feed list without full reload
window.prependFeedItem = function(notif) {
    if (!notif) return;
    const list = document.getElementById('activityFeedList');
    if (!list) return;
    // Remove empty-state placeholder if present
    const placeholder = list.querySelector('p');
    if (placeholder && !list.querySelector('[id^="feed-notif-"]')) placeholder.remove();
    list.insertAdjacentHTML('afterbegin', _renderNotifItem(notif));
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
