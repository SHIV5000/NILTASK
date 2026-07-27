import { sb } from './shared.js';

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

const _AF_REFRESH_MS = 60000;
const _AF_STATE = {
    inFlight: null,
    pending: false,
    refreshTimer: null,
};

// Card palette. Task activity intentionally uses indigo, matching the app accent.
const _AF_PAL = {
    chats:     { hex:'#2563EB', bg:'#DBEAFE', badge:'💬 Chats' },
    tasks:     { hex:'#4F46E5', bg:'#E0E7FF', badge:'📋 Tasks' },
    reminders: { hex:'#22C55E', bg:'#DCFCE7', badge:'⏰ Reminder' },
    system:    { hex:'#A855F7', bg:'#F3E8FF', badge:'🛠 System' },
};

const _esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function _feedTimeAgo(isoStr) {
    try {
        const diff = Date.now() - new Date(isoStr).getTime();
        const s = Math.max(0, Math.floor(diff / 1000));
        if (s < 60) return s + 's ago';
        const m = Math.floor(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.floor(m / 60);
        if (h < 24) return h + 'h ago';
        const d = Math.floor(h / 24);
        if (d < 7) return d + 'd ago';
        return new Date(isoStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
    } catch (e) { return ''; }
}

function _istDateStr(ts) {
    try {
        return new Date(new Date(ts).toLocaleString('en-US', { timeZone:'Asia/Kolkata' })).toDateString();
    } catch (e) { return ''; }
}

function _afDayLabel(ts) {
    const d = _istDateStr(ts);
    const today = _istDateStr(Date.now());
    const yesterday = _istDateStr(Date.now() - 86400000);
    if (d === today) return 'Today';
    if (d === yesterday) return 'Yesterday';
    try {
        return new Date(ts).toLocaleDateString('en-IN', {
            day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Kolkata'
        });
    } catch (e) { return d; }
}

function _afDateTime(ts) {
    try {
        return new Date(ts).toLocaleString('en-IN', {
            day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
            timeZone:'Asia/Kolkata'
        });
    } catch (e) { return ''; }
}

function _afDismissKey() {
    return 'af_dismissed_' + (window.currentTenantId || '') + '_' + (window.currentUser?.id || '');
}

function _afGetDismissed() {
    try { return JSON.parse(localStorage.getItem(_afDismissKey()) || '[]'); }
    catch (e) { return []; }
}

function _afAddDismissed(id) {
    try {
        const values = new Set(_afGetDismissed());
        values.add(id);
        localStorage.setItem(_afDismissKey(), JSON.stringify([...values].slice(-500)));
    } catch (e) {}
}

function _installActivityStyles() {
    if (document.getElementById('niltask-activity-controller-style')) return;
    const style = document.createElement('style');
    style.id = 'niltask-activity-controller-style';
    style.textContent = `
        #activityFeedPanel {
            display:flex;
            flex-direction:column;
            height:100%;
            min-height:0;
            background:var(--bg-body,#f8fafc);
            position:relative;
        }
        #activityFeedPanel .nfa-af-header {
            display:grid;
            grid-template-columns:minmax(0,1fr) auto;
            grid-template-areas:"title actions" "filters filters";
            gap:6px 8px;
            padding:8px 10px 7px;
            flex:0 0 auto;
            background:var(--bg-sidebar,#fff);
            border-bottom:1px solid var(--border-color,#e5e7eb);
            z-index:20;
        }
        #activityFeedPanel .nfa-af-title {
            grid-area:title;
            display:flex;
            align-items:center;
            gap:8px;
            min-width:0;
            color:var(--text-primary,#111827);
            font-size:14px;
            font-weight:800;
        }
        #activityFeedPanel .nfa-af-actions {
            grid-area:actions;
            display:flex;
            align-items:center;
            gap:5px;
        }
        #activityFeedPanel .nfa-af-clear-all {
            min-height:28px;
            padding:0 9px;
            border-radius:7px;
            border:1px solid var(--border-color,#d9dee8);
            background:transparent;
            color:var(--text-secondary,#64748b);
            font-size:10px;
            font-weight:700;
            cursor:pointer;
        }
        #activityFeedPanel .nfa-af-close {
            width:28px;
            height:28px;
            border:0;
            border-radius:50%;
            background:transparent;
            color:var(--text-secondary,#64748b);
            font-size:15px;
            cursor:pointer;
        }
        #activityFeedFilters {
            grid-area:filters;
            display:grid;
            grid-template-columns:minmax(0,1fr) minmax(0,1fr);
            gap:6px;
            min-width:0;
        }
        #activityFeedFilters select {
            display:block;
            width:100%;
            min-width:0;
            height:29px;
            margin:0;
            padding:0 23px 0 8px;
            border:1px solid var(--border-color,#d9dee8);
            border-radius:7px;
            background:var(--bg-body,#f8fafc);
            color:var(--text-primary,#111827);
            font-size:10px;
            line-height:29px;
            font-weight:700;
            box-shadow:none;
        }
        #activityFeedList {
            flex:1 1 auto;
            min-height:0;
            overflow-y:auto;
            padding:8px 10px 10px;
            background:var(--bg-body,#f8fafc);
            contain:layout paint;
        }
        #activityFeedList[aria-busy="true"] { cursor:progress; }
        #activityFeedList .nfa-af-card {
            position:relative;
            padding:9px 10px 9px 11px;
            margin-bottom:7px;
            border-left:4px solid var(--af-color);
            border-radius:11px;
            background:var(--bg-sidebar,#fff);
            box-shadow:0 1px 2px rgba(15,23,42,.05);
        }
        #activityFeedList .nfa-af-card.nfa-af-unread {
            background:color-mix(in srgb,var(--af-color) 7%,var(--bg-sidebar,#fff));
        }
        #activityFeedList .nfa-af-badge {
            display:inline-block;
            margin-bottom:4px;
            padding:2px 8px;
            border-radius:999px;
            background:var(--af-soft);
            color:var(--af-color);
            font-size:9px;
            font-weight:800;
            text-transform:uppercase;
            letter-spacing:.04em;
        }
        #activityFeedList .nfa-af-card-title {
            padding-right:25px;
            color:var(--text-primary,#111827);
            font-size:12.5px;
            line-height:1.3;
            font-weight:650;
        }
        #activityFeedList .nfa-af-sender {
            margin-top:1px;
            color:var(--text-secondary,#64748b);
            font-size:10.5px;
        }
        #activityFeedList .nfa-af-time {
            margin-top:3px;
            color:var(--text-secondary,#64748b);
            font-size:9.5px;
        }
        #activityFeedList .nfa-af-action {
            min-height:27px;
            margin-top:6px;
            padding:4px 10px;
            border:0;
            border-radius:7px;
            background:var(--af-color);
            color:#fff;
            font-size:10px;
            font-weight:700;
            cursor:pointer;
        }
        #activityFeedList .nfa-af-item-clear {
            position:absolute;
            top:7px;
            right:7px;
            width:22px;
            height:22px;
            border:0;
            border-radius:50%;
            background:rgba(148,163,184,.16);
            color:#64748b;
            font-size:11px;
            line-height:1;
            cursor:pointer;
            z-index:2;
        }
        #activityFeedList .nfa-af-unread-dot {
            position:absolute;
            top:12px;
            right:35px;
            width:7px;
            height:7px;
            border-radius:50%;
            background:var(--af-color);
        }
        #activityFeedList .nfa-af-day {
            display:flex;
            align-items:center;
            gap:10px;
            margin:5px 0 7px;
        }
        #activityFeedList .nfa-af-day span {
            padding:3px 10px;
            border-radius:999px;
            background:var(--bg-body,#f8fafc);
            color:var(--text-secondary,#64748b);
            font-size:10px;
            font-weight:750;
        }
        #activityFeedList .nfa-af-day i {
            flex:1;
            height:1px;
            background:var(--border-color,#e5e7eb);
        }
        #activityFeedList .nfa-af-empty {
            padding:40px 20px;
            text-align:center;
            color:var(--text-secondary,#64748b);
        }
    `;
    document.head.appendChild(style);
}

function _afCard(it) {
    const p = _AF_PAL[it.cat] || _AF_PAL.system;
    const clickAttr = it.click ? ' onclick="' + it.click + '" role="button" tabindex="0"' : '';
    const action = it.click
        ? '<button class="nfa-af-action" onclick="event.stopPropagation();' + it.click + '">' +
            (it.cat === 'tasks' ? '📂 View Task' : '🚀 Open') + '</button>'
        : '';
    const clear = '<button class="nfa-af-item-clear" onclick="event.stopPropagation();window._webClearActivityItem(\'' +
        it.src + '\',\'' + String(it.id).replace(/'/g, "\\'") + '\')" title="Clear" aria-label="Clear activity">✕</button>';

    return '<article class="nfa-af-card' + (it.unread ? ' nfa-af-unread' : '') + '"' + clickAttr +
        ' style="--af-color:' + p.hex + ';--af-soft:' + p.bg + ';' + (it.click ? 'cursor:pointer;' : '') + '">' +
        clear +
        '<span class="nfa-af-badge">' + p.badge + '</span>' +
        (it.unread ? '<span class="nfa-af-unread-dot" aria-hidden="true"></span>' : '') +
        '<div class="nfa-af-card-title">' + _esc(it.title) + '</div>' +
        (it.sender ? '<div class="nfa-af-sender">by ' + _esc(it.sender) + '</div>' : '') +
        '<div class="nfa-af-time"><i class="fa-regular fa-clock"></i> ' +
            _feedTimeAgo(it.ts) + ' · ' + _afDateTime(it.ts) + '</div>' +
        action +
        '</article>';
}

function _renderActivityFilters(senders) {
    const host = document.getElementById('activityFeedFilters');
    if (!host) return;

    const filter = window._webAfFilter || 'all';
    const senderFilter = window._webAfSender || '';
    const types = [
        ['all','All types'], ['chats','💬 Chats'], ['tasks','📋 Tasks'],
        ['reminders','⏰ Reminders'], ['system','🛠 System']
    ];

    host.innerHTML =
        '<select aria-label="Activity type" onchange="window._webSetAfFilter(this.value)">' +
            types.map(([value, label]) => '<option value="' + value + '"' +
                (filter === value ? ' selected' : '') + '>' + label + '</option>').join('') +
        '</select>' +
        '<select aria-label="Activity person" onchange="window._webSetAfSender(this.value)"' +
            (senders.length ? '' : ' disabled') + '>' +
            '<option value=""' + (senderFilter ? '' : ' selected') + '>👥 Everyone</option>' +
            senders.map(sender => '<option value="' + _esc(sender) + '"' +
                (senderFilter === sender ? ' selected' : '') + '>' + _esc(sender) + '</option>').join('') +
        '</select>';
}

function _replaceActivityList(list, html, scrollTop) {
    const range = document.createRange();
    range.selectNodeContents(list);
    const fragment = range.createContextualFragment(html);
    list.replaceChildren(fragment);
    requestAnimationFrame(() => {
        const max = Math.max(0, list.scrollHeight - list.clientHeight);
        list.scrollTop = Math.min(scrollTop, max);
    });
}

window.openActivityFeed = async function() {
    if (document.getElementById('activityFeedPanel')) {
        window.closeActivityFeed();
        return;
    }

    const rightSidebar = document.getElementById('rightSidebar');
    if (!rightSidebar) return;
    _installActivityStyles();

    if (window.getComputedStyle(rightSidebar).display === 'none') {
        rightSidebar.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }

    ['tasksPanel','rightSidebarFilters','dateRangeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    window._activityFeedOpen = true;
    localStorage.setItem('feedLastOpened', Date.now());

    const panel = document.createElement('section');
    panel.id = 'activityFeedPanel';
    panel.setAttribute('aria-label', 'Activity Feed');
    panel.innerHTML =
        '<header class="nfa-af-header">' +
            '<div class="nfa-af-title"><i class="fa-solid fa-bolt" style="color:var(--accent);"></i><span>Activity Feed</span></div>' +
            '<div class="nfa-af-actions">' +
                '<button class="nfa-af-clear-all" onclick="window._clearAllActivity()">Clear All</button>' +
                '<button class="nfa-af-close" onclick="window.closeActivityFeed()" aria-label="Close Activity Feed">✕</button>' +
            '</div>' +
            '<div id="activityFeedFilters"></div>' +
        '</header>' +
        '<div id="activityFeedList"><p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;">' +
            '<i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>';

    rightSidebar.appendChild(panel);
    await window._loadActivityFeed();

    try { clearInterval(window._afPollTimer); } catch (e) {}
    window._afPollTimer = setInterval(() => {
        if (window._activityFeedOpen && document.getElementById('activityFeedList')) {
            window._loadActivityFeed();
        } else {
            try { clearInterval(window._afPollTimer); } catch (e) {}
            window._afPollTimer = null;
        }
    }, _AF_REFRESH_MS);

    try {
        await sb.from('notifications').update({ is_read: true })
            .eq('user_id', window.currentUser?.id).eq('is_read', false);
    } catch (e) {}
    window._clearBellBadge?.();
};

window._loadActivityFeed = async function() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;

    if (_AF_STATE.inFlight) {
        _AF_STATE.pending = true;
        return _AF_STATE.inFlight;
    }

    const tid = window.currentTenantId;
    const uid = window.currentUser?.id;
    if (!tid || !uid) {
        _replaceActivityList(
            list,
            '<p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;">Session loading — close and reopen.</p>',
            0
        );
        return;
    }

    const oldScrollTop = list.scrollTop;
    list.setAttribute('aria-busy', 'true');

    _AF_STATE.inFlight = (async () => {
        const nameOf = (profile, fallback) => {
            const value = profile?.full_name || (profile?.email ? profile.email.split('@')[0] : '') || fallback || '';
            return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
        };
        const resolveName = id => nameOf((window.globalUsersCache || []).find(user => user.id === id), '');
        const resolveRoom = roomId => window.getRoomDisplayName?.(roomId) || roomId || '';

        const result = await window.NFA_buildActivity(sb, {
            uid,
            tid,
            resolveName,
            resolveRoom,
            snippet: window.snippet,
            markRead: false,
            logError: (message, data) => window.logger?.sb?.(message, data),
        });

        if (tid !== window.currentTenantId || uid !== window.currentUser?.id) return;

        const dismissed = new Set(_afGetDismissed());
        const items = [];
        (result.items || []).forEach(item => {
            const rawId = String(item.n.id);
            const isNotification = /^[0-9a-f-]{36}$/i.test(rawId);
            if (!isNotification && dismissed.has(rawId)) return;

            const click = item.act
                ? (item.act.k === 'task'
                    ? "window.goToTask&&window.goToTask('" + item.act.id + "'" +
                        (isNotification ? (",'" + rawId + "'") : '') + ")"
                    : "window.goToMessage&&window.goToMessage('" + item.act.id + "',null,null)")
                : '';

            items.push({
                id: rawId,
                src: isNotification ? 'notif' : 'local',
                cat: item.cat,
                ts: item.n.created_at,
                unread: !item.n.is_read,
                sender: item.sender || '',
                title: item.n.message,
                click,
            });
        });

        window._afLocalShown = items.filter(item => item.src === 'local').map(item => item.id);
        window._setBellBadge?.(result.unread || 0);

        const filter = window._webAfFilter || 'all';
        const senderFilter = window._webAfSender || '';
        let shown = items.filter(item => filter === 'all' || item.cat === filter);
        const senders = [...new Set(shown.map(item => item.sender).filter(sender => sender && sender !== 'You'))].sort();
        if (senderFilter) shown = shown.filter(item => item.sender === senderFilter);
        _renderActivityFilters(senders);

        if (!shown.length) {
            const message = filter === 'all' && !senderFilter
                ? 'Your activity will appear here when teammates chat, assign tasks, or reminders fire.'
                : 'No activity matches this filter.';
            _replaceActivityList(
                list,
                '<div class="nfa-af-empty"><div style="font-size:36px;margin-bottom:8px;">🚀</div>' +
                    '<div style="font-weight:800;font-size:14px;color:var(--text-primary);">All caught up!</div>' +
                    '<div style="font-size:11px;margin-top:6px;">' + message + '</div></div>',
                oldScrollTop
            );
            return;
        }

        let html = '';
        let currentDay = null;
        shown.forEach(item => {
            const day = _afDayLabel(item.ts);
            if (day !== currentDay) {
                currentDay = day;
                html += '<div class="nfa-af-day"><span>' + _esc(day) + '</span><i></i></div>';
            }
            html += _afCard(item);
        });
        _replaceActivityList(list, html, oldScrollTop);
    })().catch(error => {
        window.logger?.logError?.(error, { feature:'activity-feed' });
        if (!list.children.length) {
            _replaceActivityList(
                list,
                '<div class="nfa-af-empty"><div style="font-size:28px;margin-bottom:8px;">⚠️</div>' +
                    '<div style="font-weight:800;color:var(--text-primary);">Activity could not be loaded</div>' +
                    '<button class="nfa-af-action" style="--af-color:#4f46e5;margin-top:10px;" onclick="window._loadActivityFeed()">Retry</button></div>',
                oldScrollTop
            );
        }
    }).finally(() => {
        list.removeAttribute('aria-busy');
        _AF_STATE.inFlight = null;
        if (_AF_STATE.pending) {
            _AF_STATE.pending = false;
            clearTimeout(_AF_STATE.refreshTimer);
            _AF_STATE.refreshTimer = setTimeout(() => window._loadActivityFeed(), 120);
        }
    });

    return _AF_STATE.inFlight;
};

window._webSetAfFilter = function(filter) {
    window._webAfFilter = filter;
    window._webAfSender = '';
    window._loadActivityFeed();
};

window._webSetAfSender = function(sender) {
    window._webAfSender = sender || '';
    window._loadActivityFeed();
};

window._webClearActivityItem = async function(source, id) {
    if (source === 'notif') {
        try {
            await sb.from('notifications').delete().eq('id', id).eq('user_id', window.currentUser?.id);
        } catch (e) {}
    } else {
        _afAddDismissed(id);
    }
    await window._loadActivityFeed();
};

window.prependFeedItem = function(notification) {
    if (!notification || !window._activityFeedOpen) return;
    window.refreshActivityFeed();
};

window.closeActivityFeed = function() {
    window._activityFeedOpen = false;
    try { clearInterval(window._afPollTimer); } catch (e) {}
    try { clearTimeout(_AF_STATE.refreshTimer); } catch (e) {}
    window._afPollTimer = null;
    _AF_STATE.refreshTimer = null;
    _AF_STATE.pending = false;
    document.getElementById('activityFeedPanel')?.remove();
    ['tasksPanel','rightSidebarFilters','dateRangeFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.removeProperty('display');
    });
};

window.refreshActivityFeed = function() {
    if (!window._activityFeedOpen || !document.getElementById('activityFeedPanel')) return;
    clearTimeout(_AF_STATE.refreshTimer);
    _AF_STATE.refreshTimer = setTimeout(() => window._loadActivityFeed(), 250);
};

window._clearAllActivity = async function() {
    if (!confirm('Clear all activity?')) return;
    await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    try {
        const dismissed = new Set(_afGetDismissed());
        (window._afLocalShown || []).forEach(id => dismissed.add(id));
        localStorage.setItem(_afDismissKey(), JSON.stringify([...dismissed].slice(-500)));
    } catch (e) {}
    await window._loadActivityFeed();
};

_installActivityStyles();
window.NILTASK_ACTIVITY_CONTROLLER_VERSION = 'v1';
window.openActivityFeed.__nfaActivityController = true;
window._loadActivityFeed.__nfaActivityController = true;
window.refreshActivityFeed.__nfaActivityController = true;
window.prependFeedItem.__nfaActivityController = true;

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
