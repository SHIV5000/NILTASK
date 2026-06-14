/**
 * ui.js — MPGS TaskFlow v1.60.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Utility / UI layer — injected onto window.* so all other modules can call it.
 *
 * Blocks in this file:
 *  • CSS injection         — theme, pill, badge, file-card, rich-text styles
 *  • HTML stripping        — window.stripHtml
 *  • Navigation helpers    — goToTask, goToMessage (cross-room)
 *  • Theme                 — applyTheme, toggleTheme
 *  • Toast                 — showCenterToast
 *  • Top panels            — openTopPanel (scheduled / reminders / bookmarks / alerts)
 *  • Notification actions  — dismissNotif, clearAllNotifications, clearFiredReminders
 *  • Bell badge            — refreshNotificationBadge, markNotifRead, animateBell
 *  • Activity Feed         — openActivityFeed, closeActivityFeed, refreshActivityFeed
 *  • Dashboard             — openDashboard, loadDashboard, downloadDashboardPDF
 *  • Profile Settings      — openSettings, saveSettings, previewSettingsPhoto
 *  • Group Settings        — openGroupSettings, closeGroupSettings, saveGroupSettings
 *  • Link Pill             — openLinkModal, closeLinkModal, insertLinkPill
 *  • Modals (Task/Reminder/Schedule/Forward)
 *  • Filter/Sort helpers   — toggleDateFilter
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';

// v1.60.0 - IST fix, RT feed, beautify, settings, filter wrap, top labels, modern filters, scroll arrows, completed opacity, task scroll fix, READ tag, activity feed fix, clear fix, reactions fix, link pill, no rename modal

// ─── CSS ───────────────────────────────────────────────────────────────────
(function() {
    if (document.getElementById('mpgs-style')) return;
    const style = document.createElement('style');
    style.id = 'mpgs-style';
    style.textContent = `
        @keyframes bell-ring { 0%,100%{transform:rotate(0)} 10%,30%,50%,70%,90%{transform:rotate(-14deg)} 20%,40%,60%,80%{transform:rotate(14deg)} }
        .bell-ring { animation:bell-ring 0.5s ease infinite; color:var(--accent)!important; filter:drop-shadow(0 0 5px var(--accent)); }
        .bell-host { position:relative; display:inline-flex; align-items:center; }
        .notif-badge { position:absolute;top:-6px;right:-8px;background:var(--accent);color:#fff;border-radius:50%;font-size:9px;font-weight:800;width:17px;height:17px;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);z-index:20; }
        .link-pill { display:inline-flex;align-items:center;gap:4px;background:rgba(99,102,241,0.12);color:#4f46e5;border:1px solid rgba(99,102,241,0.3);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer; }
        .link-pill:hover { background:rgba(99,102,241,0.2); }
        .b-text a.link-pill { color:#4f46e5!important; }
        /* Modern task filter pills */
        .filter-pill { font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;border:1px solid var(--border-color);color:var(--text-secondary);background:var(--bg-body);cursor:pointer;white-space:nowrap;transition:all 0.18s;flex-shrink:0; }
        .filter-pill:hover { border-color:var(--accent);color:var(--accent); }
        .filter-pill.fp-active { background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 2px 8px rgba(var(--accent-rgb,99,102,241),0.3); }
        .sort-select-wrap { position:relative; }
        .sort-select-wrap i { position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:10px;pointer-events:none;color:var(--text-secondary); }
        .sort-select-wrap select { padding-left:26px;appearance:none;-webkit-appearance:none; }
        /* Scroll arrows */
        .chat-scroll-btn { position:absolute;right:14px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:10;border:1px solid var(--border-color);transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.12); }
        .chat-scroll-btn:hover { transform:scale(1.1); }
        /* Top bar icon labels */
        .topbar-icon-btn { display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;color:var(--text-secondary);transition:color 0.18s;padding:2px 6px;border-radius:8px; }
        .topbar-icon-btn:hover { color:var(--accent);background:rgba(var(--accent-rgb,99,102,241),0.08); }
        .topbar-icon-btn span { font-size:8px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap; }
        .topbar-icon-btn i { font-size:1.25rem; }
        /* File card in bubbles */
        .file-card { display:inline-flex;align-items:center;gap:10px;border-radius:12px;padding:8px 14px;cursor:pointer;margin:4px 0;max-width:280px;transition:opacity 0.2s; }
        .file-card:hover { opacity:0.8; }
        /* Rich text formatting in message bubbles (replaces ql-editor class without its scrollbar) */
        .b-text ol { list-style-type:decimal; padding-left:1.4em; margin:0; }
        .b-text ul { list-style-type:disc; padding-left:1.4em; margin:0; }
        .b-text li { margin-bottom:2px; }
        .b-text strong, .b-text b { font-weight:700; }
        .b-text em, .b-text i { font-style:italic; }
        .b-text u { text-decoration:underline; }
        .b-text s { text-decoration:line-through; }
        .b-text p { margin:0; }
        .b-text br { display:block; content:""; margin:2px 0; }
    `;
    document.head.appendChild(style);
})();

window.currentTheme  = localStorage.getItem('theme') || 'light';
window.currentRoom   = localStorage.getItem('mpgs_current_room') || 'general';
window.pendingScrollId   = null;
window.pendingFileUpload = null;

// ─── HELPERS ───────────────────────────────────────────────────────────────
// ─── UTILITY: Strip HTML tags → plain text ───────────────────────────────────
window.stripHtml = function(html) {
    if (!html) return '';
    const d = document.createElement('div'); d.innerHTML = html;
    return (d.textContent || d.innerText || '').trim();
};

// ─── SCROLL TO TASK CARD ───────────────────────────────────────────────────
// ─── NAVIGATION: Scroll right sidebar to a specific task card ────────────────
window.goToTask = async function(taskId, notifId) {
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
    if (notifId && notifId !== 'null' && notifId !== 'undefined') {
        window.markNotifRead(notifId);
        // Mark READ visually in DOM if notification item exists
        const notifEl = document.getElementById('notif-' + notifId) || document.getElementById('feed-notif-' + notifId);
        if (notifEl) {
            notifEl.style.opacity = '0.6';
            const readBadge = document.createElement('span');
            readBadge.style.cssText = 'font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;background:rgba(34,197,94,0.12);color:#16a34a;margin-left:4px;';
            readBadge.textContent = 'READ ✓';
            notifEl.querySelector('.flex')?.appendChild(readBadge);
        }
    }
    // Ensure right sidebar visible
    const rs = document.getElementById('rightSidebar');
    if (rs && window.getComputedStyle(rs).display === 'none') {
        rs.style.setProperty('display', 'flex', 'important');
        localStorage.setItem('mpgs_right_sidebar_state', 'flex');
    }
    // Close activity feed & restore tasks panel + filters
    const af = document.getElementById('activityFeedPanel');
    if (af) {
        af.remove();
        document.getElementById('rightSidebarFilters')?.style.removeProperty('display');
    }
    document.getElementById('tasksPanel')?.style.removeProperty('display');
    // Set filter to 'all' so the task card is definitely rendered
    const tf = document.getElementById('taskFilter');
    if (tf) tf.value = 'all';
    // Reload task panel fresh
    if (typeof window.loadTasksForPanel === 'function') await window.loadTasksForPanel();
    // Wait for DOM to fully paint
    await new Promise(r => setTimeout(r, 400));

    if (!taskId || taskId === 'null' || taskId === 'undefined') {
        // No task_id available (column not yet added) — just show tasks panel
        window.showCenterToast('Task Hub opened — find your task above', 'fa-solid fa-tasks', 'text-blue-400');
        document.getElementById('tasksPanel')?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const tasksContainer = document.getElementById('tasksPanel');
    const card = tasksContainer?.querySelector(`.jira-card[data-task-id="${taskId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.transition = 'box-shadow 0.4s ease';
        card.style.boxShadow = '0 0 0 3px var(--accent), 0 4px 20px rgba(0,0,0,0.15)';
        setTimeout(() => { card.style.boxShadow = ''; card.style.transition = ''; }, 2500);
    } else {
        window.showCenterToast('Task not found — may be filtered out', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
    }
};

