import { sb } from './shared.js';
import logger from './utils/logger.js';

// v1.51.0 - Departments/Staff sidebar, unread badges, search fix, cross-room scroll

// ─── TENANT-NAMESPACED localStorage HELPERS ───────────────────────────────────
function _webLsKey(k) { return (window.currentTenantId ? window.currentTenantId+'_' : '')+k; }
function _webLsSet(k,v) { try { localStorage.setItem(_webLsKey(k),v); } catch{} }
function _webLsGet(k,def='') {
    const val = localStorage.getItem(_webLsKey(k));
    if (val !== null && val !== '') return val;
    const legacy = localStorage.getItem(k);
    if (legacy !== null) {
        try { localStorage.setItem(_webLsKey(k), legacy); } catch{}
        return legacy;
    }
    return def;
}

let messageSubscription = null;
let taskSubscription = null;
let assigneeSubscription = null;
let trailSubscription = null;
let notificationSubscription = null;

// Unread counts per room
window.unreadCounts = {};

window.scrollToAndHighlight = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        window.showCenterToast('Message not found in current view', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const bubble = element.querySelector('.bubble');
    if (bubble) {
        bubble.classList.add('glow-target');
        setTimeout(() => bubble.classList.add('active-glow'), 50);
        setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 4000);
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
};

// ─── NEW GROUP MODAL ──────────────────────────────────────────────────────────
let _ngColor = '#6366f1', _ngPhotoDataUrl = null, _ngSelectedMembers = new Set();

