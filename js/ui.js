import { sb } from './shared.js';

// v1.53.0 - All 9 fixes: bell notifications, clear all, reactions RT, task scroll, badge, cross-DM, scheduled sound, reminder dismiss, activity feed

// ─── CSS INJECTION ─────────────────────────────────────────────────────────
(function() {
    if (document.getElementById('mpgs-style')) return;
    const style = document.createElement('style');
    style.id = 'mpgs-style';
    style.textContent = `
        @keyframes bell-ring {
            0%,100%{transform:rotate(0)}10%,30%,50%,70%,90%{transform:rotate(-14deg)}20%,40%,60%,80%{transform:rotate(14deg)}
        }
        .bell-ring { animation: bell-ring 0.5s ease infinite; color: var(--accent) !important; filter: drop-shadow(0 0 5px var(--accent)); }
        .bell-host { position:relative; display:inline-flex; align-items:center; }
        .notif-badge { position:absolute;top:-6px;right:-8px;background:var(--accent);color:#fff;border-radius:50%;font-size:9px;font-weight:800;width:17px;height:17px;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);z-index:20; }
    `;
    document.head.appendChild(style);
})();

window.currentTheme = localStorage.getItem('theme') || 'light';
window.currentRoom  = localStorage.getItem('mpgs_current_room') || 'general';
window.pendingScrollId  = null;
window.pendingFileUpload = null;

// ─── HELPERS ───────────────────────────────────────────────────────────────
window.stripHtml = function(html) {
    if (!html) return '';
    const d = document.createElement('div'); d.innerHTML = html;
    return (d.textContent || d.innerText || '').trim();
};