// ─── CROSS-ROOM SCROLL (THE FIX: always fetch room_id from DB if unknown) ──
// ─── NAVIGATION: Cross-room scroll to any message (fetches room_id if unknown) ─
window.goToMessage = async function(messageId, notifId, roomId) {
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
    if (notifId && notifId !== 'null' && notifId !== 'undefined') window.markNotifRead(notifId);

    if (!messageId || messageId === 'null' || messageId === 'undefined') {
        window.showCenterToast('No message linked to this notification', 'fa-solid fa-info-circle', 'text-yellow-400');
        return;
    }

    // Step 1: resolve the room. If roomId is unknown, look it up in the DB.
    let targetRoom = (roomId && roomId !== 'null' && roomId !== 'undefined' && roomId !== 'null') ? roomId : null;
    if (!targetRoom) {
        const { data: msgRow } = await sb.from('messages').select('room_id').eq('id', messageId).single();
        targetRoom = msgRow?.room_id || null;
    }

    // Step 2: set pendingScrollId so loadMessages() handles highlight after render
    window.pendingScrollId = messageId;

    if (targetRoom && targetRoom !== window.currentRoom) {
        // Switch room first, then loadMessages will scroll via pendingScrollId
        window.currentRoom = targetRoom;
        localStorage.setItem('mpgs_current_room', targetRoom);
        const titleSpan = document.getElementById('roomTitleDisplay');
        let displayName = targetRoom.charAt(0).toUpperCase() + targetRoom.slice(1);
        if (targetRoom.startsWith('dm_')) {
            const withoutPrefix = targetRoom.replace('dm_', '');
            const otherUser = window.globalUsersCache?.find(u => u.id !== window.currentUser?.id && withoutPrefix.includes(u.id));
            displayName = otherUser
                ? (window.toSentenceCase?.(otherUser.full_name || otherUser.email?.split('@')[0]) || 'Direct Message')
                : 'Direct Message';
        }
        if (titleSpan) titleSpan.innerText = displayName;
        if (typeof window.loadChatsList === 'function') window.loadChatsList();
        // loadMessages will fire pendingScrollId scroll after 100ms timeout
        if (typeof window.loadMessages === 'function') window.loadMessages();
    } else {
        // Same room — try immediate scroll
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
            // Message not rendered yet — reload messages then scroll
            if (typeof window.loadMessages === 'function') window.loadMessages();
        }
    }
};

