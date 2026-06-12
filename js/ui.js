import { sb } from './shared.js';

// THEME STATES: 'light', 'dark', 'sober-dark'
window.currentTheme = localStorage.getItem('theme') || 'light';
window.currentRoom = localStorage.getItem('mpgs_current_room') || 'general';
window.pendingScrollId = null; 
window.pendingFileUpload = null;

window.applyTheme = function() {
    document.documentElement.setAttribute('data-theme', window.currentTheme);
    const themeIcon = document.getElementById('themeToggleIcon');
    if (themeIcon) {
        if (window.currentTheme === 'light') themeIcon.className = 'fa-solid fa-sun text-sm';
        else if (window.currentTheme === 'dark') themeIcon.className = 'fa-solid fa-moon text-sm';
        else themeIcon.className = 'fa-solid fa-cloud-moon text-sm';
    }
};

window.showCenterToast = function(msg, icon = 'fa-solid fa-check-circle', color = 'text-green-400') { 
    const t = document.createElement('div'); 
    t.className = 'center-toast opacity-0'; 
    t.innerHTML = `<i class="${icon} ${color}"></i> <span>${msg}</span>`; 
    document.body.appendChild(t); 
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000); 
};

window.toggleTheme = function() {
    if (window.currentTheme === 'light') window.currentTheme = 'dark';
    else if (window.currentTheme === 'dark') window.currentTheme = 'sober-dark';
    else window.currentTheme = 'light';
    
    localStorage.setItem('theme', window.currentTheme);
    window.applyTheme();
    
    let modeName = window.currentTheme === 'light' ? 'Light' : (window.currentTheme === 'dark' ? 'Original Dark' : 'Sober Dark');
    window.showCenterToast(`${modeName} mode activated`, 'fa-solid fa-palette');
};