// ─── SCROLL TO TASK CARD (right sidebar) ───────────────────────────────────
window.goToTask = async function(taskId, notifId) {
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
    if (notifId) window.markNotifRead(notifId);
    // Make sure right sidebar is visible
    const rs = document.getElementById('rightSidebar');
    if (rs && window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }
    // Close activity feed if open, show tasks panel
    const af = document.getElementById('activityFeedPanel');
    if (af) { af.remove(); document.getElementById('tasksPanel')?.style.removeProperty('display'); }
    // Wait for panel to render then scroll
    await new Promise(r => setTimeout(r, 200));
    const card = document.querySelector(`.jira-card[data-task-id="${taskId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 0 3px var(--accent)';
        setTimeout(() => card.style.boxShadow = '', 2500);
    } else {
        // Task not in current filter — reload without filter then scroll
        const tf = document.getElementById('taskFilter');
        if (tf) tf.value = 'all';
        if (typeof window.loadTasksForPanel === 'function') await window.loadTasksForPanel();
        await new Promise(r => setTimeout(r, 300));
        const c2 = document.querySelector(`.jira-card[data-task-id="${taskId}"]`);
        if (c2) { c2.scrollIntoView({ behavior: 'smooth', block: 'center' }); c2.style.boxShadow = '0 0 0 3px var(--accent)'; setTimeout(() => c2.style.boxShadow = '', 2500); }
        else window.showCenterToast('Task not found in panel', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
    }
};

// ─── SCROLL TO MESSAGE (cross-room) ────────────────────────────────────────
window.goToMessage = async function(messageId, notifId, roomId) {
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
    if (notifId) window.markNotifRead(notifId);
    window.pendingScrollId = messageId;
    const resolvedRoom = (roomId && roomId !== 'null' && roomId !== 'undefined') ? roomId : null;
    if (resolvedRoom && resolvedRoom !== window.currentRoom) {
        window.currentRoom = resolvedRoom;
        localStorage.setItem('mpgs_current_room', resolvedRoom);
        const titleSpan = document.getElementById('roomTitleDisplay');
        let displayName = resolvedRoom.charAt(0).toUpperCase() + resolvedRoom.slice(1);
        if (resolvedRoom.startsWith('dm_')) {
            const withoutPrefix = resolvedRoom.replace('dm_', '');
            const otherUser = window.globalUsersCache?.find(u => u.id !== window.currentUser?.id && withoutPrefix.includes(u.id));
            displayName = otherUser ? (window.toSentenceCase?.(otherUser.full_name || otherUser.email?.split('@')[0]) || 'Direct Message') : 'Direct Message';
        }
        if (titleSpan) titleSpan.innerText = displayName;
        if (typeof window.loadChatsList === 'function') window.loadChatsList();
        if (typeof window.loadMessages === 'function') window.loadMessages();
    } else {
        const el = document.getElementById('row-' + messageId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const bubble = el.querySelector('.bubble');
            if (bubble) { bubble.classList.add('glow-target'); setTimeout(() => bubble.classList.add('active-glow'), 50); setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 3000); }
            window.pendingScrollId = null;
        } else {
            window.showCenterToast('Message not found in current view', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
            window.pendingScrollId = null;
        }
    }
};

window.applyTheme = function() {
    document.documentElement.setAttribute('data-theme', window.currentTheme);
    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.className = `fa-solid ${window.currentTheme === 'light' ? 'fa-sun' : window.currentTheme === 'dark' ? 'fa-moon' : 'fa-cloud-moon'} text-sm`;
};

window.showCenterToast = function(msg, icon='fa-solid fa-check-circle', color='text-green-400') {
    document.querySelectorAll('.center-toast').forEach(t => t.remove());
    const cleanMsg = window.stripHtml(msg);
    const t = document.createElement('div');
    t.className = 'center-toast opacity-0';
    t.style.cssText = 'max-width:360px;padding:10px 18px;border-radius:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.18);word-break:break-word;';
    t.innerHTML = `<i class="${icon} ${color}" style="font-size:15px;flex-shrink:0;"></i><span>${window.escapeHtml ? window.escapeHtml(cleanMsg) : cleanMsg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
};

window.toggleTheme = function() {
    if (window.currentTheme === 'light') window.currentTheme = 'dark';
    else if (window.currentTheme === 'dark') window.currentTheme = 'sober-dark';
    else window.currentTheme = 'light';
    localStorage.setItem('theme', window.currentTheme);
    window.applyTheme();
    window.showCenterToast(`${window.currentTheme === 'light' ? 'Light' : window.currentTheme === 'dark' ? 'Original Dark' : 'Sober Dark'} mode activated`, 'fa-solid fa-palette');
};

window.openSecureFile = async function(path) {
    window.showCenterToast('Authenticating...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 86400);
    if (error) { window.showCenterToast('Access Denied: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
};

window.toggleRightSidebar = function() {
    const el = document.getElementById('rightSidebar');
    if (!el) return;
    const isHidden = window.getComputedStyle(el).display === 'none';
    el.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_right_sidebar_state', isHidden ? 'flex' : 'none');
};

window.toggleLeftSidebar = function() {
    const el = document.getElementById('leftSidebar');
    if (!el) return;
    const isHidden = window.getComputedStyle(el).display === 'none';
    el.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_left_sidebar_state', isHidden ? 'flex' : 'none');
};

window.initResizers = function() {
    let resL = false, resR = false;
    const L = document.getElementById('leftSidebar'), R = document.getElementById('rightSidebar');
    document.getElementById('leftResizer')?.addEventListener('mousedown', () => { resL = true; document.body.style.cursor = 'col-resize'; });
    document.getElementById('rightResizer')?.addEventListener('mousedown', () => { resR = true; document.body.style.cursor = 'col-resize'; });
    document.addEventListener('mousemove', e => {
        if (resL && L) { const w = e.clientX; if (w > 200 && w < window.innerWidth * 0.5) { L.style.width = w + 'px'; localStorage.setItem('mpgs_left_width', w + 'px'); } }
        if (resR && R) { const w = window.innerWidth - e.clientX; if (w > 250 && w < window.innerWidth * 0.5) { R.style.width = w + 'px'; localStorage.setItem('mpgs_right_width', w + 'px'); } }
    });
    document.addEventListener('mouseup', () => { resL = false; resR = false; document.body.style.cursor = 'default'; });
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.bubble-dropdown').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
    document.getElementById(id)?.classList.toggle('open');
};
window.closeDropdowns = function() { document.querySelectorAll('.bubble-dropdown').forEach(d => d.classList.remove('open')); };

window.toggleTaskTrail = function(id) {
    const el = document.getElementById(id) || document.getElementById('trail-' + id) || document.getElementById('task-trail-' + id);
    if (!el) return;
    const hidden = el.style.display === 'none' || el.classList.contains('hidden') || window.getComputedStyle(el).display === 'none';
    if (hidden) { el.classList.remove('hidden'); el.style.setProperty('display', 'block', 'important'); }
    else { el.classList.add('hidden'); el.style.setProperty('display', 'none', 'important'); }
};
window.toggleTrail = window.toggleTaskTrail;

window.openTaskModal = async function(mid, text) {
    window.currentMessageId = mid;
    const tmp = document.createElement('DIV'); tmp.innerHTML = text;
    window.currentMessageTextRaw = (tmp.textContent || tmp.innerText || '').substring(0, 60) + '...';
    window.closeDropdowns();
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
    document.getElementById('taskTitle').value = (tmp.textContent || tmp.innerText || '').trim();
    const list = document.getElementById('assigneeCheckboxList');
    list.innerHTML = window.globalUsersCache.filter(u => u.id !== window.currentUser.id).map(u => `
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 rounded-lg cursor-pointer transition-colors border border-transparent">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-[var(--accent)] rounded">
            <span class="assignee-name font-semibold" style="color:var(--text-primary);">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</span>
        </label>`).join('');
    document.getElementById('assigneeSearch').value = '';
};

window.filterAssignees = function() {
    const term = document.getElementById('assigneeSearch').value.toLowerCase();
    document.querySelectorAll('.assignee-item').forEach(el => {
        el.style.display = el.querySelector('.assignee-name').innerText.toLowerCase().includes(term) ? 'flex' : 'none';
    });
};

window.closeTaskModal = function() { document.getElementById('taskModal').classList.add('hidden'); document.getElementById('taskModal').classList.remove('flex'); };

window.showReminderModal = function(mid, text) {
    window.currentReminderId = mid; window.closeDropdowns();
    document.getElementById('reminderMessagePreview').innerText = window.stripHtml(text);
    document.getElementById('reminderModal').classList.remove('hidden');
    document.getElementById('reminderModal').classList.add('flex');
};
window.closeReminderModal = function() { document.getElementById('reminderModal').classList.add('hidden'); document.getElementById('reminderModal').classList.remove('flex'); };

window.saveReminder = async function() {
    const dt = document.getElementById('reminderDateTime').value;
    if (!dt) return;
    await sb.from('reminders').insert({ user_id: window.currentUser.id, message_id: window.currentReminderId, reminder_time: new Date(dt).toISOString(), triggered: false });
    window.showCenterToast('Reminder Set Successfully ⏰');
    window.closeReminderModal();
};

window.toggleDateFilter = function() {
    const val = document.getElementById('taskFilter')?.value;
    const dr = document.getElementById('dateRangeFilter');
    if (val === 'date_range') dr?.classList.remove('hidden'); else dr?.classList.add('hidden');
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

// ─── TOP PANELS ────────────────────────────────────────────────────────────
window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 max-h-[500px] overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.cssText = 'background-color:var(--bg-sidebar);border-color:var(--border-color);width:340px;';

    // ── SCHEDULED ──────────────────────────────────────────────────────────
    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending').order('scheduled_time', {ascending: true});
        if (!data?.length) { panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No scheduled messages.</p>`; }
        else data.forEach(d => {
            const cleanText = window.stripHtml(d.message_text);
            const t = new Date(d.scheduled_time).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            panel.innerHTML += `<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                    <i class="fa-regular fa-clock mt-0.5 flex-shrink-0" style="color:var(--accent);font-size:13px;"></i>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-semibold truncate" style="color:var(--text-primary);">${window.escapeHtml(cleanText.substring(0,80))}</p>
                        <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(59,130,246,0.12);color:#3b82f6;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                    </div>
                </div>
                <div class="border-t flex" style="border-color:var(--border-color);">
                    <button onclick="window.deleteScheduled('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                </div>
            </div>`;
        });

    // ── REMINDERS ──────────────────────────────────────────────────────────
    } else if (type === 'reminders') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-solid fa-stopwatch text-purple-500"></i> Reminders</h4>`;
        const {data: upcoming} = await sb.from('reminders').select('*, messages(text, room_id)').eq('user_id', window.currentUser.id).eq('triggered', false).order('reminder_time', {ascending: true});
        const {data: fired} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).eq('type', 'reminder').order('created_at', {ascending: false}).limit(10);

        if (upcoming?.length) {
            panel.innerHTML += `<div class="text-[9px] font-black tracking-widest uppercase mb-2" style="color:var(--text-secondary);">⏳ Upcoming</div>`;
            upcoming.forEach(d => {
                const txt = window.stripHtml(d.messages?.text || 'Message...');
                const t = new Date(d.reminder_time).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const overdue = new Date(d.reminder_time) < new Date();
                const roomId = d.messages?.room_id || null;
                panel.innerHTML += `<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-stopwatch mt-0.5 flex-shrink-0" style="color:#a855f7;font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${overdue?'rgba(239,68,68,0.12)':'rgba(168,85,247,0.12)'};color:${overdue?'#ef4444':'#a855f7'};"><i class="fa-solid fa-bell" style="font-size:9px;"></i> ${t}${overdue?' · Overdue':''}</span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.goToMessage('${d.message_id}', null, '${roomId}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:opacity-70 border-r" style="color:var(--accent);border-color:var(--border-color);"><i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Go to message</button>
                        <button onclick="window.deleteReminder('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                    </div>
                </div>`;
            });
        } else {
            panel.innerHTML += `<p class="text-xs italic text-center py-3" style="color:var(--text-secondary);">No upcoming reminders.</p>`;
        }

        if (fired?.length) {
            panel.innerHTML += `<div class="flex items-center justify-between mt-4 mb-2">
                <div class="text-[9px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">✅ Fired</div>
                <button onclick="window.clearFiredReminders()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg" style="color:var(--text-secondary);">Clear all</button>
            </div>`;
            fired.forEach(d => {
                const msg = window.stripHtml(d.message);
                const t = new Date(d.created_at).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                // FIX: separate dismiss button — does NOT call goToMessage (which closes panel)
                panel.innerHTML += `<div class="mb-2 rounded-xl border overflow-hidden" id="fired-${d.id}" style="border-color:var(--border-color);opacity:${d.is_read?'0.5':'1'};">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-check-circle mt-0.5 flex-shrink-0" style="color:#22c55e;font-size:13px;"></i>
                        <div class="min-w-0 flex-1 cursor-pointer hover:opacity-80" onclick="window.goToMessage('${d.message_id}', '${d.id}')">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(34,197,94,0.12);color:#16a34a;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                        </div>
                        <button onclick="window.dismissFired('${d.id}')" class="flex-shrink-0 p-1 hover:text-red-500 transition-colors ml-1" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:11px;"></i></button>
                    </div>
                </div>`;
            });
        }

    // ── BOOKMARKS ──────────────────────────────────────────────────────────
    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text, room_id)').eq('user_id', window.currentUser.id);
        if (!data?.length) { panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No bookmarks yet.</p>`; }
        else data.forEach(d => {
            const txt = window.stripHtml(d.messages?.text || '');
            const roomId = d.messages?.room_id || null;
            panel.innerHTML += `<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}', null, '${roomId}')">
                    <i class="fa-solid fa-bookmark mt-0.5 flex-shrink-0" style="color:#f97316;font-size:13px;"></i>
                    <p class="text-xs font-medium line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,120))}</p>
                </div>
            </div>`;
        });

    // ── ALERTS / BELL ICON ─────────────────────────────────────────────────
    } else if (type === 'alerts') {
        // Fetch ALL notification types — message, task, reminder, general
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(20);

        panel.innerHTML = `<div class="flex items-center justify-between border-b pb-3 mb-3" style="border-color:var(--border-color);">
            <h4 class="font-bold flex items-center gap-2" style="color:var(--text-primary);"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>
            ${data?.length ? `<button onclick="window.clearAllNotifications()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg transition-colors" style="color:var(--text-secondary);">Clear all</button>` : ''}
        </div>`;

        if (!data?.length) {
            panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">All caught up! 🎉</p>`;
        } else {
            // Mark all unread as read
            const unreadIds = data.filter(d => !d.is_read).map(d => d.id);
            if (unreadIds.length) sb.from('notifications').update({is_read:true}).in('id', unreadIds).then(() => window.refreshNotificationBadge?.());

            data.forEach(d => {
                const msg = window.stripHtml(d.message);
                const t = new Date(d.created_at).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const type = d.type || 'general';
                // icon & color per type
                const iconMap = { reminder:'fa-stopwatch', task:'fa-clipboard-check', message:'fa-comment', general:'fa-bell' };
                const colorMap = { reminder:'#a855f7', task:'#3b82f6', message:'#22c55e', general:'#f59e0b' };
                const ic = iconMap[type] || 'fa-bell';
                const co = colorMap[type] || '#f59e0b';
                // Click action: task notifs → scroll to task card; others → scroll to message
                const clickAction = (type === 'task' && d.task_id)
                    ? `window.goToTask('${d.task_id}', '${d.id}')`
                    : `window.goToMessage('${d.message_id}', '${d.id}')`;
                panel.innerHTML += `<div class="mb-2 rounded-xl border overflow-hidden" id="notif-${d.id}" style="border-color:var(--border-color);opacity:${d.is_read?'0.6':'1'};">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="${clickAction}">
                        ${!d.is_read ? `<span class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style="background:${co};"></span>` : '<span class="w-1.5 flex-shrink-0"></span>'}
                        <i class="fa-solid ${ic} mt-0.5 flex-shrink-0" style="color:${co};font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,120))}</p>
                            <span class="text-[10px] mt-0.5 block" style="color:var(--text-secondary);">${t}</span>
                        </div>
                        <button onclick="event.stopPropagation();window.dismissNotif('${d.id}')" class="flex-shrink-0 ml-1 p-1 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:10px;"></i></button>
                    </div>
                </div>`;
            });
        }
    }

    document.querySelector('.chat-area').appendChild(panel);
}; // END openTopPanel

// ─── NOTIFICATION ACTIONS ──────────────────────────────────────────────────
// Dismiss single — removes from DOM immediately, then deletes from DB
window.dismissNotif = async function(id) {
    const el = document.getElementById('notif-' + id);
    if (el) el.remove();
    await sb.from('notifications').delete().eq('id', id);
    window.refreshNotificationBadge?.();
};

window.dismissFired = async function(id) {
    const el = document.getElementById('fired-' + id);
    if (el) el.remove();
    await sb.from('notifications').delete().eq('id', id);
    window.refreshNotificationBadge?.();
};

window.deleteNotification = window.dismissNotif;

window.clearAllNotifications = async function() {
    const { error } = await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    if (error) { window.showCenterToast('Clear failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('All notifications cleared.', 'fa-solid fa-check-circle', 'text-green-400');
};

window.clearFiredReminders = async function() {
    const { error } = await sb.from('notifications').delete().eq('user_id', window.currentUser.id).eq('type', 'reminder');
    if (error) { window.showCenterToast('Clear failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('Fired reminders cleared.', 'fa-solid fa-check-circle', 'text-green-400');
};

// ─── BADGE (bell icon only, not search bar) ────────────────────────────────
window.refreshNotificationBadge = async function() {
    const { count } = await sb.from('notifications').select('*', {count:'exact', head:true}).eq('user_id', window.currentUser.id).eq('is_read', false);
    // Find the bell icon specifically by its onclick
    const bellEl = document.querySelector('i.ti-bell');
    if (!bellEl) return;
    // Wrap in .bell-host if not already
    let host = bellEl.closest('.bell-host');
    if (!host) {
        host = document.createElement('span');
        host.className = 'bell-host';
        bellEl.parentNode.insertBefore(host, bellEl);
        host.appendChild(bellEl);
    }
    host.querySelector('.notif-badge')?.remove();
    if (count && count > 0) {
        const badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.textContent = count > 9 ? '9+' : count;
        host.appendChild(badge);
    }
};

window.markNotifRead = async function(id) {
    if (!id || id === 'null') return;
    await sb.from('notifications').update({is_read: true}).eq('id', id);
    window.refreshNotificationBadge?.();
};

window.deleteReminder = async function(id) {
    await sb.from('reminders').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Reminder cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
};

window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Scheduled message cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
};

// ─── BELL ANIMATION ────────────────────────────────────────────────────────
window.animateBell = function() {
    const bellEl = document.querySelector('i.ti-bell');
    if (!bellEl) return;
    bellEl.classList.add('bell-ring');
    const stop = () => bellEl.classList.remove('bell-ring');
    bellEl.closest('.bell-host')?.addEventListener('click', stop, { once: true });
    bellEl.addEventListener('click', stop, { once: true });
};

// ─── ACTIVITY FEED ─────────────────────────────────────────────────────────
window.openActivityFeed = async function() {
    // Hide tasks panel, show activity feed in right sidebar
    const rs = document.getElementById('rightSidebar');
    if (!rs) return;
    if (window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }
    // Remove existing feed if open (toggle)
    const existing = document.getElementById('activityFeedPanel');
    if (existing) { existing.remove(); document.getElementById('tasksPanel')?.style.removeProperty('display'); return; }

    const tasksPanelEl = document.getElementById('tasksPanel');
    if (tasksPanelEl) tasksPanelEl.style.display = 'none';

    // Fetch recent messages (all rooms this user participates in)
    const [{ data: msgs }, { data: notifs }] = await Promise.all([
        sb.from('messages').select('*, profiles(full_name, email)').order('created_at', {ascending: false}).limit(30),
        sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(20)
    ]);

    // Merge and sort by time descending
    const items = [];
    msgs?.forEach(m => items.push({ kind: 'message', time: m.created_at, data: m }));
    notifs?.forEach(n => items.push({ kind: 'notif', time: n.created_at, data: n }));
    items.sort((a, b) => new Date(b.time) - new Date(a.time));

    const feed = document.createElement('div');
    feed.id = 'activityFeedPanel';
    feed.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;z-index:10;';
    feed.style.backgroundColor = 'var(--bg-body)';

    feed.innerHTML = `
    <div class="p-3 border-b flex items-center justify-between flex-shrink-0" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
        <h3 class="font-bold flex items-center gap-2 text-sm" style="color:var(--text-primary);">
            <i class="fa-solid fa-bolt" style="color:var(--accent);"></i> Activity Feed
        </h3>
        <button onclick="window.closeActivityFeed()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Close & show Task Hub">
            <i class="fa-solid fa-times text-sm"></i>
        </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3" id="activityFeedList"></div>`;

    rs.querySelector('.w-full.h-full.flex')?.appendChild(feed);

    const list = document.getElementById('activityFeedList');
    if (!items.length) { list.innerHTML = '<p class="text-xs italic text-center py-8" style="color:var(--text-secondary);">No recent activity.</p>'; return; }

    list.innerHTML = items.map(item => {
        const t = new Date(item.time).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
        if (item.kind === 'message') {
            const m = item.data;
            const isMine = m.sender_id === window.currentUser.id;
            const name = isMine ? 'You' : window.toSentenceCase?.(m.profiles?.full_name || m.profiles?.email?.split('@')[0] || 'Unknown') || 'Unknown';
            const txt = window.stripHtml(m.text).substring(0, 80);
            const room = m.room_id?.startsWith('dm_') ? '💬 DM' : `# ${m.room_id}`;
            return `<div class="mb-2 p-2.5 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity" style="background-color:var(--bg-sidebar);border-color:var(--border-color);" onclick="window.goToMessage('${m.id}', null, '${m.room_id}')">
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style="background:${isMine ? 'var(--accent)' : '#6366f1'};">${name.charAt(0)}</div>
                    <span class="text-[11px] font-bold" style="color:var(--text-primary);">${window.escapeHtml(name)}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style="background:rgba(99,102,241,0.1);color:#6366f1;">${room}</span>
                    <span class="text-[9px] ml-auto" style="color:var(--text-secondary);">${t}</span>
                </div>
                <p class="text-[11px] line-clamp-2" style="color:var(--text-secondary);">${window.escapeHtml(txt || '📎 Attachment')}</p>
            </div>`;
        } else {
            const n = item.data;
            const msg = window.stripHtml(n.message).substring(0, 80);
            const typeColors = { reminder:'#a855f7', task:'#3b82f6', message:'#22c55e', general:'#f59e0b' };
            const typeIcons = { reminder:'fa-stopwatch', task:'fa-clipboard-check', message:'fa-comment', general:'fa-bell' };
            const co = typeColors[n.type] || '#f59e0b';
            const ic = typeIcons[n.type] || 'fa-bell';
            const clickAction = (n.type === 'task' && n.task_id) ? `window.goToTask('${n.task_id}')` : `window.goToMessage('${n.message_id}', '${n.id}')`;
            return `<div class="mb-2 p-2.5 rounded-xl border cursor-pointer hover:opacity-80 transition-opacity" style="background-color:var(--bg-sidebar);border-color:var(--border-color);opacity:${n.is_read?'0.6':'1'};" onclick="${clickAction}">
                <div class="flex items-center gap-2 mb-1">
                    <i class="fa-solid ${ic} flex-shrink-0" style="color:${co};font-size:12px;"></i>
                    <span class="text-[11px] font-bold capitalize" style="color:var(--text-primary);">${n.type || 'Notification'}</span>
                    ${!n.is_read ? `<span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:${co};"></span>` : ''}
                    <span class="text-[9px] ml-auto" style="color:var(--text-secondary);">${t}</span>
                </div>
                <p class="text-[11px] line-clamp-2" style="color:var(--text-secondary);">${window.escapeHtml(msg)}</p>
            </div>`;
        }
    }).join('');
};

window.closeActivityFeed = function() {
    document.getElementById('activityFeedPanel')?.remove();
    const tp = document.getElementById('tasksPanel');
    if (tp) tp.style.removeProperty('display');
};

// ─── SCHEDULE MODAL ────────────────────────────────────────────────────────
window.showScheduleModal = function() {
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if (!txt) { window.showCenterToast('Type a message first.', 'fa-solid fa-exclamation-triangle', 'text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
};
window.closeScheduleModal = function() { document.getElementById('scheduleModal').classList.add('hidden'); document.getElementById('scheduleModal').classList.remove('flex'); };

window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if (!time) return;
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    await sb.from('scheduled_messages').insert({ sender_id: window.currentUser.id, room_id: window.currentRoom, message_text: txt, scheduled_time: new Date(time).toISOString(), status: 'pending' });
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled Successfully! 🕐');
};