window.openNewGroupModal = async function() {
    if (window.canCreateGroup?.() === false) return;
    _ngColor = '#6366f1'; _ngPhotoDataUrl = null; _ngSelectedMembers = new Set();
    const modal = document.getElementById('newGroupModal');
    if (!modal) return;
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.getElementById('ngName').value = '';
    document.getElementById('ngErr').style.display = 'none';
    const wrap = document.getElementById('ngPhotoWrap');
    if (wrap) { wrap.style.background = _ngColor; wrap.style.backgroundImage = ''; }
    const icon = document.getElementById('ngPhotoIcon');
    if (icon) icon.style.display = '';
    window._ngPickColor(_ngColor);
    window._ngFilterMembers('');
    window._ngRenderBadges();
};
window.closeNewGroupModal = function() {
    const modal = document.getElementById('newGroupModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};
window._ngPickColor = function(color) {
    _ngColor = color;
    const wrap = document.getElementById('ngPhotoWrap');
    if (wrap && !_ngPhotoDataUrl) wrap.style.background = color;
    document.querySelectorAll('.ng-color-dot').forEach(d => {
        d.style.border = d.dataset.color === color ? '3px solid var(--text-primary)' : '3px solid transparent';
        d.style.transform = d.dataset.color === color ? 'scale(1.2)' : '';
    });
};
window._ngPhotoSelected = function(input) {
    const file = input.files[0]; input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = Math.min(img.width, img.height, 240);
            canvas.width = size; canvas.height = size;
            canvas.getContext('2d').drawImage(img, 0, 0, size, size);
            _ngPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const wrap = document.getElementById('ngPhotoWrap');
            if (wrap) wrap.style.background = `url(${_ngPhotoDataUrl}) center/cover`;
            const icon = document.getElementById('ngPhotoIcon');
            if (icon) icon.style.display = 'none';
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
};
window._ngFilterMembers = function(q) {
    const users = (window.globalUsersCache || []).filter(u => u.id !== window.currentUser?.id);
    const filtered = !q ? users : users.filter(u =>
        (u.full_name||'').toLowerCase().includes(q.toLowerCase()) ||
        (u.email||'').toLowerCase().includes(q.toLowerCase())
    );
    const list = document.getElementById('ngMemberList');
    if (!list) return;
    list.innerHTML = filtered.length ? filtered.map(u => {
        const sel = _ngSelectedMembers.has(u.id);
        const init = (u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
        const photoStyle = u.avatar_url
            ? `background:url('${u.avatar_url}') center/cover;color:transparent;`
            : `background:${sel?'var(--accent)':'var(--border-color)'};color:${sel?'#fff':'var(--text-secondary)'};`;
        return `<div onclick="window._ngToggleMember('${u.id}')"
            style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;
                   background:${sel?'rgba(99,102,241,.08)':'transparent'};border-bottom:1px solid var(--border-color);">
            <div style="width:32px;height:32px;border-radius:50%;${photoStyle}
                 display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${u.avatar_url?'':init}</div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${window.escapeHtml(u.full_name||'—')}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${window.escapeHtml(u.designation||u.email||'')}</div>
            </div>
            ${sel ? '<i class="fa-solid fa-check" style="color:var(--accent);font-size:13px;"></i>' : ''}
        </div>`;
    }).join('') : `<div style="padding:14px;text-align:center;font-size:12px;color:var(--text-secondary);">No staff found</div>`;
};
window._ngToggleMember = function(id) {
    if (_ngSelectedMembers.has(id)) _ngSelectedMembers.delete(id);
    else _ngSelectedMembers.add(id);
    window._ngFilterMembers(document.getElementById('ngMemberSearch')?.value||'');
    window._ngRenderBadges();
};
window._ngRenderBadges = function() {
    const c = document.getElementById('ngSelectedBadges');
    if (!c) return;
    c.innerHTML = [..._ngSelectedMembers].map(id => {
        const u = (window.globalUsersCache||[]).find(x=>x.id===id);
        const name = u ? (u.full_name||u.email) : id;
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(99,102,241,.12);
            color:var(--accent);padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">
            ${window.escapeHtml(name)}
            <span onclick="window._ngToggleMember('${id}')" style="cursor:pointer;opacity:.7;font-size:14px;">&times;</span>
        </span>`;
    }).join('');
};
window._gsPendingPhoto = null;
window._gsPhotoSelected = function(input) {
    const file = input.files[0]; input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = Math.min(img.width, img.height, 240);
            canvas.width = size; canvas.height = size;
            canvas.getContext('2d').drawImage(img, 0, 0, size, size);
            window._gsPendingPhoto = canvas.toDataURL('image/jpeg', 0.8);
            const wrap = document.getElementById('gsPhotoWrap');
            if (wrap) wrap.style.background = `url(${window._gsPendingPhoto}) center/cover`;
            const icon = document.getElementById('gsPhotoIcon');
            if (icon) icon.style.display = 'none';
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
};
window.saveNewGroup = async function() {
    const btn = document.getElementById('ngSaveBtn');
    const err = document.getElementById('ngErr');
    const name = document.getElementById('ngName').value.trim();
    err.style.display = 'none';
    // Server-authoritative role guard — not just UI hiding.
    if (window.guardManageGroups?.()) return;
    // Orphaned-tenant guard — surface a clear message instead of a raw FK error.
    if (window._tenantOrphaned) {
        err.textContent = 'Your school account is still being set up (missing tenant record). Please contact support to finish setup before creating groups.';
        err.style.display = 'block';
        return;
    }
    if (!name) { err.textContent='Group name is required.'; err.style.display='block'; return; }
    if (_ngSelectedMembers.size===0) { err.textContent='Add at least one member.'; err.style.display='block'; return; }
    btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
    const roomId = 'grp_'+name.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').substring(0,30)+'_'+Date.now().toString(36);
    const memberIds = [window.currentUser.id, ..._ngSelectedMembers];
    _webLsSet('dept_name_'+roomId, name);
    _webLsSet('dept_color_'+roomId, _ngColor);
    if (_ngPhotoDataUrl) _webLsSet('dept_photo_'+roomId, _ngPhotoDataUrl);
    _webLsSet('dept_members_'+roomId, JSON.stringify(memberIds));

    // Persist to DB so all users see the group in their sidebar
    const rsPayload = { room_id: roomId, tenant_id: window.currentTenantId, name, color: _ngColor, archived: false, updated_at: new Date().toISOString() };
    // Try with members column first; fall back without it if column doesn't exist
    let { error: rsErr } = await sb.from('room_settings').upsert({ ...rsPayload, members: memberIds }, { onConflict: 'room_id,tenant_id' });
    if (rsErr?.message?.includes('members')) {
        ({ error: rsErr } = await sb.from('room_settings').upsert(rsPayload, { onConflict: 'room_id,tenant_id' }));
    }

    const { error } = await sb.from('messages').insert({
        room_id:roomId, sender_id:window.currentUser.id, tenant_id:window.currentTenantId,
        text:`<p>📢 <strong>${window.escapeHtml(name)}</strong> group created.</p>`,
        created_at:new Date().toISOString()
    });
    btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-plus"></i> Create Department';
    if (rsErr) { err.textContent='Could not create group: '+rsErr.message; err.style.display='block'; return; }
    if (error) { err.textContent='Could not post system message: '+error.message; err.style.display='block'; return; }

    // Broadcast so other online users refresh their sidebar immediately (web + cross-platform mobile)
    window._reactionsBroadcast?.send({ type:'broadcast', event:'group_photo', payload:{ room_id:roomId, name, color:_ngColor } });
    window._sharedBroadcast?.send({ type:'broadcast', event:'group_photo', payload:{ room_id:roomId, name, color:_ngColor, src:'w' } });

    window.closeNewGroupModal();
    window.showCenterToast(`"${name}" created ✓`,'fa-solid fa-users');
    if (typeof window.loadChatsList==='function') window.loadChatsList();
};

window._toggleSearch = function() {
    const wrap = document.getElementById('sidebarSearchWrap');
    const inp  = document.getElementById('sidebarSearch');
    if (!wrap) return;
    const open = wrap.style.display === 'none';
    wrap.style.display = open ? 'block' : 'none';
    if (open && inp) { inp.focus(); }
    else if (inp) { inp.value = ''; window.filterSidebar(''); }
};

window.renderMainApp = async function() {
    if (typeof window.applyTheme === 'function') window.applyTheme();
    const userNameDisplay = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';

    const leftWidth = localStorage.getItem('mpgs_left_width') || '320px';
    const rightWidth = localStorage.getItem('mpgs_right_width') || '450px';
    const leftDisplay = localStorage.getItem('mpgs_left_sidebar_state') || 'flex';
    const rightDisplay = localStorage.getItem('mpgs_right_sidebar_state') || 'flex';

    const wt = window.escapeHtml(window.toSentenceCase?.(userNameDisplay) || userNameDisplay);
    const svgL = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><text x="50%" y="50%" transform="rotate(-30 100 75)" fill="rgba(0,0,0,0.03)" font-size="14" font-family="sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${wt}</text></svg>`);
    const svgD = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><text x="50%" y="50%" transform="rotate(-30 100 75)" fill="rgba(255,255,255,0.02)" font-size="14" font-family="sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${wt}</text></svg>`);
    document.documentElement.style.setProperty('--wm-light', `url('data:image/svg+xml;utf8,${svgL}')`);
    document.documentElement.style.setProperty('--wm-dark', `url('data:image/svg+xml;utf8,${svgD}')`);

    document.getElementById('root').innerHTML = `
        <div class="flex h-full w-full" style="background-color:var(--bg-body);">

            <!-- LEFT SIDEBAR -->
            <div id="leftSidebar" class="left-sidebar flex-col border-r z-20" style="display:${leftDisplay};width:${leftWidth};background-color:var(--bg-sidebar);border-color:var(--border-color);">

                <!-- A+B: School branding + actions row -->
                <div style="padding:12px 14px 0;border-bottom:1px solid var(--border-color);background:var(--bg-sidebar);">
                    <div style="font-family:'Inter',system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#9b2c2c;margin-bottom:3px;text-shadow:0 1px 0 rgba(255,255,255,0.6),0 -1px 0 rgba(0,0,0,0.12);">Noted For Action</div>
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#7f1d1d;letter-spacing:0.01em;line-height:1.2;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:1px 1px 0 rgba(0,0,0,0.18),2px 2px 0 rgba(0,0,0,0.09),0 1px 5px rgba(127,29,29,0.22);" title="${window.escapeHtml(window.currentSchoolName || 'My School')}">${window.escapeHtml(window.currentSchoolName || 'My School')}</div>
                    <div style="display:flex;align-items:center;gap:5px;padding-bottom:8px;">
                    ${window.canCreateGroup?.() !== false ? `
                    <button onclick="window.openNewGroupModal()" title="Create Department"
                        style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fa-solid fa-plus" style="font-size:11px;"></i>
                    </button>` : ''}
                    <button id="searchToggleBtn" onclick="window._toggleSearch()"
                        title="Search"
                        style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fa-solid fa-magnifying-glass" style="font-size:11px;"></i>
                    </button>
                    <div class="menu-wrap" style="flex-shrink:0;">
                        <button id="themePaletteBtn" onclick="window.toggleThemePanel()" title="Theme"
                            style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;">
                            <i class="fa-solid fa-palette" style="font-size:11px;"></i>
                        </button>
                    </div>
                    <button onclick="window.logout()" title="Logout"
                        style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:#ef4444;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fa-solid fa-arrow-right-from-bracket" style="font-size:11px;"></i>
                    </button>
                    </div>
                </div>

                <!-- Search (collapsible) -->
                <div id="sidebarSearchWrap" style="display:none;padding:6px 10px;border-bottom:1px solid var(--border-color);">
                    <input type="text" id="sidebarSearch" placeholder="Search departments & staff..."
                        class="ui-input w-full p-2 rounded-xl text-sm outline-none"
                        oninput="window.filterSidebar(this.value)"
                        style="font-size:12px;">
                </div>

                <!-- C+D: Departments + Staff list -->
                <div id="chatsList" class="flex-1 overflow-y-auto pb-2"></div>

                <!-- E: User strip -->
                <div style="border-top:1px solid var(--border-color);background:var(--bg-body);padding:8px 10px;">
                    <div style="display:flex;align-items:center;gap:7px;">
                        <div id="sidebarAvatar" style="width:30px;height:30px;border-radius:50%;background:var(--accent);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;">
                            ${(window._userAvatarUrl || _webLsGet('mpgs_avatar_' + (window.currentUser?.id||''))) ? '<img src="' + (window._userAvatarUrl || _webLsGet('mpgs_avatar_' + (window.currentUser?.id||''))) + '" style="width:100%;height:100%;object-fit:cover;">' : userNameDisplay.charAt(0).toUpperCase()}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div id="sidebarNameDisplay" style="font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window.escapeHtml(window.toSentenceCase?.(userNameDisplay) || userNameDisplay)}</div>
                            <div style="font-size:9px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${window.currentDesignation || window.currentRoleName || ''}</div>
                        </div>
                        <button onclick="window.openSettings()" title="Profile Settings"
                            style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fa-solid fa-gear" style="font-size:11px;"></i>
                        </button>
                        <button onclick="window.openDashboard()" title="My Dashboard"
                            style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-color);background:transparent;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fa-solid fa-chart-bar" style="font-size:11px;"></i>
                        </button>
                    </div>
                    <!-- F: Version -->
                    <div style="font-size:9px;color:var(--text-secondary);text-align:center;margin-top:5px;letter-spacing:.08em;text-transform:uppercase;">v1.77.0 (v57) &nbsp;&bull;&nbsp; Noted For Action</div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <!-- CHAT AREA -->
            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                    <div class="flex items-center gap-3">
                        <!-- Mobile hamburger (shown by CSS on mobile only) -->
                        <button id="mobileSidebarToggle" onclick="window.toggleMobileSidebar()"
                            style="display:none;background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary);font-size:22px;line-height:1;">
                            <i class="fa-solid fa-bars"></i>
                        </button>
                        <i class="ti ti-layout-sidebar-left cursor-pointer pr-3 border-r" onclick="window.toggleLeftSidebar()" title="Toggle Sidebar" style="color:var(--text-secondary);border-color:var(--border-color);"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight" style="color:var(--text-primary);">Loading...</span>
                        <span id="memberCountChip" style="display:none;font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;background:var(--accent-muted,rgba(99,102,241,0.1));color:var(--accent);margin-left:4px;"></span>
                        <button id="groupSettingsBtn" onclick="window.openGroupSettings()" title="Department Settings"
                            class="ml-1 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 transition-colors hidden"
                            style="color:var(--text-secondary);">
                            <i class="fa-solid fa-sliders text-xs"></i>
                        </button>
                    </div>
                    <div class="flex items-center gap-4" style="color:var(--text-secondary);">
                        ${window.currentPermissions?.admin_panel ? `
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.location.href='/admin.html'" title="Switch to Admin Panel" style="color:var(--accent);">
                            <i class="fa-solid fa-user-shield text-[17px]"></i><span>Admin</span>
                        </div>` : ''}
                        <div class="topbar-icon-btn top-bar-icon" id="topBarScheduleBtn" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages">
                            <i class="ti ti-clock text-xl"></i><span>Schedule</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openTopPanel('reminders')" title="Reminders">
                            <i class="fa-solid fa-stopwatch text-[18px]"></i><span>Remind</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openTopPanel('bookmarks')" title="Bookmarks">
                            <i class="ti ti-bookmark text-xl"></i><span>Bookmarks</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openActivityFeed()" title="Notifications & Activity">
                            <i class="ti ti-bell text-xl" style="color:var(--text-secondary,#5b6e8c);"></i><span>Activity</span>
                        </div>
                        <div class="border-l pl-4 ml-1 flex gap-3" style="border-color:var(--border-color);">
                            <div class="topbar-icon-btn" onclick="window.toggleRightSidebar()" title="Toggle Task Panel">
                                <i class="ti ti-layout-sidebar-right text-xl"></i><span>Tasks</span>
                            </div>
                        </div>
                        <input type="text" id="messageSearchBar" placeholder="Search messages..." class="ui-input px-3 py-1 rounded-full text-sm w-40 outline-none ml-1">
                    </div>
                </div>

                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col items-center min-w-0">
                    <div class="chat-shell w-full max-w-full bg-transparent border-none" id="chatShellContainer"></div>
                </div>

                <div id="webTypingBar" style="display:none;padding:2px 20px 0;font-size:11px;color:var(--text-secondary);font-style:italic;"></div>

                <div class="flex flex-col relative border-t p-3 px-5 z-20" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                    <div id="replyBanner" class="hidden mx-0 mt-0 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center z-0 relative shadow-sm text-xs">
                        <div class="text-indigo-700 flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold whitespace-nowrap">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times text-indigo-400 hover:text-red-500 cursor-pointer p-1" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="w-full border rounded-xl flex flex-col shadow-sm transition-colors relative" style="background-color:var(--bg-body);border-color:var(--border-color);">
                        <div id="inputEmojiPicker" class="absolute bottom-full left-0 mb-2 hidden shadow-2xl rounded-xl p-3 min-w-[240px] z-50 border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                            <div class="text-[10px] font-bold mb-1 uppercase tracking-wider" style="color:var(--text-secondary);">Insert Emoji</div>
                            <div class="flex flex-wrap gap-1">
                                ${['👍','❤️','😂','😮','😢','🙏','🎉','🔥','✅','👀'].map(e => `<span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-xl" onclick="window.insertEmoji('${e}')">${e}</span>`).join('')}
                            </div>
                        </div>
                        <div id="toolbar-container" class="border-b rounded-t-xl" style="background-color:var(--bg-body);border-color:var(--border-color);"></div>
                        <div class="flex items-end gap-2 p-1.5 px-2 rounded-b-xl" style="background-color:var(--bg-body);">
                            <button onclick="window.toggleInputEmojiPicker()" class="p-2 transition-colors" title="Emoji" style="color:var(--text-secondary);"><i class="ti ti-mood-smile text-xl"></i></button>
                            <button onclick="document.getElementById('fileAttachment').click()" class="p-2 transition-colors" title="Attach File" style="color:var(--text-secondary);"><i class="ti ti-paperclip text-xl"></i></button>
                            <input type="file" id="fileAttachment" class="hidden">
                            <div class="flex-1 min-w-0 bg-transparent py-1">
                                <div id="richEditor" class="w-full" style="color:var(--text-primary);"></div>
                            </div>
                            <button onclick="window.openLinkModal('main')" class="p-2 transition-colors" title="Insert Link Pill" style="color:var(--text-secondary);"><i class="fa-solid fa-link text-[16px]"></i></button>
                            <button id="composerScheduleBtn" onclick="window.showScheduleModal()" class="p-2 transition-colors" title="Schedule" style="color:var(--text-secondary);"><i class="ti ti-clock text-xl"></i></button>
                            <button id="sendBtn" class="text-white rounded-lg shadow-md transition-colors h-[38px] w-[46px] flex items-center justify-center mb-0.5" style="background-color:var(--accent);"><i class="ti ti-send text-lg"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rightResizer" class="drag-resizer"></div>

            <!-- RIGHT SIDEBAR -->
            <div id="rightSidebar" class="right-sidebar border-l flex-col z-20 shadow-sm" style="display:${rightDisplay};width:${rightWidth};background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="w-full h-full flex flex-col min-w-0">
                    <div id="rightSidebarFilters" class="border-b" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                        <!-- Hidden selects for backwards compat with tasks.js -->
                        <select id="taskFilter" class="hidden" onchange="window.loadTasksForPanel()">
                            <option value="all">All Tasks</option><option value="today">Today</option>
                            <option value="pending">Pending</option><option value="completed">Completed</option>
                            <option value="allotted_by_me">Allotted by Me</option><option value="allotted_to_me">Allotted to Me</option>
                            <option value="delegated">Delegated</option><option value="transferred">Transferred</option>
                            <option value="date_range">Date Range</option>
                        </select>
                        <select id="taskSort" class="hidden" onchange="window.loadTasksForPanel()">
                            <option value="deadline_asc">deadline_asc</option><option value="deadline_desc">deadline_desc</option>
                            <option value="created_desc">created_desc</option><option value="created_asc">created_asc</option>
                        </select>
                        <!-- Pill filter row -->
                        <div class="px-3 pt-2.5 pb-1">
                            <div class="text-[9px] font-black tracking-widest uppercase mb-1.5 flex items-center gap-1" style="color:var(--text-secondary);">
                                <i class="fa-solid fa-filter" style="font-size:8px;color:var(--accent);"></i> Filter
                            </div>
                            <div class="flex gap-1 flex-wrap pb-1">
                                <button class="filter-pill fp-active" data-filter="all" onclick="window.setTaskFilter('all')">All</button>
                                <button class="filter-pill" data-filter="today" onclick="window.setTaskFilter('today')">Today</button>
                                <button class="filter-pill" data-filter="pending" onclick="window.setTaskFilter('pending')">Pending</button>
                                <button class="filter-pill" data-filter="completed" onclick="window.setTaskFilter('completed')">Done</button>
                                <button class="filter-pill" data-filter="allotted_by_me" onclick="window.setTaskFilter('allotted_by_me')">By Me</button>
                                <button class="filter-pill" data-filter="allotted_to_me" onclick="window.setTaskFilter('allotted_to_me')">To Me</button>
                                <button class="filter-pill" data-filter="delegated" onclick="window.setTaskFilter('delegated')">Delegated</button>
                                <button class="filter-pill" data-filter="transferred" onclick="window.setTaskFilter('transferred')">Transferred</button>
                                <button class="filter-pill" data-filter="date_range" onclick="window.setTaskFilter('date_range')">Date Range</button>
                            </div>
                        </div>
                        <!-- Sort row -->
                        <div class="px-3 pb-2.5">
                            <div class="text-[9px] font-black tracking-widest uppercase mb-1.5" style="color:var(--text-secondary);">Sort by</div>
                            <div class="flex gap-1 flex-wrap">
                                <button class="filter-pill fp-active" data-sort="deadline_asc" onclick="window.setTaskSort('deadline_asc')" title="Deadline: Earliest"><i class="fa-solid fa-arrow-up text-[8px]"></i> Deadline ↑</button>
                                <button class="filter-pill" data-sort="deadline_desc" onclick="window.setTaskSort('deadline_desc')" title="Deadline: Latest"><i class="fa-solid fa-arrow-down text-[8px]"></i> Deadline ↓</button>
                                <button class="filter-pill" data-sort="created_desc" onclick="window.setTaskSort('created_desc')" title="Newest first">Newest</button>
                                <button class="filter-pill" data-sort="created_asc" onclick="window.setTaskSort('created_asc')" title="Oldest first">Oldest</button>
                            </div>
                        </div>
                    </div>
                    <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 border-b flex gap-2 items-center" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                        <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                        <span class="text-[10px] font-bold" style="color:var(--text-secondary);">TO</span>
                        <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    </div>
                    <div id="tasksPanel" class="flex-1 overflow-y-auto p-4" style="background-color:var(--bg-body);"></div>
                </div>
            </div>
        </div>

        <!-- MODALS -->
        <div id="fileRenameModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Rename Attachment</h3>
                <input type="text" id="newFileNameInput" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.cancelFileRename()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.confirmFileRename()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Upload</button>
                </div>
            </div>
        </div>

        <div id="scheduleModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 text-center shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <i class="fa-regular fa-clock text-4xl mb-4" style="color:var(--accent);"></i>
                <h3 class="text-xl font-bold mb-2" style="color:var(--text-primary);">Schedule Message</h3>
                <input type="datetime-local" id="scheduleDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeScheduleModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveScheduledMessage()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Confirm</button>
                </div>
            </div>
        </div>

        <div id="taskModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Create Task</h3>
                <input id="taskTitle" class="w-full p-3 rounded-xl mb-3 border outline-none text-sm font-medium" placeholder="Task Title" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Assigned To:</p>
                <div class="border rounded-xl mb-3 overflow-hidden" style="border-color:var(--border-color);">
                    <input type="text" id="assigneeSearch" onkeyup="window.filterAssignees()" placeholder="Search users..." class="w-full p-2.5 text-xs border-b outline-none font-medium" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    <div id="assigneeCheckboxList" class="max-h-32 overflow-y-auto p-2 flex flex-col gap-1" style="background-color:var(--bg-sidebar);"></div>
                </div>
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Deadline:</p>
                        <input type="date" id="taskDeadline" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    </div>
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Priority:</p>
                        <select id="taskPriority" class="w-full p-2.5 rounded-xl border outline-none text-sm font-medium" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3 mt-4 pt-2">
                    <button onclick="window.closeTaskModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveTaskMultiAssignee()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md" style="background-color:var(--accent);">Create Ticket</button>
                </div>
            </div>
        </div>

        <!-- Link Pill Modal -->
        <div id="linkPillModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-lg font-bold mb-1" style="color:var(--text-primary);">Insert Link</h3>
                <p class="text-xs mb-4" style="color:var(--text-secondary);">URL is hidden — only the name appears as a pill to recipients.</p>
                <input type="text" id="linkPillName" placeholder="Display name (e.g. View Report)" class="w-full p-3 rounded-xl mb-3 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <input type="url" id="linkPillUrl" placeholder="https://..." class="w-full p-3 rounded-xl mb-5 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeLinkModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.insertLinkPill()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Insert Pill</button>
                </div>
            </div>
        </div>

        <!-- Dashboard Modal -->
        <div id="dashboardModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
            <div class="rounded-2xl w-full max-w-2xl shadow-2xl border flex flex-col max-h-[90vh]" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="p-5 border-b flex items-center justify-between flex-shrink-0" style="border-color:var(--border-color);">
                    <h3 class="text-lg font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-chart-bar" style="color:var(--accent);"></i> My Dashboard
                    </h3>
                    <div class="flex items-center gap-2">
                        <button onclick="window.downloadDashboardPDF()" class="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity" style="background:var(--accent);color:#fff;" title="Download Progress Card">
                            <i class="fa-solid fa-download text-[10px]"></i> Download PDF
                        </button>
                        <button onclick="window.closeDashboard()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-times text-sm"></i>
                        </button>
                    </div>
                </div>
                <!-- Period tabs -->
                <div class="flex gap-1 p-4 pb-0 flex-shrink-0 flex-wrap">
                    ${[
                        {id:'this_month',label:'This Month'},
                        {id:'last_month',label:'Last Month'},
                        {id:'this_quarter',label:'Quarter'},
                        {id:'this_year',label:'This Year'}
                    ].map(p => `<button class="dash-tab px-3 py-1.5 rounded-lg text-xs font-bold border transition-all" data-period="${p.id}" onclick="window.loadDashboard('${p.id}')" style="border-color:var(--border-color);color:var(--text-secondary);background:var(--bg-body);">${p.label}</button>`).join('')}
                </div>
                <div id="dashboardContent" class="flex-1 overflow-y-auto p-4"></div>
            </div>
        </div>

        <!-- New Group Modal -->
        <div id="newGroupModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl w-full max-w-md mx-4 shadow-2xl border flex flex-col max-h-[90vh]" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="flex items-center justify-between p-5 border-b" style="border-color:var(--border-color);">
                    <h3 class="font-bold text-base" style="color:var(--text-primary);">Create New Department</h3>
                    <button onclick="window.closeNewGroupModal()" style="color:var(--text-secondary);background:none;border:none;cursor:pointer;font-size:18px;">✕</button>
                </div>
                <div class="overflow-y-auto p-5 flex flex-col gap-4">
                    <div style="display:flex;align-items:center;gap:14px;">
                        <div id="ngPhotoWrap" onclick="document.getElementById('ngPhotoInput').click()" style="width:64px;height:64px;border-radius:16px;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;overflow:hidden;position:relative;">
                            <i class="fa-solid fa-users" style="color:#fff;font-size:22px;" id="ngPhotoIcon"></i>
                            <span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                                <i class="fa-solid fa-camera" style="font-size:9px;color:var(--accent);"></i>
                            </span>
                        </div>
                        <input type="file" id="ngPhotoInput" accept="image/*" style="display:none;" onchange="window._ngPhotoSelected(this)">
                        <div style="flex:1;">
                            <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:5px;">Group Name</label>
                            <input type="text" id="ngName" placeholder="e.g. Science HOD Team" maxlength="60"
                                style="width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">
                        </div>
                    </div>
                    <div>
                        <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:8px;">Group Colour</label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="ngColorRow">
                            ${['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'].map(c=>
                                `<div class="ng-color-dot" data-color="${c}" onclick="window._ngPickColor('${c}')"
                                    style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid transparent;transition:transform .15s;"></div>`
                            ).join('')}
                        </div>
                    </div>
                    <div>
                        <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin-bottom:8px;">Add Members</label>
                        <input type="text" id="ngMemberSearch" placeholder="Search staff..." oninput="window._ngFilterMembers(this.value)"
                            style="width:100%;padding:8px 12px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box;">
                        <div id="ngMemberList" style="max-height:160px;overflow-y:auto;border:1px solid var(--border-color);border-radius:10px;"></div>
                        <div id="ngSelectedBadges" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;min-height:0;"></div>
                    </div>
                    <div id="ngErr" style="font-size:12px;color:#ef4444;display:none;"></div>
                </div>
                <div class="p-4 border-t flex gap-3" style="border-color:var(--border-color);">
                    <button onclick="window.closeNewGroupModal()" class="flex-1 py-2 rounded-xl border text-sm font-bold" style="background:transparent;border-color:var(--border-color);color:var(--text-secondary);">Cancel</button>
                    <button onclick="window.saveNewGroup()" id="ngSaveBtn" style="flex:2;padding:9px;border-radius:11px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;">
                        <i class="fa-solid fa-plus"></i> Create Department
                    </button>
                </div>
            </div>
        </div>

        <!-- Department Settings Modal -->
        <div id="groupSettingsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl w-full max-w-sm mx-4 shadow-2xl border flex flex-col max-h-[90vh]" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="p-5 border-b flex items-center justify-between flex-shrink-0" style="border-color:var(--border-color);">
                    <h3 class="text-base font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-users-gear" style="color:var(--accent);"></i> Department Settings
                    </h3>
                    <button onclick="window.closeGroupSettings()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100" style="color:var(--text-secondary);">
                        <i class="fa-solid fa-times text-sm"></i>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                    <input type="hidden" id="groupSettingsId">

                    <!-- Department photo -->
                    <div style="display:flex;align-items:center;gap:14px;">
                        <div id="gsPhotoWrap" onclick="document.getElementById('gsPhotoInput').click()"
                            style="width:64px;height:64px;border-radius:16px;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;overflow:hidden;position:relative;">
                            <i class="fa-solid fa-users" style="color:#fff;font-size:22px;" id="gsPhotoIcon"></i>
                            <span style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                                <i class="fa-solid fa-camera" style="font-size:9px;color:var(--accent);"></i>
                            </span>
                        </div>
                        <input type="file" id="gsPhotoInput" accept="image/*" style="display:none;" onchange="window._gsPhotoSelected(this)">
                        <div style="flex:1;">
                            <label style="display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:5px;">Department Name</label>
                            <input type="text" id="groupSettingsName" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                        </div>
                    </div>

                    <!-- Members -->
                    <div>
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <label style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);">Members &amp; Admins</label>
                            <span style="font-size:9px;color:var(--text-secondary);">☑ Member &nbsp;★ Admin</span>
                        </div>
                        <div id="groupMembersList" class="border rounded-xl overflow-hidden" style="border-color:var(--border-color);background-color:var(--bg-body);">
                            <p class="text-xs italic p-3" style="color:var(--text-secondary);">Loading members...</p>
                        </div>
                    </div>
                </div>
                <div class="p-4 border-t flex gap-3 flex-shrink-0" style="border-color:var(--border-color);">
                    <button onclick="window.closeGroupSettings()" class="flex-1 py-2.5 rounded-xl font-bold border" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveGroupSettings()" class="flex-1 py-2.5 rounded-xl font-bold text-white" style="background-color:var(--accent);">Save</button>
                </div>
            </div>
        </div>

        <!-- Settings Modal -->
        <div id="settingsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-lg font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-gear" style="color:var(--accent);"></i> Profile Settings
                    </h3>
                    <button onclick="window.closeSettings()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors" style="color:var(--text-secondary);">
                        <i class="fa-solid fa-times text-sm"></i>
                    </button>
                </div>
                <!-- Photo -->
                <div class="flex flex-col items-center mb-5">
                    <div class="relative mb-3">
                        <img id="settingsPhotoPreview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Profile" style="display:none;width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--accent);">
                        <div id="settingsPhotoPlaceholder" class="w-18 h-18 rounded-full flex items-center justify-center text-white text-2xl font-bold" style="width:72px;height:72px;border-radius:50%;background:var(--accent);">${userNameDisplay.charAt(0).toUpperCase()}</div>
                    </div>
                    <label class="cursor-pointer text-xs font-bold px-3 py-1.5 rounded-full border transition-colors hover:opacity-80" style="color:var(--accent);border-color:var(--accent);">
                        <i class="fa-solid fa-camera text-[10px] mr-1"></i> Change Photo
                        <input type="file" id="settingsPhotoInput" class="hidden" accept="image/*" onchange="window.previewSettingsPhoto(this)">
                    </label>
                </div>
                <!-- Fields -->
                <div class="mb-3">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Display Name</label>
                    <input type="text" id="settingsName" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="mb-3">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Designation</label>
                    <input type="text" id="settingsDesignation" placeholder="e.g. Physics Teacher, HOD Science" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="mb-3">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Email (read-only)</label>
                    <input type="email" id="settingsEmail" disabled class="w-full p-2.5 rounded-xl border outline-none text-sm opacity-60" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="mb-5 p-3 rounded-xl border" style="background-color:var(--bg-body);border-color:var(--border-color);">
                    <div class="text-xs font-bold mb-2" style="color:var(--text-secondary);">Sound Notifications</div>
                    <label class="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" id="muteIncoming" class="w-4 h-4 accent-[var(--accent)]">
                        <span class="text-xs" style="color:var(--text-primary);">Mute incoming message sounds</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="muteOutgoing" class="w-4 h-4 accent-[var(--accent)]">
                        <span class="text-xs" style="color:var(--text-primary);">Mute outgoing alert sounds</span>
                    </label>
                </div>
                <div class="flex gap-3">
                    <button onclick="window.closeSettings()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveSettings()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Save</button>
                </div>
            </div>
        </div>

        <!-- Forward Message Modal -->
        <div id="forwardModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-lg font-bold mb-1" style="color:var(--text-primary);">Forward Message</h3>
                <p class="text-xs mb-3" style="color:var(--text-secondary);">Select a department or staff member to forward to:</p>
                <div class="border p-3 rounded-xl mb-4 italic text-xs" id="forwardPreview" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-secondary);max-height:60px;overflow:hidden;"></div>
                <select id="forwardRoomSelect" class="w-full p-2.5 rounded-xl border outline-none text-sm mb-5" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);"></select>
                <div class="flex gap-3">
                    <button onclick="window.closeForwardModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.sendForwardedMessage()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Forward</button>
                </div>
            </div>
        </div>

        <div id="reminderModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Set Reminder</h3>
                <div class="border p-3 rounded-xl mb-4" style="background-color:var(--bg-body);border-color:var(--border-color);">
                    <p id="reminderMessagePreview" class="text-xs line-clamp-2 italic font-medium" style="color:var(--text-secondary);"></p>
                </div>
                <input type="datetime-local" id="reminderDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeReminderModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveReminder()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md" style="background-color:var(--accent);">Set Alarm</button>
                </div>
            </div>
        </div>
    `;

    // Lazy-load Quill JS on first use — removes ~200KB from initial page load
    if (!window.Quill) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.quilljs.com/1.3.6/quill.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    window.quillEditor = new Quill('#richEditor', {
        theme: 'snow',
        placeholder: 'Type a message...',
        modules: {
            toolbar: {
                container: [
                    ['bold','italic','underline','strike'],
                    [{ 'color': ['#800000','#006400','#00008b'] }],
                    [{'list':'ordered'},{'list':'bullet'}],
                    ['clean']
                ]
            }
        }
    });

    const toolbar = document.querySelector('.ql-toolbar');
    document.getElementById('toolbar-container').appendChild(toolbar);

    window.quillEditor.root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (typeof window.sendMessage === 'function') window.sendMessage(); }
    });

    // Typing indicator — broadcast to mobile users via the reactions broadcast channel (same bcChannel pattern)
    let _webTypingThrottle = 0;
    window.quillEditor.root.addEventListener('input', () => {
        const now = Date.now();
        if (now - _webTypingThrottle < 2000) return;
        _webTypingThrottle = now;
        if (!window.currentRoom || !window.currentUser) return;
        const name = window.currentUser.user_metadata?.full_name || window.currentUser.email?.split('@')[0] || 'Someone';
        window._reactionsBroadcast?.send({ type: 'broadcast', event: 'typing', payload: { room: window.currentRoom, uid: window.currentUser.id, name } });
        window._sharedBroadcast?.send({ type: 'broadcast', event: 'typing', payload: { room: window.currentRoom, uid: window.currentUser.id, name, src: 'w' } });
    });

    // Offline indicator
    window.addEventListener('offline', () => {
        window.showCenterToast('You\'re offline — messages will send when connected', 'fa-solid fa-wifi', 'text-yellow-400');
    });
    window.addEventListener('online', () => {
        window.showCenterToast('Back online ✓', 'fa-solid fa-wifi', 'text-green-400');
    });
    document.getElementById('sendBtn').onclick = () => { if (typeof window.sendMessage === 'function') window.sendMessage(); };

    // File attachment — direct upload, no rename modal
    document.getElementById('fileAttachment').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        window.showCenterToast('Uploading...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filePath = `chat/${Date.now()}_${safeName}`;
        const sizeKB = Math.round(file.size / 1024);
        const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
        if (error) { window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
        if (window.quillEditor) {
            window.quillEditor.focus();
            const range = window.quillEditor.getSelection();
            const index = range ? range.index : window.quillEditor.getLength();
            window.quillEditor.insertText(index, `📁 ${file.name} (${sizeKB} KB)
`, 'link', `https://secure-file.local/${filePath}`);
        }
        window.showCenterToast('File attached!', 'fa-solid fa-check-circle', 'text-green-500');
        e.target.value = '';
    });

    const searchBar = document.getElementById('messageSearchBar');
    if (searchBar) searchBar.addEventListener('input', () => { if (typeof window.applyFilters === 'function') window.applyFilters(); });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.menu-wrap')) { if (typeof window.closeDropdowns === 'function') window.closeDropdowns(); }
        const ep = document.getElementById('inputEmojiPicker');
        if (ep && !e.target.closest('#inputEmojiPicker') && !e.target.closest('[onclick="window.toggleInputEmojiPicker()"]')) ep.classList.add('hidden');
        const panel = document.querySelector('.top-panel-dropdown:not(#themePanel)');
        if (!panel) return;
        if (!panel.contains(e.target) && !e.target.closest('.top-bar-icon')) panel.remove();
    });

    if (typeof window.initResizers === 'function') window.initResizers();
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
    if (typeof window.loadMessages === 'function') window.loadMessages().then?.(() => {
        if (typeof window.applyRBAC === 'function') window.applyRBAC();
    });
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();

    // ── Initialise mobile layout after render ────────────────
    if (typeof window.initMobileApp === "function") window.initMobileApp();
    else if (typeof window.initMobile === "function") window.initMobile();
};