window.openSecureFile = async function(path) {
    window.showCenterToast('Authenticating secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 86400);
    if (error) { window.showCenterToast('Access Denied: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
};

window.toggleRightSidebar = function() {
    const sb = document.getElementById('rightSidebar');
    if (!sb) return;
    const isHidden = window.getComputedStyle(sb).display === 'none';
    sb.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_right_sidebar_state', isHidden ? 'flex' : 'none');
};

window.toggleLeftSidebar = function() {
    const sb = document.getElementById('leftSidebar');
    if (!sb) return;
    const isHidden = window.getComputedStyle(sb).display === 'none';
    sb.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_left_sidebar_state', isHidden ? 'flex' : 'none');
};

window.initResizers = function() {
    let isResizingLeft = false, isResizingRight = false;
    const leftSidebar = document.getElementById('leftSidebar');
    const rightSidebar = document.getElementById('rightSidebar');
    
    document.getElementById('leftResizer')?.addEventListener('mousedown', () => { isResizingLeft = true; document.body.style.cursor = 'col-resize'; });
    document.getElementById('rightResizer')?.addEventListener('mousedown', () => { isResizingRight = true; document.body.style.cursor = 'col-resize'; });
    
    document.addEventListener('mousemove', (e) => {
        if(isResizingLeft && leftSidebar) {
            const newWidth = e.clientX;
            if(newWidth > 200 && newWidth < window.innerWidth * 0.5) {
                leftSidebar.style.width = newWidth + 'px';
                localStorage.setItem('mpgs_left_width', newWidth + 'px');
            }
        }
        if(isResizingRight && rightSidebar) {
            const newWidth = window.innerWidth - e.clientX;
            if(newWidth > 250 && newWidth < window.innerWidth * 0.5) {
                rightSidebar.style.width = newWidth + 'px';
                localStorage.setItem('mpgs_right_width', newWidth + 'px');
            }
        }
    });
    document.addEventListener('mouseup', () => { isResizingLeft = false; isResizingRight = false; document.body.style.cursor = 'default'; });
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.bubble-dropdown').forEach(d => {
        if (d.id !== id) d.classList.remove('open');
    });
    document.getElementById(id).classList.toggle('open');
};

window.closeDropdowns = function() {
    document.querySelectorAll('.bubble-dropdown').forEach(d => d.classList.remove('open'));
};

window.toggleTaskTrail = function(id) {
    let el = document.getElementById(id) || document.getElementById('trail-' + id) || document.getElementById('task-trail-' + id);
    if (!el) return;

    const isHidden = el.style.display === 'none' || el.classList.contains('hidden') || window.getComputedStyle(el).display === 'none';

    if (isHidden) {
        el.classList.remove('hidden');
        el.style.setProperty('display', 'block', 'important');
    } else {
        el.classList.add('hidden');
        el.style.setProperty('display', 'none', 'important');
    }
};
window.toggleTrail = window.toggleTaskTrail;

window.openTaskModal = async function(mid, text) { 
    window.currentMessageId = mid; 
    let tmp = document.createElement("DIV");
    tmp.innerHTML = text;
    window.currentMessageTextRaw = (tmp.textContent || tmp.innerText || "").substring(0,60) + "...";

    window.closeDropdowns();
    document.getElementById('taskModal').classList.remove('hidden'); 
    document.getElementById('taskModal').classList.add('flex'); 
    document.getElementById('taskTitle').value = (tmp.textContent || tmp.innerText || "").trim(); 
    
    const filteredUsers = window.globalUsersCache.filter(u => u.id !== window.currentUser.id);
    const list = document.getElementById('assigneeCheckboxList');
    list.innerHTML = filteredUsers.map(u => `
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 rounded-lg cursor-pointer transition-colors border border-transparent" style="hover:bg-color: var(--bg-body); hover:border-color: var(--border-color);">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-[var(--accent)] rounded">
            <span class="assignee-name font-semibold" style="color: var(--text-primary);">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</span>
        </label>
    `).join('');
    document.getElementById('assigneeSearch').value = '';
};

window.filterAssignees = function() {
    const term = document.getElementById('assigneeSearch').value.toLowerCase();
    document.querySelectorAll('.assignee-item').forEach(el => {
        const name = el.querySelector('.assignee-name').innerText.toLowerCase();
        el.style.display = name.includes(term) ? 'flex' : 'none';
    });
};

window.closeTaskModal = function() { document.getElementById('taskModal').classList.add('hidden'); document.getElementById('taskModal').classList.remove('flex'); };

window.showReminderModal = function(mid, text) { 
    window.currentReminderId = mid; 
    window.closeDropdowns();
    document.getElementById('reminderMessagePreview').innerText = text; 
    document.getElementById('reminderModal').classList.remove('hidden'); 
    document.getElementById('reminderModal').classList.add('flex'); 
};

window.closeReminderModal = function() { document.getElementById('reminderModal').classList.add('hidden'); document.getElementById('reminderModal').classList.remove('flex'); };

window.saveReminder = async function() { 
    const dt = document.getElementById('reminderDateTime').value; 
    if(!dt) return; 
    await sb.from('reminders').insert({ user_id: window.currentUser.id, message_id: window.currentReminderId, reminder_time: new Date(dt).toISOString(), triggered: false }); 
    window.showCenterToast('Reminder Set Successfully'); 
    window.closeReminderModal(); 
};

window.toggleDateFilter = function() {
    const val = document.getElementById('taskFilter').value;
    const dr = document.getElementById('dateRangeFilter');
    if (val === 'date_range') dr.classList.remove('hidden');
    else dr.classList.add('hidden');
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 w-80 max-h-96 overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.backgroundColor = 'var(--bg-sidebar)';
    panel.style.borderColor = 'var(--border-color)';

    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending').order('scheduled_time', {ascending: true});
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">No scheduled messages.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm flex justify-between items-center group/item transition-colors" style="background-color: var(--bg-body); border-color: var(--border-color);">
                <span class="truncate w-48" style="color: var(--text-primary);">${window.escapeHtml(d.message_text)}</span>
                <i class="fa-solid fa-times hover:text-red-500 cursor-pointer p-1" style="color: var(--text-secondary);" onclick="window.deleteScheduled('${d.id}')"></i>
            </div>`;
        });

    } else if (type === 'reminders') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-solid fa-stopwatch text-purple-500"></i> Reminders</h4>`;

        const {data: upcoming} = await sb.from('reminders')
            .select('*, messages(text)')
            .eq('user_id', window.currentUser.id)
            .eq('triggered', false)
            .order('reminder_time', {ascending: true});

        const {data: fired} = await sb.from('notifications')
            .select('*')
            .eq('user_id', window.currentUser.id)
            .eq('type', 'reminder')
            .order('created_at', {ascending: false})
            .limit(5);

        if (upcoming && upcoming.length > 0) {
            panel.innerHTML += `<div class="text-[9px] font-black tracking-widest uppercase mb-2" style="color: var(--text-secondary);">Upcoming</div>`;
            upcoming.forEach(d => {
                panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm flex justify-between items-center" style="background-color: var(--bg-body); border-color: var(--border-color);">
                    <div class="flex flex-col min-w-0 pr-2 cursor-pointer hover:opacity-80" onclick="window.scrollToAndHighlight('row-${d.message_id}')">
                        <span class="truncate w-48 font-medium" style="color: var(--text-primary);">${window.escapeHtml(d.messages?.text || 'Message...')}</span>
                        <span class="text-[9px]" style="color: var(--text-secondary);">${new Date(d.reminder_time).toLocaleString('en-IN')}</span>
                    </div>
                    <i class="fa-solid fa-times hover:text-red-500 cursor-pointer p-1 flex-shrink-0" style="color: var(--text-secondary);" onclick="window.deleteReminder('${d.id}')"></i>
                </div>`;
            });
        } else {
            panel.innerHTML += `<p class="text-xs italic text-center py-2" style="color: var(--text-secondary);">No upcoming reminders.</p>`;
        }

        if (fired && fired.length > 0) {
            panel.innerHTML += `<div class="text-[9px] font-black tracking-widest uppercase mt-3 mb-2" style="color: var(--text-secondary);">Fired ✓</div>`;
            fired.forEach(d => {
                panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm cursor-pointer hover:opacity-80"
                    style="background-color: var(--bg-body); border-color: var(--border-color); opacity: ${d.is_read ? '0.5' : '1'};"
                    onclick="window.markNotifRead('${d.id}'); window.scrollToAndHighlight('row-${d.message_id}')">
                    <span class="block font-medium" style="color: var(--text-primary);">${window.escapeHtml(d.message)}</span>
                    <span class="text-[9px]" style="color: var(--text-secondary);">${new Date(d.created_at).toLocaleString('en-IN')}</span>
                </div>`;
            });
        }

    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text)').eq('user_id', window.currentUser.id);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">No bookmarks found.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm cursor-pointer transition-colors group/item" style="background-color: var(--bg-body); border-color: var(--border-color);" onclick="window.scrollToAndHighlight('row-${d.message_id}')">
                <span class="truncate block" style="color: var(--text-primary);">${window.escapeHtml(d.messages?.text)}</span>
            </div>`;
        });

    } else if (type === 'alerts') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>`;
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(10);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">All caught up!</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm cursor-pointer transition-colors group/item" style="background-color: var(--bg-body); border-color: var(--border-color);" onclick="window.markNotifRead('${d.id}'); window.scrollToAndHighlight('row-${d.message_id}')">
                <span class="block font-medium" style="color: var(--text-primary);">${window.escapeHtml(d.message)}</span>
                <div class="text-[9px] mt-1" style="color: var(--text-secondary);">${window.getISTTime(d.created_at)}</div>
            </div>`;
        });
    }

    document.querySelector('.chat-area').appendChild(panel);
}; // ← END of openTopPanel

window.refreshNotificationBadge = async function() {
    const { count } = await sb
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', window.currentUser.id)
        .eq('is_read', false);

    const bellIcon = document.querySelector('[onclick="window.openTopPanel(\'alerts\')"]');
    if (!bellIcon) return;

    const existingBadge = bellIcon.parentElement.querySelector('.notif-badge');
    if (existingBadge) existingBadge.remove();

    if (count && count > 0) {
        const badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.style.cssText = `
            position: absolute;
            top: -4px;
            right: -4px;
            background: var(--accent);
            color: white;
            border-radius: 50%;
            font-size: 9px;
            font-weight: bold;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
        `;
        badge.textContent = count > 9 ? '9+' : count;
        bellIcon.style.position = 'relative';
        bellIcon.parentElement.style.position = 'relative';
        bellIcon.insertAdjacentElement('afterend', badge);
    }
};

window.markNotifRead = async function(id) {
    await sb.from('notifications').update({ is_read: true }).eq('id', id);
    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
};

window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Scheduled message cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
};

window.deleteReminder = async function(id) {
    await sb.from('reminders').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Reminder cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
};

window.showScheduleModal = function() {
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if(!txt) { window.showCenterToast('Type a message first.', 'fa-solid fa-exclamation-triangle', 'text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
};

window.closeScheduleModal = function() { document.getElementById('scheduleModal').classList.add('hidden'); document.getElementById('scheduleModal').classList.remove('flex'); };

window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if(!time) return;
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    await sb.from('scheduled_messages').insert({ sender_id: window.currentUser.id, room_id: window.currentRoom, message_text: txt, scheduled_time: new Date(time).toISOString(), status: 'pending' });
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled Successfully!');
};
