/**
 * ui-core.js — MPGS TaskFlow
 * ─────────────────────────────────────────────────────────────────────────────
 * Foundation layer: CSS styles, theme, toast, navigation helpers, sidebar utils.
 * Loaded first among ui-* files; all other ui-* files may call these safely.
 *
 * Functions: stripHtml, goToTask, goToMessage, applyTheme, showCenterToast,
 *            toggleTheme, openSecureFile, toggleRightSidebar, toggleLeftSidebar,
 *            initResizers, toggleDropdown, closeDropdowns, toggleTaskTrail,
 *            toggleDateFilter
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

// ─── THEME: 8-theme system (light, soft-slate, sky-breeze, warm-neutral, ───
// ─── ocean-teal, dark, sober-dark, midnight) — VER 2.0 ──────────────────────

window.THEME_LIST = [
    { id: 'light',        label: 'Light',    swatch: '#800020' },
    { id: 'soft-slate',   label: 'Slate',    swatch: '#64748b' },
    { id: 'sky-breeze',   label: 'Sky',      swatch: '#0ea5e9' },
    { id: 'warm-neutral', label: 'Warm',     swatch: '#b45309' },
    { id: 'ocean-teal',   label: 'Ocean',    swatch: '#0d9488' },
    { id: 'dark',         label: 'Dark',     swatch: '#2f81f7' },
    { id: 'sober-dark',   label: 'Sober',    swatch: '#5a5a5a' },
    { id: 'midnight',     label: 'Midnight', swatch: '#7c6df0' },
];

window.applyTheme = function() {
    // 'light' has no data-theme attribute (it's the :root default) — every
    // other theme sets data-theme to its own id.
    if (window.currentTheme === 'light') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', window.currentTheme);

    const icon = document.getElementById('themeToggleIcon');
    if (icon) icon.className = 'fa-solid fa-palette text-sm';

    // Populate / refresh the theme picker panel (if it exists in the DOM)
    const wrap = document.getElementById('themeToggleWrap');
    if (wrap) {
        wrap.innerHTML = window.THEME_LIST.map(t => `
            <button class="theme-pill ${window.currentTheme===t.id?'active':''}" onclick="window.setTheme('${t.id}')">
                <span class="swatch-dot" style="background:${t.swatch};"></span>${t.label}
            </button>`).join('');
    }
};

window.setTheme = function(themeId) {
    window.currentTheme = themeId;
    localStorage.setItem('theme', themeId);
    window.applyTheme();
    const label = (window.THEME_LIST.find(t => t.id === themeId) || {}).label || themeId;
    window.showCenterToast(`${label} theme activated`, 'fa-solid fa-palette');
    const panel = document.getElementById('themePanel');
    if (panel) panel.style.display = 'none';
};

window.toggleThemePanel = function() {
    const panel = document.getElementById('themePanel');
    if (!panel) return;
    const willOpen = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = willOpen ? 'block' : 'none';
    if (willOpen) window.applyTheme(); // refresh active-state highlighting
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

window.toggleDateFilter = function() {
    const val=document.getElementById('taskFilter')?.value;
    const dr=document.getElementById('dateRangeFilter');
    if(val==='date_range') dr?.classList.remove('hidden'); else dr?.classList.add('hidden');
    if(typeof window.loadTasksForPanel==='function') window.loadTasksForPanel();
};

// ─── LINK PILL MODAL ───────────────────────────────────────────────────────S