// ── MOBILE LAYOUT ──────────────────────────────────────────
// Uses setProperty('important') to beat dynamic inline styles
window.initMobile = function() {
    const isMobile = window.innerWidth <= 768;
    const leftSB  = document.getElementById('leftSidebar');
    const rightSB = document.getElementById('rightSidebar');
    const leftR   = document.getElementById('leftResizer');
    const rightR  = document.getElementById('rightResizer');
    if (!leftSB) return;

    if (isMobile) {
        // ── RIGHT SIDEBAR: completely hidden ─────────────────
        if (rightSB) { rightSB.style.setProperty('display','none','important'); }
        if (rightR)  { rightR.style.setProperty('display','none','important'); }
        if (leftR)   { leftR.style.setProperty('display','none','important'); }

        // ── LEFT SIDEBAR: fixed overlay off-screen left ──────
        leftSB.style.setProperty('position','fixed','important');
        leftSB.style.setProperty('top','0','important');
        leftSB.style.setProperty('bottom','0','important');
        leftSB.style.setProperty('left','-100vw','important');
        leftSB.style.setProperty('height','100%','important');
        leftSB.style.setProperty('width','82vw','important');
        leftSB.style.setProperty('max-width','320px','important');
        leftSB.style.setProperty('z-index','300','important');
        leftSB.style.setProperty('transition','left 0.28s cubic-bezier(.4,0,.2,1)','important');
        leftSB.style.setProperty('box-shadow','4px 0 24px rgba(0,0,0,.2)','important');
        leftSB.style.setProperty('overflow-y','auto','important');

        // ── OVERLAY backdrop ─────────────────────────────────
        if (!document.getElementById('mobileOverlay')) {
            const ov = document.createElement('div');
            ov.id = 'mobileOverlay';
            Object.assign(ov.style, {
                display:'none', position:'fixed', inset:'0',
                background:'rgba(0,0,0,.5)', zIndex:'299',
                backdropFilter:'blur(2px)', transition:'opacity .25s'
            });
            ov.onclick = () => window.closeMobileSidebar();
            document.body.appendChild(ov);
        }

        // ── TOP BAR: show hamburger, hide text labels ────────
        const ham = document.getElementById('mobileSidebarToggle');
        if (ham) ham.style.setProperty('display','flex','important');
        document.querySelectorAll('.topbar-icon-btn span').forEach(s => {
            s.style.setProperty('display','none','important');
        });

        // ── HIDE school badge 3D tilt (looks bad on narrow) ──
        const badge = document.querySelector('.school-badge-area');
        if (badge) badge.style.setProperty('transform','none','important');

    } else {
        // ── DESKTOP: restore defaults ─────────────────────────
        if (rightSB) rightSB.style.removeProperty('display');
        leftSB.style.removeProperty('position');
        leftSB.style.removeProperty('left');
        leftSB.style.removeProperty('transition');
    }
};

