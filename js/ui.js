import { sb } from './shared.js';

// v1.52.0 - DM fix, sounds, bell animation, badge fix

// ─── BELL ANIMATION CSS (injected once) ────────────────────────────────────
(function() {
    if (document.getElementById('mpgs-bell-style')) return;
    const style = document.createElement('style');
    style.id = 'mpgs-bell-style';
    style.textContent = `
        @keyframes bell-ring {
            0%,100% { transform: rotate(0deg); }
            10%,30%,50%,70%,90% { transform: rotate(-12deg); }
            20%,40%,60%,80% { transform: rotate(12deg); }
        }
        .bell-ring {
            animation: bell-ring 0.6s ease infinite;
            color: var(--accent) !important;
            filter: drop-shadow(0 0 4px var(--accent));
        }
        .bell-wrapper { position: relative; display: inline-flex; align-items: center; }
    `;
    document.head.appendChild(style);
})();


window.currentTheme = localStorage.getItem('theme') || 'light';
window.currentRoom = localStorage.getItem('mpgs_current_room') || 'general';
window.pendingScrollId = null;
window.pendingFileUpload = null;

// ─── HTML STRIPPER ─────────────────────────────────────────────────────────
window.stripHtml = function(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
};

// ─── UNIVERSAL SCROLL + HIGHLIGHT ─────────────────────────────────────────
// Uses pendingScrollId so loadMessages() handles the actual scroll after render
window.goToMessage = async function(messageId, notifId, roomId) {
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
    if (notifId && typeof window.markNotifRead === 'function') window.markNotifRead(notifId);

    // Set the pending scroll target BEFORE switching rooms
    window.pendingScrollId = messageId;

    if (roomId && roomId !== 'null' && roomId !== window.currentRoom) {
        // Switch to the correct room — loadMessages will scroll after render
        window.currentRoom = roomId;
        localStorage.setItem('mpgs_current_room', roomId);
        const titleSpan = document.getElementById('roomTitleDisplay');
        let displayName = roomId.charAt(0).toUpperCase() + roomId.slice(1);
        if (roomId.startsWith('dm_')) {
            // Extract other user's ID from canonical dm_<id1>_<id2>
            const withoutPrefix = roomId.replace('dm_', '');
            const meId = window.currentUser?.id || '';
            // Find which user in cache matches either segment
            const otherUser = window.globalUsersCache?.find(u => u.id !== meId && withoutPrefix.includes(u.id));
            displayName = otherUser
                ? (window.toSentenceCase ? window.toSentenceCase(otherUser.full_name || otherUser.email.split('@')[0]) : (otherUser.full_name || 'Direct Message'))
                : 'Direct Message';
        }
        if (titleSpan) titleSpan.innerText = displayName;
        if (typeof window.loadChatsList === 'function') window.loadChatsList();
        if (typeof window.loadMessages === 'function') window.loadMessages();
        // loadMessages will call scrollIntoView via pendingScrollId after 100ms
    } else {
        // Same room — scroll immediately
        const el = document.getElementById('row-' + messageId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const bubble = el.querySelector('.bubble');
            if (bubble) {
                bubble.classList.add('glow-target');
                setTimeout(() => bubble.classList.add('active-glow'), 50);
                setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 3000);
            }
            window.pendingScrollId = null;
        } else {
            window.showCenterToast('Message not found in current view', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
            window.pendingScrollId = null;
        }
    }
};

window.applyTheme = function() {
    document.documentElement.setAttribute('data-theme', window.currentTheme);
    const themeIcon = document.getElementById('themeToggleIcon');
    if (themeIcon) {
        if (window.currentTheme === 'light') themeIcon.className = 'fa-solid fa-sun text-sm';
        else if (window.currentTheme === 'dark') themeIcon.className = 'fa-solid fa-moon text-sm';
        else themeIcon.className = 'fa-solid fa-cloud-moon text-sm';
    }
};

// ─── TOAST ─────────────────────────────────────────────────────────────────
window.showCenterToast = function(msg, icon = 'fa-solid fa-check-circle', color = 'text-green-400') {
    document.querySelectorAll('.center-toast').forEach(t => t.remove());
    const cleanMsg = window.stripHtml ? window.stripHtml(msg) : msg;
    const t = document.createElement('div');
    t.className = 'center-toast opacity-0';
    t.style.cssText = `max-width:360px;padding:10px 18px;border-radius:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.18);word-break:break-word;`;
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
    const modeName = window.currentTheme === 'light' ? 'Light' : (window.currentTheme === 'dark' ? 'Original Dark' : 'Sober Dark');
    window.showCenterToast(`${modeName} mode activated`, 'fa-solid fa-palette');
};