// ─── THEME: Apply light / dark / sober-dark theme to document root ───────────
window.applyTheme = function() {
    document.documentElement.setAttribute('data-theme', window.currentTheme);
    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.className = `fa-solid ${window.currentTheme==='light'?'fa-sun':window.currentTheme==='dark'?'fa-moon':'fa-cloud-moon'} text-sm`;
};

// ─── TOAST: Show a temporary centred notification toast ───────────────────────
window.showCenterToast = function(msg, icon='fa-solid fa-check-circle', color='text-green-400') {
    document.querySelectorAll('.center-toast').forEach(t => t.remove());
    const cleanMsg = window.stripHtml(msg);
    const t = document.createElement('div');
    t.className = 'center-toast opacity-0';
    t.style.cssText = 'max-width:360px;padding:10px 18px;border-radius:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;box-shadow:0 4px 24px rgba(0,0,0,0.18);word-break:break-word;';
    t.innerHTML = `<i class="${icon} ${color}" style="font-size:15px;flex-shrink:0;"></i><span>${window.escapeHtml?window.escapeHtml(cleanMsg):cleanMsg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),500); }, 4000);
};

window.toggleTheme = function() {
    if (window.currentTheme==='light') window.currentTheme='dark';
    else if (window.currentTheme==='dark') window.currentTheme='sober-dark';
    else window.currentTheme='light';
    localStorage.setItem('theme', window.currentTheme);
    window.applyTheme();
    window.showCenterToast(`${window.currentTheme==='light'?'Light':window.currentTheme==='dark'?'Original Dark':'Sober Dark'} mode activated`,'fa-solid fa-palette');
};

window.openSecureFile = async function(path) {
    window.showCenterToast('Authenticating...','fa-solid fa-spinner fa-spin','text-blue-500');
    const {data,error} = await sb.storage.from('task-proofs').createSignedUrl(path,86400);
    if (error) { window.showCenterToast('Access Denied: '+error.message,'fa-solid fa-times','text-red-500'); return; }
    if (data?.signedUrl) window.open(data.signedUrl,'_blank');
};

window.toggleRightSidebar = function() {
    const el = document.getElementById('rightSidebar'); if(!el) return;
    const hidden = window.getComputedStyle(el).display==='none';
    el.style.setProperty('display',hidden?'flex':'none','important');
    localStorage.setItem('mpgs_right_sidebar_state',hidden?'flex':'none');
};
window.toggleLeftSidebar = function() {
    const el = document.getElementById('leftSidebar'); if(!el) return;
    const hidden = window.getComputedStyle(el).display==='none';
    el.style.setProperty('display',hidden?'flex':'none','important');
    localStorage.setItem('mpgs_left_sidebar_state',hidden?'flex':'none');
};

window.initResizers = function() {
    let rL=false,rR=false;
    const L=document.getElementById('leftSidebar'),R=document.getElementById('rightSidebar');
    document.getElementById('leftResizer')?.addEventListener('mousedown',()=>{rL=true;document.body.style.cursor='col-resize';});
    document.getElementById('rightResizer')?.addEventListener('mousedown',()=>{rR=true;document.body.style.cursor='col-resize';});
    document.addEventListener('mousemove',e=>{
        if(rL&&L){const w=e.clientX;if(w>200&&w<window.innerWidth*0.5){L.style.width=w+'px';localStorage.setItem('mpgs_left_width',w+'px');}}
        if(rR&&R){const w=window.innerWidth-e.clientX;if(w>250&&w<window.innerWidth*0.5){R.style.width=w+'px';localStorage.setItem('mpgs_right_width',w+'px');}}
    });
    document.addEventListener('mouseup',()=>{rL=false;rR=false;document.body.style.cursor='default';});
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.bubble-dropdown').forEach(d=>{if(d.id!==id)d.classList.remove('open');});
    document.getElementById(id)?.classList.toggle('open');
};
window.closeDropdowns = function() { document.querySelectorAll('.bubble-dropdown').forEach(d=>d.classList.remove('open')); };

window.toggleTaskTrail = function(id) {
    const el=document.getElementById(id)||document.getElementById('trail-'+id)||document.getElementById('task-trail-'+id);
    if(!el) return;
    const hidden=el.style.display==='none'||el.classList.contains('hidden')||window.getComputedStyle(el).display==='none';
    if(hidden){el.classList.remove('hidden');el.style.setProperty('display','block','important');}
    else{el.classList.add('hidden');el.style.setProperty('display','none','important');}
};
window.toggleTrail = window.toggleTaskTrail;

window.openTaskModal = async function(mid, text) {
    window.currentMessageId = mid;
    const tmp=document.createElement('DIV'); tmp.innerHTML=text;
    window.currentMessageTextRaw=(tmp.textContent||tmp.innerText||'').substring(0,60)+'...';
    window.closeDropdowns();
    document.getElementById('taskModal').classList.remove('hidden');
    document.getElementById('taskModal').classList.add('flex');
    document.getElementById('taskTitle').value=(tmp.textContent||tmp.innerText||'').trim();
    const list=document.getElementById('assigneeCheckboxList');
    list.innerHTML=window.globalUsersCache.filter(u=>u.id!==window.currentUser.id).map(u=>`
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 rounded-lg cursor-pointer transition-colors border border-transparent">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-[var(--accent)] rounded">
            <span class="assignee-name font-semibold" style="color:var(--text-primary);">${window.escapeHtml(window.toSentenceCase(u.full_name||u.email.split('@')[0]))}</span>
        </label>`).join('');
    document.getElementById('assigneeSearch').value='';
};
window.filterAssignees = function() {
    const term=document.getElementById('assigneeSearch').value.toLowerCase();
    document.querySelectorAll('.assignee-item').forEach(el=>{
        el.style.display=el.querySelector('.assignee-name').innerText.toLowerCase().includes(term)?'flex':'none';
    });
};
window.closeTaskModal = function() { document.getElementById('taskModal').classList.add('hidden'); document.getElementById('taskModal').classList.remove('flex'); };

window.showReminderModal = function(mid, text) {
    window.currentReminderId=mid; window.closeDropdowns();
    document.getElementById('reminderMessagePreview').innerText=window.stripHtml(text);
    document.getElementById('reminderModal').classList.remove('hidden');
    document.getElementById('reminderModal').classList.add('flex');
};
window.closeReminderModal = function() { document.getElementById('reminderModal').classList.add('hidden'); document.getElementById('reminderModal').classList.remove('flex'); };

window.saveReminder = async function() {
    const dt=document.getElementById('reminderDateTime').value; if(!dt) return;
    await sb.from('reminders').insert({user_id:window.currentUser.id,message_id:window.currentReminderId,reminder_time:new Date(dt).toISOString(),triggered:false});
    window.showCenterToast('Reminder Set Successfully ⏰');
    window.closeReminderModal();
};

window.toggleDateFilter = function() {
    const val=document.getElementById('taskFilter')?.value;
    const dr=document.getElementById('dateRangeFilter');
    if(val==='date_range') dr?.classList.remove('hidden'); else dr?.classList.add('hidden');
    if(typeof window.loadTasksForPanel==='function') window.loadTasksForPanel();
};

// ─── LINK PILL MODAL ───────────────────────────────────────────────────────
window.openLinkModal = function(editorId) {
    window._linkTargetEditor = editorId || 'main'; // 'main' or taskId
    const modal = document.getElementById('linkPillModal');
    if (modal) {
        document.getElementById('linkPillName').value = '';
        document.getElementById('linkPillUrl').value = '';
        modal.classList.remove('hidden'); modal.classList.add('flex');
    }
};
window.closeLinkModal = function() {
    const modal = document.getElementById('linkPillModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window.insertLinkPill = function() {
    const name = document.getElementById('linkPillName').value.trim();
    const url  = document.getElementById('linkPillUrl').value.trim();
    if (!name || !url) { window.showCenterToast('Both name and URL are required','fa-solid fa-times','text-red-500'); return; }
    if (window.quillEditor && window._linkTargetEditor === 'main') {
        window.quillEditor.focus();
        const range = window.quillEditor.getSelection() || { index: window.quillEditor.getLength() - 1, length: 0 };
        // Store as Quill native link: display name visible, URL encoded in href
        // renderMessages transforms https://link-pill.local/... into a styled button
        const encoded = encodeURIComponent(name + '|||' + url);
        const pillUrl = `https://link-pill.local/${encoded}`;
        window.quillEditor.insertText(range.index, name, 'link', pillUrl);
        window.quillEditor.insertText(range.index + name.length, ' '); // space after pill
        window.quillEditor.setSelection(range.index + name.length + 1);
    }
    window.closeLinkModal();
};