// ── Mobile sidebar open / close ────────────────────────────
window.toggleMobileSidebar = function() {
    const isOpen = document.getElementById('leftSidebar')
                           ?.style.getPropertyValue('left') === '0px';
    if (isOpen) window.closeMobileSidebar();
    else        window.openMobileSidebar();
};

window.openMobileSidebar = function() {
    const leftSB = document.getElementById('leftSidebar');
    const ov     = document.getElementById('mobileOverlay');
    if (!leftSB) return;
    leftSB.style.setProperty('left','0','important');
    if (ov) { ov.style.display = 'block'; requestAnimationFrame(() => { ov.style.opacity='1'; }); }
};

window.closeMobileSidebar = function() {
    const leftSB = document.getElementById('leftSidebar');
    const ov     = document.getElementById('mobileOverlay');
    if (!leftSB) return;
    leftSB.style.setProperty('left','-100vw','important');
    if (ov) { ov.style.opacity='0'; setTimeout(() => { ov.style.display='none'; }, 280); }
};

// ─── SIDEBAR SEARCH ────────────────────────────────────────────────────────
window.filterSidebar = function(term) {
    const t = term.toLowerCase().trim();
    document.querySelectorAll('.channel-item').forEach(el => {
        const name = (el.dataset.name || '').toLowerCase();
        el.style.display = (!t || name.includes(t)) ? 'flex' : 'none';
    });
    // Show/hide section labels based on whether any items visible
    document.querySelectorAll('.sidebar-section-label').forEach(label => {
        const nextItems = [];
        let next = label.nextElementSibling;
        while (next && next.classList.contains('channel-item')) { nextItems.push(next); next = next.nextElementSibling; }
        const anyVisible = nextItems.some(el => el.style.display !== 'none');
        label.style.display = (!t || anyVisible) ? 'block' : 'none';
    });
};