window.openSecureFile = async function(path) {
    window.showCenterToast('Authenticating secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 86400);
    if (error) { window.showCenterToast('Access Denied: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
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
    let isResizingLeft = false, isResizingRight = false;
    const leftSidebar = document.getElementById('leftSidebar');
    const rightSidebar = document.getElementById('rightSidebar');
    document.getElementById('leftResizer')?.addEventListener('mousedown', () => { isResizingLeft = true; document.body.style.cursor = 'col-resize'; });
    document.getElementById('rightResizer')?.addEventListener('mousedown', () => { isResizingRight = true; document.body.style.cursor = 'col-resize'; });
    document.addEventListener('mousemove', (e) => {
        if (isResizingLeft && leftSidebar) {
            const w = e.clientX;
            if (w > 200 && w < window.innerWidth * 0.5) { leftSidebar.style.width = w + 'px'; localStorage.setItem('mpgs_left_width', w + 'px'); }
        }
        if (isResizingRight && rightSidebar) {
            const w = window.innerWidth - e.clientX;
            if (w > 250 && w < window.innerWidth * 0.5) { rightSidebar.style.width = w + 'px'; localStorage.setItem('mpgs_right_width', w + 'px'); }
        }
    });
    document.addEventListener('mouseup', () => { isResizingLeft = false; isResizingRight = false; document.body.style.cursor = 'default'; });
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.bubble-dropdown').forEach(d => { if (d.id !== id) d.classList.remove('open'); });
    document.getElementById(id).classList.toggle('open');
};

window.closeDropdowns = function() {
    document.querySelectorAll('.bubble-dropdown').forEach(d => d.classList.remove('open'));
};

window.toggleTaskTrail = function(id) {
    const el = document.getElementById(id) || document.getElementById('trail-' + id) || document.getElementById('task-trail-' + id);
    if (!el) return;
    const isHidden = el.style.display === 'none' || el.classList.contains('hidden') || window.getComputedStyle(el).display === 'none';
    if (isHidden) { el.classList.remove('hidden'); el.style.setProperty('display', 'block', 'important'); }
    else { el.classList.add('hidden'); el.style.setProperty('display', 'none', 'important'); }
};
window.toggleTrail = window.toggleTaskTrail;

window.openTaskModal = async function(mid, text) {
    window.currentMessageId = mid;
    const tmp = document.createElement('DIV');
    tmp.innerHTML = text;
    window.currentMessageTextRaw = (tmp.textContent || tmp.innerText || '').substring(0, 60) + '...';
    window.closeDropdowns();
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
    document.getElementById('taskTitle').value = (tmp.textContent || tmp.innerText || '').trim();
    const filteredUsers = window.globalUsersCache.filter(u => u.id !== window.currentUser.id);
    const list = document.getElementById('assigneeCheckboxList');
    list.innerHTML = filteredUsers.map(u => `
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
    window.currentReminderId = mid;
    window.closeDropdowns();
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
    const val = document.getElementById('taskFilter').value;
    const dr = document.getElementById('dateRangeFilter');
    if (val === 'date_range') dr.classList.remove('hidden'); else dr.classList.add('hidden');
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

// ─── TOP PANELS ────────────────────────────────────────────────────────────
window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 max-h-[500px] overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.cssText = `background-color:var(--bg-sidebar);border-color:var(--border-color);width:340px;`;

    // ── SCHEDULED ──────────────────────────────────────────────────────────
    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);">
            <i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages
        </h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending').order('scheduled_time', {ascending: true});
        if (!data || data.length === 0) {
            panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No scheduled messages.</p>`;
        } else {
            data.forEach(d => {
                const cleanText = window.stripHtml(d.message_text);
                const schedTime = new Date(d.scheduled_time).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
                panel.innerHTML += `
                <div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-regular fa-clock mt-0.5 flex-shrink-0" style="color:var(--accent);font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold truncate" style="color:var(--text-primary);">${window.escapeHtml(cleanText.substring(0, 80))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(59,130,246,0.12);color:#3b82f6;">
                                <i class="fa-solid fa-clock" style="font-size:9px;"></i> ${schedTime}
                            </span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.deleteScheduled('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel
                        </button>
                    </div>
                </div>`;
            });
        }

    // ── REMINDERS ──────────────────────────────────────────────────────────
    } else if (type === 'reminders') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);">
            <i class="fa-solid fa-stopwatch text-purple-500"></i> Reminders
        </h4>`;

        const {data: upcoming} = await sb.from('reminders')
            .select('*, messages(text, room_id)')
            .eq('user_id', window.currentUser.id)
            .eq('triggered', false)
            .order('reminder_time', {ascending: true});

        const {data: fired} = await sb.from('notifications')
            .select('*')
            .eq('user_id', window.currentUser.id)
            .eq('type', 'reminder')
            .order('created_at', {ascending: false})
            .limit(10);

        // Upcoming
        if (upcoming && upcoming.length > 0) {
            panel.innerHTML += `<div class="text-[9px] font-black tracking-widest uppercase mb-2 flex items-center gap-1" style="color:var(--text-secondary);"><i class="fa-solid fa-hourglass-half" style="font-size:9px;"></i> Upcoming</div>`;
            upcoming.forEach(d => {
                const cleanText = window.stripHtml(d.messages?.text || 'Message...');
                const remTime = new Date(d.reminder_time).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
                const isOverdue = new Date(d.reminder_time) < new Date();
                const roomId = d.messages?.room_id || null;
                panel.innerHTML += `
                <div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}', null, '${roomId}')">
                        <i class="fa-solid fa-stopwatch mt-0.5 flex-shrink-0" style="color:#a855f7;font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(cleanText.substring(0, 100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style="background:${isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(168,85,247,0.12)'};color:${isOverdue ? '#ef4444' : '#a855f7'};">
                                <i class="fa-solid fa-bell" style="font-size:9px;"></i> ${remTime}${isOverdue ? ' · Overdue' : ''}
                            </span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.goToMessage('${d.message_id}', null, '${roomId}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:opacity-70 border-r transition-opacity" style="color:var(--accent);border-color:var(--border-color);">
                            <i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Go to message
                        </button>
                        <button onclick="window.deleteReminder('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel
                        </button>
                    </div>
                </div>`;
            });
        } else {
            panel.innerHTML += `<p class="text-xs italic text-center py-3" style="color:var(--text-secondary);">No upcoming reminders.</p>`;
        }

        // Fired
        if (fired && fired.length > 0) {
            panel.innerHTML += `
            <div class="flex items-center justify-between mt-4 mb-2">
                <div class="text-[9px] font-black tracking-widest uppercase flex items-center gap-1" style="color:var(--text-secondary);">
                    <i class="fa-solid fa-check-circle" style="font-size:9px;color:#22c55e;"></i> Fired
                </div>
                <button onclick="window.clearFiredReminders()" class="text-[10px] font-bold hover:text-red-500 transition-colors px-2 py-0.5 rounded-lg" style="color:var(--text-secondary);">
                    Clear all
                </button>
            </div>`;
            fired.forEach(d => {
                const cleanMsg = window.stripHtml(d.message);
                const firedTime = new Date(d.created_at).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
                panel.innerHTML += `
                <div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);opacity:${d.is_read ? '0.5' : '1'};">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}', '${d.id}')">
                        <i class="fa-solid fa-check-circle mt-0.5 flex-shrink-0" style="color:#22c55e;font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(cleanMsg.substring(0, 100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(34,197,94,0.12);color:#16a34a;">
                                <i class="fa-solid fa-clock" style="font-size:9px;"></i> ${firedTime}
                            </span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.deleteNotification('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Dismiss
                        </button>
                    </div>
                </div>`;
            });
        }

    // ── BOOKMARKS ──────────────────────────────────────────────────────────
    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);">
            <i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks
        </h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text, room_id)').eq('user_id', window.currentUser.id);
        if (!data || data.length === 0) {
            panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No bookmarks yet.</p>`;
        } else {
            data.forEach(d => {
                const cleanText = window.stripHtml(d.messages?.text || '');
                const roomId = d.messages?.room_id || null;
                panel.innerHTML += `
                <div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80 transition-opacity" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}', null, '${roomId}')">
                        <i class="fa-solid fa-bookmark mt-0.5 flex-shrink-0" style="color:#f97316;font-size:13px;"></i>
                        <p class="text-xs font-medium line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(cleanText.substring(0, 120))}</p>
                    </div>
                </div>`;
            });
        }

    // ── ALERTS ─────────────────────────────────────────────────────────────
    } else if (type === 'alerts') {
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(15);

        panel.innerHTML = `
        <div class="flex items-center justify-between border-b pb-3 mb-3" style="border-color:var(--border-color);">
            <h4 class="font-bold flex items-center gap-2" style="color:var(--text-primary);">
                <i class="fa-regular fa-bell text-yellow-500"></i> Notifications
            </h4>
            ${data && data.length > 0 ? `<button onclick="window.clearAllNotifications()" class="text-[10px] font-bold hover:text-red-500 transition-colors px-2 py-0.5 rounded-lg" style="color:var(--text-secondary);">Clear all</button>` : ''}
        </div>`;

        if (!data || data.length === 0) {
            panel.innerHTML += `<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">All caught up! 🎉</p>`;
        } else {
            // Mark all as read silently on open
            const unread = data.filter(d => !d.is_read).map(d => d.id);
            if (unread.length > 0) {
                sb.from('notifications').update({ is_read: true }).in('id', unread).then(() => {
                    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
                });
            }
            data.forEach(d => {
                const cleanMsg = window.stripHtml(d.message);
                const notifTime = new Date(d.created_at).toLocaleString('en-IN', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
                const isReminder = d.type === 'reminder';
                const iconClass = isReminder ? 'fa-stopwatch' : 'fa-bell';
                const iconColor = isReminder ? '#a855f7' : '#f59e0b';
                const dotColor = isReminder ? '#a855f7' : '#f59e0b';
                panel.innerHTML += `
                <div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);opacity:${d.is_read ? '0.6' : '1'};">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}', '${d.id}')">
                        ${!d.is_read ? `<span class="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style="background:${dotColor};"></span>` : '<span class="w-1.5 flex-shrink-0"></span>'}
                        <i class="fa-solid ${iconClass} mt-0.5 flex-shrink-0" style="color:${iconColor};font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(cleanMsg.substring(0, 120))}</p>
                            <span class="text-[10px] mt-0.5 block" style="color:var(--text-secondary);">${notifTime}</span>
                        </div>
                        <button onclick="event.stopPropagation(); window.deleteNotification('${d.id}')" class="flex-shrink-0 ml-1 p-1 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss">
                            <i class="fa-solid fa-times" style="font-size:10px;"></i>
                        </button>
                    </div>
                </div>`;
            });
        }
    }

    document.querySelector('.chat-area').appendChild(panel);
}; // END openTopPanel

// ─── NOTIFICATION ACTIONS ──────────────────────────────────────────────────
window.deleteNotification = async function(id) {
    await sb.from('notifications').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
    window.showCenterToast('Notification dismissed.', 'fa-solid fa-check', 'text-green-400');
};

window.clearAllNotifications = async function() {
    await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
    window.showCenterToast('All notifications cleared.', 'fa-solid fa-check-circle', 'text-green-400');
};

window.clearFiredReminders = async function() {
    await sb.from('notifications').delete().eq('user_id', window.currentUser.id).eq('type', 'reminder');
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
    window.showCenterToast('Fired reminders cleared.', 'fa-solid fa-check-circle', 'text-green-400');
};

// ─── BADGE ─────────────────────────────────────────────────────────────────
window.refreshNotificationBadge = async function() {
    const { count } = await sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', window.currentUser.id).eq('is_read', false);
    const bellIcon = document.querySelector('[onclick="window.openTopPanel(\'alerts\')"]');
    if (!bellIcon) return;
    const existingBadge = bellIcon.parentElement.querySelector('.notif-badge');
    if (existingBadge) existingBadge.remove();
    if (count && count > 0) {
        const badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.style.cssText = `position:absolute;top:-5px;right:-6px;background:var(--accent);color:white;border-radius:50%;font-size:9px;font-weight:800;width:17px;height:17px;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.25);`;
        badge.textContent = count > 9 ? '9+' : count;
        bellIcon.style.position = 'relative';
        bellIcon.parentElement.style.position = 'relative';
        bellIcon.insertAdjacentElement('afterend', badge);
    }
};

window.markNotifRead = async function(id) {
    if (!id) return;
    await sb.from('notifications').update({ is_read: true }).eq('id', id);
    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
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