// ─── TOP PANELS ────────────────────────────────────────────────────────────
// ─── PANELS: Open a top-bar dropdown panel (scheduled/reminders/bookmarks/alerts)
window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    const panel=document.createElement('div');
    panel.className='top-panel-dropdown right-10 top-16 max-h-[500px] overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.cssText='background-color:var(--bg-sidebar);border-color:var(--border-color);width:340px;';

    // ── SCHEDULED ──────────────────────────────────────────────────────────
    if (type==='scheduled') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data}=await sb.from('scheduled_messages').select('*').eq('sender_id',window.currentUser.id).eq('status','pending').order('scheduled_time',{ascending:true});
        if(!data?.length){panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No scheduled messages.</p>`;}
        else data.forEach(d=>{
            const txt=window.stripHtml(d.message_text);
            const t=new Date(d.scheduled_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                    <i class="fa-regular fa-clock mt-0.5 flex-shrink-0" style="color:var(--accent);font-size:13px;"></i>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-semibold truncate" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,80))}</p>
                        <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(59,130,246,0.12);color:#3b82f6;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                    </div>
                </div>
                <div class="border-t flex" style="border-color:var(--border-color);">
                    <button onclick="window.deleteScheduled('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                </div>
            </div>`;
        });

    // ── REMINDERS ──────────────────────────────────────────────────────────
    } else if (type==='reminders') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-solid fa-stopwatch text-purple-500"></i> Reminders</h4>`;
        const {data:upcoming}=await sb.from('reminders').select('*, messages(text, room_id)').eq('user_id',window.currentUser.id).eq('triggered',false).order('reminder_time',{ascending:true});
        const {data:fired}=await sb.from('notifications').select('*').eq('user_id',window.currentUser.id).eq('type','reminder').order('created_at',{ascending:false}).limit(10);

        if(upcoming?.length){
            panel.innerHTML+=`<div class="text-[9px] font-black tracking-widest uppercase mb-2" style="color:var(--text-secondary);">⏳ Upcoming</div>`;
            upcoming.forEach(d=>{
                const txt=window.stripHtml(d.messages?.text||'Message...');
                const t=new Date(d.reminder_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const overdue=new Date(d.reminder_time)<new Date();
                const roomId=d.messages?.room_id||null;
                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-stopwatch mt-0.5 flex-shrink-0" style="color:#a855f7;font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${overdue?'rgba(239,68,68,0.12)':'rgba(168,85,247,0.12)'};color:${overdue?'#ef4444':'#a855f7'};"><i class="fa-solid fa-bell" style="font-size:9px;"></i> ${t}${overdue?' · Overdue':''}</span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.goToMessage('${d.message_id}',null,'${roomId}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:opacity-70 border-r" style="color:var(--accent);border-color:var(--border-color);"><i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Go to message</button>
                        <button onclick="window.deleteReminder('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                    </div>
                </div>`;
            });
        } else {
            panel.innerHTML+=`<p class="text-xs italic text-center py-3" style="color:var(--text-secondary);">No upcoming reminders.</p>`;
        }

        if(fired?.length){
            panel.innerHTML+=`<div class="flex items-center justify-between mt-4 mb-2">
                <div class="text-[9px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">✅ Fired</div>
                <button onclick="window.clearFiredReminders()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg transition-colors" style="color:var(--text-secondary);">Clear all</button>
            </div>`;
            fired.forEach(d=>{
                const msg=window.stripHtml(d.message);
                const t=new Date(d.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" id="fired-${d.id}" style="border-color:var(--border-color);opacity:${d.is_read?'0.5':'1'};">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-check-circle mt-0.5 flex-shrink-0" style="color:#22c55e;font-size:13px;"></i>
                        <div class="min-w-0 flex-1 cursor-pointer hover:opacity-80" onclick="window.goToMessage('${d.message_id}','${d.id}')">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(34,197,94,0.12);color:#16a34a;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                        </div>
                        <button onclick="window.dismissFired('${d.id}')" class="flex-shrink-0 ml-1 p-1.5 rounded hover:bg-red-50 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:11px;"></i></button>
                    </div>
                </div>`;
            });
        }

    // ── BOOKMARKS ──────────────────────────────────────────────────────────
    } else if (type==='bookmarks') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data}=await sb.from('bookmarks').select('*, messages(text, room_id)').eq('user_id',window.currentUser.id);
        if(!data?.length){panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No bookmarks yet.</p>`;}
        else data.forEach(d=>{
            const txt=window.stripHtml(d.messages?.text||'');
            const roomId=d.messages?.room_id||null;
            panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}',null,'${roomId}')">
                    <i class="fa-solid fa-bookmark mt-0.5 flex-shrink-0" style="color:#f97316;font-size:13px;"></i>
                    <p class="text-xs font-medium line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,120))}</p>
                </div>
            </div>`;
        });

    // ── ALERTS ─────────────────────────────────────────────────────────────
    } else if (type==='alerts') {
        const {data}=await sb.from('notifications').select('*').eq('user_id',window.currentUser.id).order('created_at',{ascending:false}).limit(20);

        // Batch-fetch message info (sender + room) for all notifications that have message_id
        const msgIds=(data||[]).filter(d=>d.message_id).map(d=>d.message_id);
        let msgInfoMap=new Map();
        if(msgIds.length){
            const {data:relMsgs}=await sb.from('messages').select('id,room_id,sender_id,profiles(full_name,email)').in('id',msgIds);
            relMsgs?.forEach(m=>msgInfoMap.set(m.id,m));
        }

        panel.innerHTML=`<div class="flex items-center justify-between border-b pb-3 mb-3" style="border-color:var(--border-color);">
            <h4 class="font-bold flex items-center gap-2" style="color:var(--text-primary);"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>
            ${data?.length?`<button onclick="window.clearAllNotifications()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg transition-colors" style="color:var(--text-secondary);">Clear all</button>`:''}
        </div>`;

        if(!data?.length){
            panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">All caught up! 🎉</p>`;
        } else {
            // Mark all unread as read silently
            const unreadIds=data.filter(d=>!d.is_read).map(d=>d.id);
            if(unreadIds.length) sb.from('notifications').update({is_read:true}).in('id',unreadIds).then(()=>// ─── BADGE: Refresh unread count on the bell icon ─────────────────────────────
window.refreshNotificationBadge?.());

            const iconMap={reminder:'fa-stopwatch',task:'fa-clipboard-check',message:'fa-comment',general:'fa-bell'};
            const colorMap={reminder:'#a855f7',task:'#3b82f6',message:'#22c55e',general:'#f59e0b'};

            data.forEach(d=>{
                const msg=window.stripHtml(d.message);
                const t=new Date(d.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const tp=d.type||'general';
                const ic=iconMap[tp]||'fa-bell', co=colorMap[tp]||'#f59e0b';

                // Resolve sender + room from batch-fetched message data
                const relMsg=msgInfoMap.get(d.message_id);
                const senderName=relMsg?.profiles
                    ? (window.toSentenceCase?.(relMsg.profiles.full_name||relMsg.profiles.email?.split('@')[0])||'')
                    : '';
                const roomLabel=relMsg?.room_id
                    ? (relMsg.room_id.startsWith('dm_') ? '💬 DM' : `# ${relMsg.room_id}`)
                    : '';

                const clickFn = tp==='task'
                    ? `window.goToTask('${d.task_id||''}','${d.id}')`
                    : `window.goToMessage('${d.message_id}','${d.id}')`;

                // Unread = full opacity, Read = 60%
                const opacity = d.is_read ? '0.6' : '1';
                const unreadDot = !d.is_read
                    ? `<span class="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style="background:${co};"></span>`
                    : '';

                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" id="notif-${d.id}" style="border-color:var(--border-color);opacity:${opacity};">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);"
                        onclick="${clickFn}; (function(n){if(n)n.style.opacity='0.6';})(document.getElementById('notif-${d.id}'));">
                        ${unreadDot}
                        <i class="fa-solid ${ic} mt-0.5 flex-shrink-0" style="color:${co};font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap mb-1">
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase" style="background:${co}18;color:${co};">${tp}</span>
                                ${senderName?`<span class="text-[9px] font-bold" style="color:var(--text-primary);">${window.escapeHtml(senderName)}</span>`:''}
                                ${roomLabel?`<span class="text-[9px] font-semibold" style="color:var(--text-secondary);">${window.escapeHtml(roomLabel)}</span>`:''}
                                <span class="text-[9px] ml-auto flex-shrink-0 whitespace-nowrap" style="color:var(--text-secondary);">${t}</span>
                            </div>
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,120))}</p>
                        </div>
                        <button onclick="event.stopPropagation();window.dismissNotif('${d.id}')" class="flex-shrink-0 ml-1 p-1.5 rounded hover:bg-red-50 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:10px;"></i></button>
                    </div>
                    ${!d.is_read?`<div class="px-2.5 pb-1.5"><span style="font-size:9px;font-weight:700;color:#16a34a;background:rgba(34,197,94,0.1);border-radius:8px;padding:1px 6px;">NEW</span></div>`:'<div class="px-2.5 pb-1.5"><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">READ ✓</span></div>'}
                </div>`;
            });
        }
    }
    document.querySelector('.chat-area').appendChild(panel);
};

// ─── NOTIFICATION HELPERS ──────────────────────────────────────────────────
window.dismissNotif = async function(id) {
    document.getElementById('notif-'+id)?.remove();
    await sb.from('notifications').delete().eq('id',id);
    window.refreshNotificationBadge?.();
};
window.dismissFired = async function(id) {
    document.getElementById('fired-'+id)?.remove();
    await sb.from('notifications').delete().eq('id',id);
    window.refreshNotificationBadge?.();
};
window.deleteNotification = window.dismissNotif;

window.clearAllNotifications = async function() {
    // Delete in DB then refresh — Supabase v2 delete returns {error} only
    const { error } = await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    if (error) {
        window.showCenterToast('Clear failed — check RLS policy: notifications DELETE', 'fa-solid fa-lock', 'text-red-500');
        console.error('clearAll error:', error);
        return;
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('All notifications cleared.','fa-solid fa-check-circle','text-green-400');
};

window.clearFiredReminders = async function() {
    const { error } = await sb.from('notifications').delete()
        .eq('user_id', window.currentUser.id).eq('type', 'reminder');
    if (error) {
        window.showCenterToast('Clear failed — check RLS policy','fa-solid fa-lock','text-red-500');
        console.error('clearFired error:', error);
        return;
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('Fired reminders cleared.','fa-solid fa-check-circle','text-green-400');
};

// ─── BADGE ─────────────────────────────────────────────────────────────────
window.refreshNotificationBadge = async function() {
    const {count}=await sb.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',window.currentUser.id).eq('is_read',false);
    const bellEl=document.querySelector('i.ti-bell'); if(!bellEl) return;
    let host=bellEl.closest('.bell-host');
    if(!host){host=document.createElement('span');host.className='bell-host';bellEl.parentNode.insertBefore(host,bellEl);host.appendChild(bellEl);}
    host.querySelector('.notif-badge')?.remove();
    if(count&&count>0){const b=document.createElement('span');b.className='notif-badge';b.textContent=count>9?'9+':count;host.appendChild(b);}
};

window.markNotifRead = async function(id) {
    if(!id||id==='null'||id==='undefined') return;
    await sb.from('notifications').update({is_read:true}).eq('id',id);
    window.refreshNotificationBadge?.();
};

window.deleteReminder = async function(id) {
    await sb.from('reminders').delete().eq('id',id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.showCenterToast('Reminder cancelled.','fa-solid fa-info-circle','text-yellow-400');
};
window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id',id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.showCenterToast('Scheduled message cancelled.','fa-solid fa-info-circle','text-yellow-400');
};

// ─── BELL ANIMATION ────────────────────────────────────────────────────────
window.animateBell = function() {
    const bellEl=document.querySelector('i.ti-bell'); if(!bellEl) return;
    bellEl.classList.add('bell-ring');
    const stop=()=>bellEl.classList.remove('bell-ring');
    bellEl.closest('.bell-host')?.addEventListener('click',stop,{once:true});
    bellEl.addEventListener('click',stop,{once:true});
};

// ─── ACTIVITY FEED (right sidebar, task-hub size) ──────────────────────────
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
window.openSettings = async function() {
    const modal = document.getElementById('settingsModal'); if (!modal) return;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', window.currentUser.id).single();
    document.getElementById('settingsName').value = profile?.full_name || window.currentUser?.user_metadata?.full_name || '';
    document.getElementById('settingsEmail').value = window.currentUser?.email || '';
    const photoEl = document.getElementById('settingsPhotoPreview');
    const placeholderEl = document.getElementById('settingsPhotoPlaceholder');
    // Check localStorage fallback for avatar (works even if storage bucket is private)
    const localAvatar = localStorage.getItem('mpgs_avatar_' + window.currentUser.id);
    const avatarUrl = localAvatar || profile?.avatar_url || window._userAvatarUrl || null;
    if (avatarUrl) {
        window._userAvatarUrl = avatarUrl;
        photoEl.src = avatarUrl; photoEl.style.display = 'block';
        if (placeholderEl) placeholderEl.style.display = 'none';
    } else {
        photoEl.style.display = 'none';
        if (placeholderEl) placeholderEl.style.display = 'flex';
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeSettings = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window.previewSettingsPhoto = function(input) {
    const file = input.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { window.showCenterToast('Photo must be under 2MB','fa-solid fa-ban','text-red-500'); input.value=''; return; }
    const reader = new FileReader();
    reader.onload = e => {
        const prev = document.getElementById('settingsPhotoPreview');
        prev.src = e.target.result; prev.style.display = 'block';
    };
    reader.readAsDataURL(file);
};
// ─── PROFILE SETTINGS: Save display name and profile photo ───────────────────
// ─── PROFILE SETTINGS SAVE ────────────────────────────────────────────────────
// Updates display name + profile photo. Stores photo as base64 in localStorage
// as fallback since storage bucket permissions may vary.
window.saveSettings = async function() {
    // Validate name
    const name = document.getElementById('settingsName')?.value.trim();
    if (!name) { window.showCenterToast('Name cannot be empty','fa-solid fa-times','text-red-500'); return; }

    const photoInput = document.getElementById('settingsPhotoInput');
    let avatarDataUrl = window._userAvatarUrl || localStorage.getItem('mpgs_avatar_' + window.currentUser.id) || null;

    // Encode new photo as base64 — works without any storage bucket permissions
    if (photoInput?.files?.[0]) {
        const file = photoInput.files[0];
        avatarDataUrl = await new Promise(resolve => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.readAsDataURL(file);
        });
        localStorage.setItem('mpgs_avatar_' + window.currentUser.id, avatarDataUrl);
    }

    // Update Supabase auth metadata — also refreshes window.currentUser
    await sb.auth.updateUser({ data: { full_name: name } });
    try { const { data: { user } } = await sb.auth.getUser(); if (user) window.currentUser = user; } catch(e) {}

    // Update profiles table (name always; avatar_url only if column exists)
    try { await sb.from('profiles').update({ full_name: name }).eq('id', window.currentUser.id); } catch(e) {}
    try { if (avatarDataUrl) await sb.from('profiles').update({ full_name: name, avatar_url: avatarDataUrl }).eq('id', window.currentUser.id); } catch(e) {}

    // Update sidebar DOM immediately — no page reload needed
    window._userAvatarUrl = avatarDataUrl;
    const av = document.getElementById('sidebarAvatar');
    if (av) {
        av.innerHTML = avatarDataUrl
            ? `<img src="${avatarDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : name.charAt(0).toUpperCase();
    }
    // Update the name in the sidebar pill (stable ID selector)
    const nameEl = document.getElementById('sidebarNameDisplay');
    if (nameEl) nameEl.textContent = name.toUpperCase();

    window.showCenterToast('Profile saved ✓','fa-solid fa-check-circle','text-green-400');
    window.closeSettings();
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
}