// ─── GROUP PHOTO CACHE HELPER ───────────────────────────────────────────────
window._clearGroupPhoto = function(g) {
    localStorage.removeItem(_webLsKey('dept_photo_' + g));
    localStorage.removeItem(_webLsKey('dept_photo_ts_' + g));
    _webLsSet('dept_photo_none_' + g, String(Date.now())); // 24h skip flag
};

// ─── ENSURE USER CACHE ─────────────────────────────────────────────────────
// Lightweight tenant-user load for sender-name resolution. Kept separate from
// loadChatsList's heavier fetch (which also pulls base64 avatars, ~1MB) so
// message rendering never races an empty cache and shows "Unknown".
window.ensureUsersLoaded = async function(force) {
    if (!force && window.globalUsersCache?.length) return window.globalUsersCache;
    if (!window.currentTenantId) return window.globalUsersCache || [];
    const { data } = await sb.from('profiles')
        .select('id, email, full_name, designation')
        .eq('tenant_id', window.currentTenantId);
    if (data?.length) window.globalUsersCache = data;
    return window.globalUsersCache || [];
};

// ─── LOAD CHATS LIST (Departments + Staff Members) ─────────────────────────
window.loadChatsList = async function() {
    // Build the group list purely from room_settings — no hard-coded departments.
    let groups = [];
    if (window.currentTenantId) {
        try {
            // Try to include members (column may not exist yet — fall back gracefully).
            let rs = null;
            const withMembers = await sb.from('room_settings')
                .select('room_id,name,color,archived,members')
                .eq('tenant_id', window.currentTenantId);
            if (withMembers.error) {
                const basic = await sb.from('room_settings')
                    .select('room_id,name,color,archived')
                    .eq('tenant_id', window.currentTenantId);
                rs = basic.data;
            } else {
                rs = withMembers.data;
            }
            (rs || []).forEach(r => {
                if (r.name)  _webLsSet('dept_name_'+r.room_id, r.name);
                if (r.color) _webLsSet('dept_color_'+r.room_id, r.color);
                // Hydrate members from DB so counts match across devices/users
                if (Array.isArray(r.members)) _webLsSet('dept_members_'+r.room_id, JSON.stringify(r.members));
                // Every non-archived, non-DM room is a group in the sidebar.
                if (!r.archived && !String(r.room_id).startsWith('dm_')) {
                    groups.push({ room_id: r.room_id, name: r.name || r.room_id, color: r.color || null });
                }
            });
        } catch {}
    }

    // No default group — a new school starts empty; the principal creates the first.

    // If the remembered room no longer exists as a group (and isn't a DM),
    // fall back to the first available group so the sidebar highlight is valid.
    if (groups.length && window.currentRoom && !String(window.currentRoom).startsWith('dm_')
        && !groups.some(g => g.room_id === window.currentRoom)) {
        window.currentRoom = groups[0].room_id;
        try { localStorage.setItem('mpgs_current_room', window.currentRoom); } catch {}
    }

    // Expose for other modules (e.g. the forward modal).
    window._groupsCache = groups;

    const {data: users} = await sb.from('profiles').select('id, email, full_name, designation, avatar_url, last_seen').eq('tenant_id', window.currentTenantId);
    window.globalUsersCache = users || [];

    // Fallback colours / initials for the legacy fixed room ids.
    const deptColors = { general: '#6366f1', math: '#0ea5e9', science: '#10b981', leadership: '#f59e0b' };
    const deptInitials = { general: 'GN', math: 'MA', science: 'SC', leadership: 'LD' };

    let html = `<div class="sidebar-section-label px-4 py-2 mt-2 text-[10px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">Departments</div>`;

    if (groups.length === 0) {
        html += window.canManageGroups?.()
            ? `<div style="padding:14px 16px;text-align:center;">
                 <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">No groups yet. Create one for your staff.</p>
                 <button onclick="window.openNewGroupModal()" style="font-size:12px;font-weight:700;color:#fff;background:var(--accent);border:none;border-radius:8px;padding:7px 14px;cursor:pointer;">
                   <i class="fa-solid fa-plus"></i> Create your first group</button>
               </div>`
            : `<div style="padding:14px 16px;text-align:center;font-size:12px;color:var(--text-secondary);">No groups yet. Ask your principal to create one.</div>`;
    }

    for (const grp of groups) {
        const g = grp.room_id;
        const isCurrent = window.currentRoom === g;
        const unread = window.unreadCounts?.[g] || 0;
        const displayName = _webLsGet('dept_name_' + g) || grp.name || (g.charAt(0).toUpperCase() + g.slice(1));
        const storedColor = _webLsGet('dept_color_' + g) || grp.color || deptColors[g] || 'var(--accent)';
        const initials = deptInitials[g] || (displayName.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase() || 'GR');

        // photo: localStorage cache → signed URL from storage (filename is the room_id)
        let storedPhoto = _webLsGet('dept_photo_' + g) || '';
        const storedTs = parseInt(_webLsGet('dept_photo_ts_' + g) || '0');
        const expired = !storedTs || (Date.now() - storedTs > 1800000); // 30 min cache
        const noneTs = parseInt(_webLsGet('dept_photo_none_' + g) || '0');
        const noneRecent = noneTs && (Date.now() - noneTs < 86400000);
        if ((!storedPhoto || expired) && window.currentTenantId && !noneRecent) {
            const path = `group-photos/${window.currentTenantId}/${g}.jpg`;
            const { data: sd, error: sdErr } = await sb.storage.from('task-proofs').createSignedUrl(path, 3600);
            if (!sdErr && sd?.signedUrl) {
                storedPhoto = sd.signedUrl;
                _webLsSet('dept_photo_' + g, storedPhoto);
                _webLsSet('dept_photo_ts_' + g, String(Date.now()));
            } else {
                localStorage.removeItem(_webLsKey('dept_photo_' + g));
                localStorage.removeItem(_webLsKey('dept_photo_ts_' + g));
                storedPhoto = '';
            }
        }
        html += `<div class="channel-item group/dept p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border"
            style="background-color:${isCurrent ? 'var(--bg-body)' : 'transparent'};border-color:${isCurrent ? 'var(--border-color)' : 'transparent'};font-weight:${isCurrent ? 'bold' : 'normal'};"
            data-room="${g}" data-name="${window.escapeHtml(displayName)}">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm overflow-hidden"
                    style="background:${storedColor};">${storedPhoto ? `<img src="${storedPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="window._clearGroupPhoto('${g}');this.remove();this.parentElement.textContent='${initials}';">` : initials}</div>
                ${unread > 0 ? `<span class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full" style="background:#22c55e;"></span>
                    <span class="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style="background:#22c55e;">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color:var(--text-primary);">${window.escapeHtml(displayName)}</span>
            ${window.canSeeGroupGear?.() ? `<button onclick="event.stopPropagation();window.openGroupSettings('${g}')"
                class="opacity-0 group-hover/dept:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 flex-shrink-0"
                style="color:var(--text-secondary);" title="Group Settings">
                <i class="fa-solid fa-gear text-[10px]"></i>
            </button>` : ''}
        </div>`;
    }

    html += `<div class="sidebar-section-label px-4 py-2 mt-4 text-[10px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">Staff Members</div>`;

    window.globalUsersCache.filter(u => u.id !== window.currentUser.id).forEach(u => {
        const name = (typeof window.toSentenceCase === 'function') ? window.toSentenceCase(u.full_name || u.email.split('@')[0]) : (u.full_name || u.email.split('@')[0]);
        // Use canonical DM room ID so both sides match
        const dmRoomId = typeof window.getDmRoomId === 'function' ? window.getDmRoomId(u.id) : 'dm_' + u.id;
        const isCurrent = window.currentRoom === dmRoomId;
        const unread = window.unreadCounts?.[dmRoomId] || 0;

        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border"
            style="background-color:${isCurrent ? 'var(--bg-body)' : 'transparent'};border-color:${isCurrent ? 'var(--border-color)' : 'transparent'};font-weight:${isCurrent ? 'bold' : 'normal'};"
            data-room="${dmRoomId}" data-name="${name}">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                    style="${u.avatar_url ? `background-image:url('${u.avatar_url}');background-size:cover;background-position:center;color:transparent;` : 'background:var(--accent);'}">${u.avatar_url ? '' : name.charAt(0).toUpperCase()}</div>
                ${window.getPresenceStatus?.(u.last_seen)?.online ? `<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2" style="background:#22c55e;border-color:var(--bg-sidebar);"></span>` : ''}
                ${unread > 0 ? `<span class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full" style="background:#22c55e;"></span>
                    <span class="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style="background:#22c55e;">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color:var(--text-primary);">${window.escapeHtml(name)}</span>
        </div>`;
    });

    // Update top bar room title now that we have user data
    const titleSpanEl = document.getElementById('roomTitleDisplay');
    if (titleSpanEl) titleSpanEl.innerText = window.getRoomDisplayName ? window.getRoomDisplayName(window.currentRoom) : window.currentRoom;

    const chatsListEl = document.getElementById('chatsList');
    if (chatsListEl) {
        chatsListEl.innerHTML = html;
        // Apply group gear visibility by role after rendering
        if (typeof window.applyGroupGearRBAC === 'function') window.applyGroupGearRBAC();
        // Patch mobile channel clicks after every re-render
        if (window.isMobileView?.() && typeof window._mobileChannelPatch === 'function') window._mobileChannelPatch();
        document.querySelectorAll('.channel-item').forEach(el => {
            el.addEventListener('click', () => {
                // Instant visual highlight — don't wait for loadChatsList() re-render
                document.querySelectorAll('.channel-item').forEach(el2 => {
                    el2.style.backgroundColor = 'transparent';
                    el2.style.borderColor = 'transparent';
                    el2.style.fontWeight = 'normal';
                });
                el.style.backgroundColor = 'var(--bg-body)';
                el.style.borderColor = 'var(--border-color)';
                el.style.fontWeight = 'bold';

                window.currentRoom = el.dataset.room;
                localStorage.setItem('mpgs_current_room', el.dataset.room);
                // Clear unread for this room
                if (window.unreadCounts) window.unreadCounts[el.dataset.room] = 0;

                const titleSpan = document.getElementById('roomTitleDisplay');
                if (titleSpan) titleSpan.innerText = el.dataset.name;

                // Update header chip — member count for groups, online status for DMs
                const chip = document.getElementById('memberCountChip');
                if (chip) {
                    const roomId = el.dataset.room;
                    if (!roomId.startsWith('dm_')) {
                        const members = JSON.parse(localStorage.getItem('dept_members_' + roomId) || 'null');
                        const count = Array.isArray(members) ? members.length : (window.globalUsersCache?.length || 0);
                        chip.textContent = count + ' members';
                        chip.style.background = 'var(--accent-muted,rgba(99,102,241,0.1))';
                        chip.style.color = 'var(--accent)';
                        chip.style.display = '';
                    } else {
                        // DM — show the other user's online/last-seen status
                        const otherId = roomId.replace('dm_', '').split('_').find(id => id !== window.currentUser.id);
                        const other = (window.globalUsersCache || []).find(u => u.id === otherId);
                        const pres = window.getPresenceStatus?.(other?.last_seen) || { online: false, label: '' };
                        if (pres.label) {
                            chip.textContent = (pres.online ? '🟢 ' : '') + pres.label;
                            chip.style.background = pres.online ? 'rgba(34,197,94,0.12)' : 'transparent';
                            chip.style.color = pres.online ? '#16a34a' : 'var(--text-secondary)';
                            chip.style.display = '';
                        } else {
                            chip.style.display = 'none';
                        }
                    }
                }

                // Clear typing indicator when switching rooms
                const typingBar = document.getElementById('webTypingBar');
                if (typingBar) { typingBar.style.display = 'none'; typingBar.textContent = ''; }

                // Show spinner only if no cache — otherwise old messages stay until new ones render
                const hasCached = !!localStorage.getItem('msgcache_' + el.dataset.room);
                const shell = document.getElementById('chatShellContainer');
                if (shell && !hasCached) {
                    shell.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style="color:var(--text-secondary);"></i><p class="text-sm font-medium" style="color:var(--text-secondary);">Loading chat...</p></div>';
                }

                // Defer sidebar rebuild so it doesn't race with the synchronous cache render
                setTimeout(() => window.loadChatsList(), 0);

                if (typeof window.loadMessages === 'function') window.loadMessages();
            });
        });
    }
};

// ─── DM ROOM KEY HELPER ────────────────────────────────────────────────────
// Both sides of a DM must use the same room key.
// We use "dm_<smaller_uuid>_<larger_uuid>" so it's identical for both users.
window.getDmRoomId = function(otherUserId) {
    const me = window.currentUser.id;
    const ids = [me, otherUserId].sort();
    return `dm_${ids[0]}_${ids[1]}`;
};

// Exact DM-participant check. Room ids are dm_<uuid>_<uuid>; split on '_' so a
// user id can only match a full participant segment (no substring false matches).
window.isDmParticipant = function(roomId) {
    return typeof roomId === 'string'
        && roomId.startsWith('dm_')
        && roomId.split('_').includes(window.currentUser?.id);
};

// ─── SOUNDS ────────────────────────────────────────────────────────────────
window._soundLastPlayed = {};
// Global mute helpers — respected by sound, vibration, and notifications.
window._isDND      = () => localStorage.getItem('mpgs_dnd') === '1';
window._isSoundOff = () => localStorage.getItem('mpgs_sound_off') === '1';
window.playSound = function(type) {
    if (window._isDND() || window._isSoundOff()) return;
    if (type === 'message' && localStorage.getItem('mpgs_mute_incoming') === '1') return;
    if (type !== 'message' && localStorage.getItem('mpgs_mute_outgoing') === '1') return;
    const now = Date.now();
    // Debounce: same sound can't fire more than once per 2 seconds
    if (window._soundLastPlayed[type] && now - window._soundLastPlayed[type] < 2000) return;
    window._soundLastPlayed[type] = now;
    const urls = {
        message: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/just-saying-593.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMvanVzdC1zYXlpbmctNTkzLm1wMyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODEyNzg2ODgsImV4cCI6MTkzODk1ODY4OH0.NIpeQ5KadtgFTs4isNicayCmXoTcWWHFu2m3mS-9Txs',
        reminder: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/when-604.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMvd2hlbi02MDQubXAzIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTI3ODc0MCwiZXhwIjoxOTM4OTU4NzQwfQ.Ic5nmchKsn-dVPkRjQiJ8tRavAUCvPgbpQ4xiwu6RCk',
        task: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/youve-been-informed-345.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMveW91dmUtYmVlbi1pbmZvcm1lZC0zNDUubXAzIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTI3ODc5OSwiZXhwIjoxOTM4OTU4Nzk5fQ.w1dP5ECmZNfoGbD8fBSZBfnlJUeeQkdX7z3-bDv-Vbk'
    };
    const url = urls[type];
    if (!url) return;
    try {
        const audio = new Audio(url);
        audio.volume = 0.6;
        audio.play().catch(() => {}); // ignore autoplay block
    } catch (e) {}
};

// ─── DEBOUNCED loadTasksForPanel ────────────────────────────────────────────
let _taskPanelTimer = null;
window.debouncedLoadTasks = function() {
    clearTimeout(_taskPanelTimer);
    _taskPanelTimer = setTimeout(() => {
        if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
    }, 600); // 600ms — absorbs rapid multi-assignee bursts
};

// ─── SUBSCRIPTIONS ─────────────────────────────────────────────────────────
window.startSubscriptions = async function() {
    if (messageSubscription) messageSubscription.unsubscribe();
    messageSubscription = sb.channel('public:messages-' + window.currentTenantId)
        .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages', filter:'tenant_id=eq.'+window.currentTenantId}, async (p) => {
            // Tenant isolation guard — never react to another tenant's message even
            // if the server-side filter is bypassed (shared room ids like 'general').
            if (p.new?.tenant_id && p.new.tenant_id !== window.currentTenantId) return;
            logger.logRealtime('msg:INSERT', { id: p.new?.id, room: p.new?.room_id });
            const incomingRoom = p.new.room_id;
            const isMine = p.new.sender_id === window.currentUser?.id;

            if (incomingRoom === window.currentRoom) {
                // Skip full reload for own messages — optimistic row already in DOM
                if (!isMine && typeof window.loadMessages === 'function') window.loadMessages();
                if (!isMine) {
                    window.playSound('message');
                    if (typeof window.triggerMessageNotification === 'function')
                        window.triggerMessageNotification(p.new);
                }
            } else {
                // Ignore DMs the current user is not a participant of — no unread, no toast/chime, no notification.
                const isDmForMe = !incomingRoom.startsWith('dm_') || window.isDmParticipant(incomingRoom);

                // Only count real receipts (not own sends), and let mobile own its
                // own unread accounting (it tracks the actually-open chat, not window.currentRoom).
                if (isDmForMe && !isMine && !window.isMobileView?.()) {
                    window.unreadCounts = window.unreadCounts || {};
                    window.unreadCounts[incomingRoom] = (window.unreadCounts[incomingRoom] || 0) + 1;
                }

                // On mobile, mobile.js `_onNewMessage` owns notifications + bell; running
                // this web path too double-counts (most visible on DMs). Skip on mobile.
                if (!isMine && isDmForMe && !window.isMobileView?.()) {
                    if (typeof window.triggerMessageNotification === 'function')
                        window.triggerMessageNotification(p.new);

                    // ── Insert into notifications table (powers the bell badge) ──
                    // Deduplicate by message_id to prevent double entries
                    try {
                        const { count } = await sb.from('notifications')
                            .select('id', { count: 'exact', head: true })
                            .eq('user_id', window.currentUser.id)
                            .eq('message_id', p.new.id);
                        if (!count) {
                            const sender = window.globalUsersCache?.find(u => u.id === p.new.sender_id);
                            const name   = window.toSentenceCase?.(sender?.full_name || sender?.email?.split('@')[0] || 'Someone') || 'Someone';
                            const room   = window.getRoomDisplayName?.(incomingRoom) || incomingRoom;
                            const text   = (window.stripHtml?.(p.new.text) || '').substring(0, 80);
                            const msg    = incomingRoom.startsWith('dm_')
                                ? '💬 ' + name + ': ' + text
                                : name + ' in ' + room + ': ' + text;
                            await sb.from('notifications').insert({
                                user_id:    window.currentUser.id,
                                type:       'message',
                                message:    msg,
                                message_id: p.new.id,
                                tenant_id:  window.currentTenantId,
                                is_read:    false
                            });
                        }
                    } catch(e) { /* notification insert failed — non-fatal */ }
                    // Increment badge instantly — no DB read needed
                    window._incrementBellBadge?.();
                }
                if (typeof window.loadChatsList === 'function') window.loadChatsList();
                if (window.isDmParticipant(incomingRoom) && !isMine)
                    window.playSound('message');
            }
            if (window._activityFeedOpen && typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        }).subscribe();

    // Reactions real-time via BROADCAST — works instantly, zero schema requirements.
    // No reactions table needed. All connected users receive the reaction immediately.
    if (window._reactionsBroadcast) {
        try { window._reactionsBroadcast.unsubscribe(); } catch(e) {}
    }
    // ─── Named broadcast handlers (reused by legacy + shared cross-platform channels) ───
    window._onBcReactionAdd = function(p) {
        if (p && p.user_id !== window.currentUser.id && (!p.tenant_id || p.tenant_id === window.currentTenantId)) {
            if (typeof window.applyReactionDOM === 'function') {
                window.applyReactionDOM(p.message_id, p.value, p.type, p.user_id);
            }
        }
    };
    window._onBcReactionRemove = function(p) {
        if (p && p.user_id !== window.currentUser.id && (!p.tenant_id || p.tenant_id === window.currentTenantId)) {
            const footer = document.getElementById('footer-' + p.message_id);
            if (!footer) return;
            const chip = footer.querySelector(`[data-emoji="${p.value}"]`);
            const tag  = footer.querySelector(`[data-tag="${p.value}"]`);
            if (chip) {
                const cnt = chip.querySelector('.e-cnt');
                const current = parseInt(cnt?.textContent || '1');
                if (current > 1) { if (cnt) cnt.textContent = current - 1; }
                else chip.remove();
            }
            if (tag) tag.remove();
            if (window.reactionsCache?.[p.message_id]) {
                const cache = window.reactionsCache[p.message_id];
                const idx = cache.findIndex(r => r.value === p.value && r.user_id === p.user_id);
                if (idx !== -1) {
                    if ((cache[idx].count || 1) > 1) cache[idx].count--;
                    else cache.splice(idx, 1);
                }
            }
        }
    };
    window._onBcGroupPhoto = function(payload) {
        if (payload?.room_id) {
            localStorage.removeItem('dept_photo_' + payload.room_id);
            localStorage.removeItem('dept_photo_ts_' + payload.room_id);
            if (payload.name) _webLsSet('dept_name_' + payload.room_id, payload.name);
            if (typeof window.loadChatsList === 'function') window.loadChatsList();
        }
    };
    window._onBcTyping = function(payload) {
        if (!payload || payload.uid === window.currentUser?.id) return;
        if (payload.room !== window.currentRoom) return;
        const bar = document.getElementById('webTypingBar');
        if (!bar) return;
        bar.textContent = (payload.name || 'Someone') + ' is typing…';
        bar.style.display = 'block';
        clearTimeout(window._webTypingTimer);
        window._webTypingTimer = setTimeout(() => {
            bar.style.display = 'none'; bar.textContent = '';
        }, 3000);
    };

    // Legacy web-only channel — now tenant-scoped so reactions / typing / group-photo
    // broadcasts never cross tenants (reactions also propagate via the tenant-scoped
    // shared channel below, so same-tenant delivery is unaffected).
    window._reactionsBroadcast = sb.channel('mpgs-reactions-v1-' + window.currentTenantId);
    window._reactionsBroadcast
        .on('broadcast', { event: 'reaction' }, ({ payload }) => window._onBcReactionAdd(payload))
        .on('broadcast', { event: 'reaction_remove' }, ({ payload }) => window._onBcReactionRemove(payload))
        .on('broadcast', { event: 'group_photo' }, ({ payload }) => window._onBcGroupPhoto(payload))
        .on('broadcast', { event: 'typing' }, ({ payload }) => window._onBcTyping(payload))
        .subscribe();

    // Shared cross-platform channel (mobile ↔ web) — v33. Ignore src:'w' (own platform,
    // already delivered via the legacy channel). Reaction uses a single event with isDelete flag.
    window._sharedBroadcast = sb.channel('taskflow-bc-' + window.currentTenantId, { config: { broadcast: { self: false } } });
    window._sharedBroadcast
        .on('broadcast', { event: 'reaction' }, ({ payload: p }) => {
            if (!p || p.src === 'w') return;
            if (p.isDelete) window._onBcReactionRemove(p); else window._onBcReactionAdd(p);
        })
        .on('broadcast', { event: 'group_photo' }, ({ payload: p }) => { if (!p || p.src === 'w') return; window._onBcGroupPhoto(p); })
        .on('broadcast', { event: 'typing' }, ({ payload: p }) => { if (!p || p.src === 'w') return; window._onBcTyping(p); })
        .subscribe();

    // Scheduled messages: notify sender when status changes to 'sent'
    let scheduledSubscription = null;
    if (scheduledSubscription) scheduledSubscription.unsubscribe();
    scheduledSubscription = sb.channel('scheduled-changes')
        .on('postgres_changes', {event:'UPDATE', schema:'public', table:'scheduled_messages'}, (p) => {
            // Check sender_id manually since Supabase RT filter on UPDATE is unreliable
            if (p.new.status === 'sent' && p.new.sender_id === window.currentUser.id) {
                const msg = window.stripHtml ? window.stripHtml(p.new.message_text) : p.new.message_text;
                const preview = msg.substring(0, 60);
                window.showCenterToast('📨 Scheduled: ' + preview, 'fa-solid fa-clock', 'text-blue-400');
                window.playSound('message');
                // Notify all room members that a scheduled message was posted
                if (typeof window.notifyGroupMembers === 'function') {
                    const sched = p.new;
                    window.notifyGroupMembers(
                        sched.room_id,
                        sched.sender_id,
                        '📅 Scheduled message: ' + preview,
                        sched.id,
                        'scheduled'
                    );
                }
                if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
                // Also reload messages if the scheduled message is for current room
                if (p.new.room_id === window.currentRoom && typeof window.loadMessages === 'function') {
                    window.loadMessages();
                }
            }
        }).subscribe();

    if (taskSubscription) taskSubscription.unsubscribe();
    taskSubscription = sb.channel('tasks-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'tasks'}, () => {
            window.debouncedLoadTasks();
        }).subscribe();

    if (assigneeSubscription) assigneeSubscription.unsubscribe();
    assigneeSubscription = sb.channel('assignees-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'task_assignees'}, () => {
            window.debouncedLoadTasks();
        }).subscribe();

    if (trailSubscription) trailSubscription.unsubscribe();
    trailSubscription = sb.channel('trails-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'task_trails'}, () => {
            window.debouncedLoadTasks();
            // Refresh activity feed if open
            if (window._activityFeedOpen && typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        }).subscribe();

    if (notificationSubscription) notificationSubscription.unsubscribe();
    notificationSubscription = sb.channel('notifications-changes')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${window.currentUser.id}`
        }, (payload) => {
            const n   = payload.new;
            const msg = window.stripHtml ? window.stripHtml(n.message) : n.message;
            const type = n.type || 'general';

            // Real-time prepend to activity feed if open
            if (typeof window.prependFeedItem === 'function') window.prependFeedItem(n);

            const toastConfig = {
                reminder:  { icon:'fa-solid fa-stopwatch',       color:'text-purple-400', sound:'reminder' },
                task:      { icon:'fa-solid fa-clipboard-check', color:'text-blue-400',   sound:'task'     },
                message:   { icon:'fa-solid fa-comment',         color:'text-green-400',  sound:'message'  },
                reply:     { icon:'fa-solid fa-reply',           color:'text-indigo-400', sound:'message'  },
                reaction:  { icon:'fa-solid fa-heart',           color:'text-pink-400',   sound:'message'  },
                scheduled: { icon:'fa-solid fa-clock',           color:'text-yellow-400', sound:'message'  },
                general:   { icon:'fa-solid fa-bell',            color:'text-yellow-400', sound:'task'     },
            };
            const cfg = toastConfig[type] || toastConfig.general;
            window.showCenterToast(msg.substring(0, 100), cfg.icon, cfg.color);
            window.playSound(cfg.sound);
            if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
            window.animateBell?.();
            if (window._activityFeedOpen && typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        }).subscribe();

    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();

    // ── Seed the bell badge from existing unread notifications on load ──
    // (_bellCount starts at 0 and is only incremented, so pre-existing unread would never show.)
    try {
        const { count } = await sb.from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', window.currentUser.id)
            .eq('tenant_id', window.currentTenantId)
            .eq('is_read', false);
        if (count && count > 0) window._setBellBadge?.(count);
    } catch(e) { /* non-fatal */ }

    // ── Presence heartbeat (v33) — mirror mobile so web users show as online in DM headers ──
    if (!window._webHeartbeat) {
        const beat = () => {
            if (!window.currentUser?.id) return;
            sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', window.currentUser.id).then(() => {});
        };
        beat();
        window._webHeartbeat = setInterval(beat, 60000);
    }
};

// ── Presence helper (v33) — online status text from last_seen (parity with mobile) ──
window.getPresenceStatus = function(lastSeen) {
    if (!lastSeen) return { online: false, label: '' };
    const diffMin = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    if (diffMin < 3)  return { online: true,  label: 'Online' };
    if (diffMin < 60) return { online: false, label: `Last seen ${Math.round(diffMin)}m ago` };
    if (diffMin < 1440) return { online: false, label: `Last seen ${Math.round(diffMin/60)}h ago` };
    return { online: false, label: `Last seen ${Math.round(diffMin/1440)}d ago` };
};

// Bell animation — pulses until user clicks it


// ─── FILTER/SORT PILL HELPERS ─────────────────────────────────────────────
window.setTaskFilter = function(val) {
    const sel = document.getElementById('taskFilter');
    if (sel) sel.value = val;
    document.querySelectorAll('.filter-pill[data-filter]').forEach(p => p.classList.toggle('fp-active', p.dataset.filter === val));
    const dr = document.getElementById('dateRangeFilter');
    if (dr) { if (val === 'date_range') dr.classList.remove('hidden'); else dr.classList.add('hidden'); }
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};
window.setTaskSort = function(val) {
    const sel = document.getElementById('taskSort');
    if (sel) sel.value = val;
    document.querySelectorAll('.filter-pill[data-sort]').forEach(p => p.classList.toggle('fp-active', p.dataset.sort === val));
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

// ─── SCROLL ARROWS ─────────────────────────────────────────────────────────
window.initScrollArrows = function() {
    const mc = document.getElementById('messagesContainer');
    if (!mc || document.getElementById('scrollTopBtn')) return;
    // Append to .chat-area (position:relative) so buttons stay fixed in viewport, not scrolling with messages
    const chatArea = mc.closest('.chat-area') || mc.parentElement;
    const btnBase = (bottom) =>
        `position:absolute;right:12px;bottom:${bottom};z-index:10;width:30px;height:30px;` +
        `border-radius:50%;border:1px solid var(--border-color);display:flex;align-items:center;` +
        `justify-content:center;cursor:pointer;transition:opacity .2s;box-shadow:0 2px 8px rgba(0,0,0,0.18);`;
    // Down arrow → scroll to latest (bottom)
    const btnDown = document.createElement('button');
    btnDown.id = 'scrollTopBtn';
    btnDown.style.cssText = btnBase('72px') + 'background:var(--accent);color:#fff;opacity:0.7;';
    btnDown.innerHTML = '<i class="fa-solid fa-chevron-down" style="font-size:11px;"></i>';
    btnDown.title = 'Go to latest messages';
    btnDown.onclick = () => mc.scrollTo({top:mc.scrollHeight, behavior:'smooth'});
    // Up arrow → scroll to oldest (top)
    const btnUp = document.createElement('button');
    btnUp.id = 'scrollBotBtn';
    btnUp.style.cssText = btnBase('110px') + 'background:var(--bg-sidebar);color:var(--text-secondary);opacity:0.7;';
    btnUp.innerHTML = '<i class="fa-solid fa-chevron-up" style="font-size:11px;"></i>';
    btnUp.title = 'Go to oldest messages';
    btnUp.onclick = () => mc.scrollTo({top:0, behavior:'smooth'});
    chatArea.appendChild(btnDown);
    chatArea.appendChild(btnUp);
    const updateArrows = () => {
        const atTop = mc.scrollTop < 10;
        const atBot = mc.scrollHeight - mc.scrollTop - mc.clientHeight < 10;
        btnDown.style.opacity = atBot ? '0.3' : '0.85';
        btnUp.style.opacity = atTop ? '0.3' : '0.85';
    };
    mc.addEventListener('scroll', updateArrows, { passive: true });
    setTimeout(updateArrows, 500);
};

// ─── ROOM DISPLAY NAME RESOLVER ────────────────────────────────────────────
window.getRoomDisplayName = function(roomId) {
    if (!roomId) return 'Chat';
    if (roomId.startsWith('dm_')) {
        if (!window.globalUsersCache?.length) return 'Direct Message';
        const withoutPrefix = roomId.replace('dm_', '');
        const other = window.globalUsersCache.find(u => u.id !== window.currentUser?.id && withoutPrefix.includes(u.id));
        if (other) return window.toSentenceCase?.(other.full_name || other.email?.split('@')[0]) || 'Direct Message';
        return 'Direct Message';
    }
    // Check localStorage for custom name set via group settings
    const stored = _webLsGet('dept_name_' + roomId);
    if (stored) return stored;
    // Fallback: capitalise roomId
    return roomId.charAt(0).toUpperCase() + roomId.slice(1).replace(/_/g,' ');
};

// Boot Sequence
;(async() => {
    const {data: {session}} = await sb.auth.getSession();
    if (!session) {
        // No stored session — show login screen
        if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
        return;
    }

    // Session exists — must load tenant context before rendering anything
    window.currentUser = session.user;

    if (typeof window.loadTenantContext === 'function') {
        const loaded = await window.loadTenantContext();
        if (!loaded) {
            // Stored session but no school setup — go to signup to complete
            if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
            window.showCenterToast(
                'Please complete your school registration first.',
                'fa-solid fa-school', 'text-yellow-400'
            );
            setTimeout(() => { window.location.href = './signup.html'; }, 2000);
            return;
        }
    }

    // Arm logger Supabase sync — must run after every page load (not just on signIn)
    // because signIn redirects away before the flush timer can run
    if (window.logger?.init && window.currentUser && window.currentTenantId) {
        window.logger.init(sb, { userId: window.currentUser.id, tenantId: window.currentTenantId });
    }

    // Cache tenant_id in session config so app.get_current_tenant_id() reads a variable
    // instead of querying profiles on every row — makes messages.select ~13× faster
    if (window.currentTenantId) {
        try { await sb.rpc('set_current_tenant_id', { tenant_id: window.currentTenantId }); } catch {}
    }

    // Route by role
    // ?mode=chat lets principal bypass admin panel and access chat directly
    const chatMode = new URLSearchParams(window.location.search).get('mode') === 'chat';
    if (window.currentPermissions?.admin_panel && !chatMode) {
        window.location.href = '/admin.html';
        return;
    }
    if (typeof window.renderMainApp === 'function') window.renderMainApp();
    if (typeof window.startSubscriptions === 'function') window.startSubscriptions();
    if (typeof window.initScrollArrows === 'function') window.initScrollArrows();
    // Refresh the tenant's admin-configured quick-reply tags (DB → localStorage).
    if (typeof window.syncQuickTags === 'function') window.syncQuickTags();
    // Apply RBAC after render — hides/shows elements by role + feature flags
    if (typeof window.applyRBAC === 'function') window.applyRBAC();

    // Re-register background push for resumed sessions (no prompt; only if already granted).
    if (typeof window.subscribeToPush === 'function') window.subscribeToPush();

    // Deep-link from a push tap (?room=…) or SW message — open that chat (desktop; mobile handles its own).
    const _openWebRoom = (room) => {
        if (!room || window.isMobileView?.()) return;
        window.currentRoom = room;
        try { localStorage.setItem('mpgs_current_room', room); } catch (e) {}
        window.loadMessages?.();
        window.loadChatsList?.();
    };
    try {
        const _room = new URLSearchParams(location.search).get('room');
        if (_room) { history.replaceState({}, '', location.pathname); _openWebRoom(_room); }
        navigator.serviceWorker?.addEventListener('message', (e) => {
            if (e.data?.type === 'open-room') _openWebRoom(e.data.room);
        });
    } catch (e) {}

    // Re-apply mobile layout on orientation change
    window.addEventListener('resize', () => {
        if (typeof window.initMobile === 'function') window.initMobile();
    }, { passive: true });
})();