window.saveGroupSettings = function() {
    // Read from correct element IDs that match the modal HTML
    const gid  = document.getElementById('groupSettingsId')?.value;
    const name = document.getElementById('groupSettingsName')?.value.trim();
    if (!gid || !name) { window.showCenterToast('Name cannot be empty','fa-solid fa-times','text-red-500'); return; }

    // Save name + colour — USE SAME KEY PREFIX as openGroupSettings: dept_name_, dept_color_
    localStorage.setItem('dept_name_'  + gid, name);
    if (window._selectedGroupColor) localStorage.setItem('dept_color_' + gid, window._selectedGroupColor);

    // Save member + admin selections from checkboxes
    const memberIds = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => cb.dataset.uid);
    const adminIds  = Array.from(document.querySelectorAll('.group-admin-cb:checked')).map(cb => cb.dataset.uid);
    localStorage.setItem('dept_members_' + gid, JSON.stringify(memberIds));
    localStorage.setItem('dept_admins_'  + gid, JSON.stringify(adminIds));

    // Update room title if currently in this group
    if (window.currentRoom === gid) {
        const t = document.getElementById('roomTitleDisplay');
        if (t) t.innerText = name;
    }
    window.closeGroupSettings();
    window.showCenterToast('Group settings saved ✓','fa-solid fa-check-circle','text-green-400');
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
}




// ─── SCHEDULE MODAL ────────────────────────────────────────────────────────────
// Shows the schedule modal after validating the message editor has content
window.showScheduleModal = function() {
    if (!window.quillEditor) return;
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if (!txt) { window.showCenterToast('Type a message first.','fa-solid fa-exclamation-triangle','text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
};
window.closeScheduleModal = function() {
    document.getElementById('scheduleModal').classList.add('hidden');
    document.getElementById('scheduleModal').classList.remove('flex');
};
window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if (!time) { window.showCenterToast('Please pick a date/time','fa-solid fa-times','text-red-500'); return; }
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    const { error } = await sb.from('scheduled_messages').insert({
        sender_id: window.currentUser.id,
        room_id: window.currentRoom,
        message_text: txt,
        scheduled_time: new Date(time).toISOString(),
        status: 'pending'
    });
    if (error) { window.showCenterToast('Failed: ' + error.message,'fa-solid fa-times','text-red-500'); return; }
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled ✓ 🕐','fa-solid fa-check-circle','text-green-400');
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
// Opens the personal stats dashboard modal and loads today's stats by default
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
window.openGroupSettings = async function(groupId) {
    const gid = groupId || window.currentRoom;
    if (!gid || gid.startsWith('dm_')) return;

    const modal = document.getElementById('groupSettingsModal');
    if (!modal) { window.showCenterToast('Group Settings modal not found','fa-solid fa-info-circle','text-yellow-400'); return; }

    // Defaults per department
    const deptDefaults = { general:'General', math:'Math', science:'Science', leadership:'Leadership' };
    const deptColors   = { general:'#6366f1', math:'#0ea5e9', science:'#10b981', leadership:'#f59e0b' };
    const currentName  = localStorage.getItem('dept_name_'  + gid) || deptDefaults[gid] || gid.charAt(0).toUpperCase() + gid.slice(1);
    const currentColor = localStorage.getItem('dept_color_' + gid) || deptColors[gid] || '#6366f1';

    // Pre-fill form fields
    const idEl   = document.getElementById('groupSettingsId');
    const nameEl = document.getElementById('groupSettingsName');
    if (idEl)   idEl.value   = gid;
    if (nameEl) nameEl.value = currentName;

    window._selectedGroupColor = currentColor;
    document.querySelectorAll('#groupColorPicker button').forEach(b => {
        const active = b.dataset.color === currentColor;
        b.style.borderColor = active ? '#fff' : 'transparent';
        b.style.boxShadow   = active ? '0 0 0 2px ' + currentColor : 'none';
        b.style.transform   = active ? 'scale(1.2)' : 'scale(1)';
    });

    // Populate members list — fetch from Supabase if cache empty
    const memberList = document.getElementById('groupMembersList');
    if (memberList) {
        let users = window.globalUsersCache || [];
        if (!users.length) {
            try {
                const { data } = await sb.from('profiles').select('id, full_name, email');
                users = data || [];
                if (users.length) window.globalUsersCache = users;
            } catch(e) {}
        }
        const savedMembers = JSON.parse(localStorage.getItem('dept_members_' + gid) || '[]');
        const savedAdmins  = JSON.parse(localStorage.getItem('dept_admins_'  + gid) || '[]');
        if (users.length) {
            memberList.innerHTML = users.map(u => {
                const uname    = window.toSentenceCase?.(u.full_name || u.email?.split('@')[0]) || (u.email || '?');
                const isMember = savedMembers.length === 0 || savedMembers.includes(u.id);
                const isAdmin  = savedAdmins.includes(u.id);
                const isMe     = u.id === window.currentUser?.id;
                return `<div class="flex items-center gap-2 p-2 text-xs border-b last:border-b-0" style="border-color:var(--border-color);">
                    <div class="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0" style="background:var(--accent);">${uname.charAt(0).toUpperCase()}</div>
                    <span class="font-semibold flex-1 truncate" style="color:var(--text-primary);">${window.escapeHtml(uname)}${isMe ? ' <span style="color:#6366f1;font-size:9px;">(You)</span>' : ''}</span>
                    <label class="flex items-center gap-1 cursor-pointer" style="color:var(--text-secondary);">
                        <input type="checkbox" class="group-member-cb" data-uid="${u.id}" ${isMember ? 'checked' : ''}>
                        <span class="text-[9px] font-bold">Member</span>
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer" style="color:#f59e0b;">
                        <input type="checkbox" class="group-admin-cb" data-uid="${u.id}" ${isAdmin ? 'checked' : ''}>
                        <span class="text-[9px] font-bold">Admin</span>
                    </label>
                </div>`;
            }).join('');
        } else {
            memberList.innerHTML = '<p class="text-xs p-3 italic" style="color:var(--text-secondary);">No members found.</p>';
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeGroupSettings = function() {
    const modal = document.getElementById('groupSettingsModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// Highlight selected colour swatch
window.selectGroupColor = function(color) {
    window._selectedGroupColor = color;
    document.querySelectorAll('#groupColorPicker button').forEach(b => {
        const active = b.dataset.color === color;
        b.style.borderColor = active ? '#fff' : 'transparent';
        b.style.boxShadow   = active ? '0 0 0 2px ' + color : 'none';
        b.style.transform   = active ? 'scale(1.2)' : 'scale(1)';
    });
};
