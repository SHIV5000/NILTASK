/**
 * ui-settings.js — MPGS TaskFlow
 * ─────────────────────────────────────────────────────────────────────────────
 * Profile Settings, Group/Department Settings, Task-creation modal, Link Pill.
 * Depends on: ui-core.js, ui-panels.js
 *
 * Functions: openSettings, saveSettings, previewSettingsPhoto (profile photo),
 *            openGroupSettings, saveGroupSettings, selectGroupColor (groups),
 *            openTaskModal, closeTaskModal, filterAssignees (task modal),
 *            openLinkModal, closeLinkModal, insertLinkPill (link pill)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';
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

window.openSettings = async function() {
    const modal = document.getElementById('settingsModal'); if (!modal) return;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', window.currentUser.id).eq('tenant_id', window.currentTenantId).single();
    document.getElementById('settingsName').value = profile?.full_name || window.currentUser?.user_metadata?.full_name || '';
    const desigEl = document.getElementById('settingsDesignation'); if (desigEl) desigEl.value = profile?.designation || '';
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
    // Set mute toggles from localStorage
    const muteInEl = document.getElementById('muteIncoming');
    const muteOutEl = document.getElementById('muteOutgoing');
    if (muteInEl) muteInEl.checked = localStorage.getItem('mpgs_mute_incoming') === '1';
    if (muteOutEl) muteOutEl.checked = localStorage.getItem('mpgs_mute_outgoing') === '1';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    // Add change password link if not already present
    if (!document.getElementById('pwdChangeLink')) {
        const link = document.createElement('button');
        link.id = 'pwdChangeLink';
        link.style.cssText = 'width:100%;text-align:center;padding:7px;font-size:12px;font-weight:600;color:var(--text-secondary);background:none;border:1px solid var(--border-color);border-radius:10px;cursor:pointer;margin-top:8px;';
        link.innerHTML = '<i class="fa-solid fa-key" style="margin-right:6px;color:var(--accent);"></i>Change Password';
        link.onclick = window.openChangePassword;
        modal.querySelector('form, div.modal-content, div')?.appendChild(link);
        // Fallback: append to modal directly
        if (!modal.querySelector('#pwdChangeLink')?.parentNode) modal.appendChild(link);
    }
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

    // Compress and encode photo — crops to 200×200 JPEG (~10-15KB) to fit in DB text column
    if (photoInput?.files?.[0]) {
        const file = photoInput.files[0];
        avatarDataUrl = await new Promise(resolve => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 200;
                const ctx = canvas.getContext('2d');
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, 200, 200);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = url;
        });
        localStorage.setItem('mpgs_avatar_' + window.currentUser.id, avatarDataUrl);
    }

    // Update Supabase auth metadata — also refreshes window.currentUser
    await sb.auth.updateUser({ data: { full_name: name } });
    try { const { data: { user } } = await sb.auth.getUser(); if (user) window.currentUser = user; } catch(e) {}

    // Update profiles table — log errors so avatar failures are visible in DevTools
    const desig = document.getElementById('settingsDesignation')?.value?.trim() || '';
    try { await sb.from('profiles').update({ full_name: name, designation: desig }).eq('id', window.currentUser.id); } catch(e) { console.error('[settings] profile name update failed:', e); }
    if (avatarDataUrl) {
        const { error: avatarErr } = await sb.from('profiles').update({ avatar_url: avatarDataUrl }).eq('id', window.currentUser.id);
        if (avatarErr) console.error('[settings] avatar_url save failed:', avatarErr.message, '— avatar may not be visible to others');
    }

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

    // Save mute preferences
    const muteIn = document.getElementById('muteIncoming');
    const muteOut = document.getElementById('muteOutgoing');
    if (muteIn) localStorage.setItem('mpgs_mute_incoming', muteIn.checked ? '1' : '0');
    if (muteOut) localStorage.setItem('mpgs_mute_outgoing', muteOut.checked ? '1' : '0');
    window.showCenterToast('Profile saved ✓','fa-solid fa-check-circle','text-green-400');
    window.closeSettings();
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
}

window.saveGroupSettings = async function() {
    const gid  = document.getElementById('groupSettingsId')?.value;
    const name = document.getElementById('groupSettingsName')?.value.trim();
    if (!gid || !name) { window.showCenterToast('Name cannot be empty','fa-solid fa-times','text-red-500'); return; }

    localStorage.setItem('dept_name_' + gid, name);

    // Save photo — upload to task-proofs bucket (private, signed URLs, cross-device)
    const pendingPhoto = window._gsPendingPhoto || null;
    if (pendingPhoto) {
        window._gsPendingPhoto = null;
        try {
            const blob = await fetch(pendingPhoto).then(r => r.blob());
            const path = `group-photos/${window.currentTenantId}/${gid}.jpg`;
            const { error: upErr } = await sb.storage.from('task-proofs').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
            if (upErr) {
                console.error('[group-photo] upload failed:', upErr.message);
                window.showCenterToast('Photo saved locally only — storage error', 'fa-solid fa-triangle-exclamation', 'text-yellow-400');
                localStorage.setItem('dept_photo_' + gid, pendingPhoto);
            } else {
                const { data: sd } = await sb.storage.from('task-proofs').createSignedUrl(path, 3600);
                const photoUrl = sd?.signedUrl || '';
                if (photoUrl) {
                    localStorage.setItem('dept_photo_' + gid, photoUrl);
                    localStorage.setItem('dept_photo_ts_' + gid, String(Date.now()));
                    localStorage.removeItem('dept_photo_none_' + gid); // clear "no photo" flag
                }
                // Broadcast room_id only — receivers fetch their own signed URL on next load
                if (window._reactionsBroadcast) {
                    try {
                        window._reactionsBroadcast.send({
                            type: 'broadcast', event: 'group_photo',
                            payload: { room_id: gid, name }
                        });
                    } catch(e) {}
                }
            }
        } catch(e) { console.error('[group-photo] storage upload failed:', e); }
    }

    // Save member + admin selections
    const memberIds = Array.from(document.querySelectorAll('.group-member-cb:checked')).map(cb => cb.dataset.uid);
    const adminIds  = Array.from(document.querySelectorAll('.group-admin-cb:checked')).map(cb => cb.dataset.uid);
    localStorage.setItem('dept_members_' + gid, JSON.stringify(memberIds));
    localStorage.setItem('dept_admins_'  + gid, JSON.stringify(adminIds));

    if (window.currentRoom === gid) {
        const t = document.getElementById('roomTitleDisplay');
        if (t) t.innerText = name;
    }
    window.closeGroupSettings();
    window.showCenterToast('Department settings saved ✓','fa-solid fa-check-circle','text-green-400');
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
};

window.openGroupSettings = async function(groupId) {
    const gid = groupId || window.currentRoom;
    if (!gid || gid.startsWith('dm_')) return;

    const modal = document.getElementById('groupSettingsModal');
    if (!modal) return;

    const deptDefaults = { general:'General', math:'Mathematics', science:'Science', leadership:'Leadership' };
    const currentName  = localStorage.getItem('dept_name_' + gid) || deptDefaults[gid] || (gid.charAt(0).toUpperCase() + gid.slice(1));
    const currentPhoto = localStorage.getItem('dept_photo_' + gid) || '';

    document.getElementById('groupSettingsId').value = gid;
    document.getElementById('groupSettingsName').value = currentName;
    window._gsPendingPhoto = null;

    // Restore photo or icon in the thumbnail
    const wrap = document.getElementById('gsPhotoWrap');
    const icon = document.getElementById('gsPhotoIcon');
    if (currentPhoto) {
        if (wrap) wrap.style.background = `url(${currentPhoto}) center/cover`;
        if (icon) icon.style.display = 'none';
    } else {
        const col = localStorage.getItem('dept_color_' + gid) || '#6366f1';
        if (wrap) wrap.style.background = col;
        if (icon) icon.style.display = '';
    }

    // Members list
    const memberList = document.getElementById('groupMembersList');
    if (memberList) {
        let users = window.globalUsersCache || [];
        if (!users.length) {
            try {
                const { data } = await sb.from('profiles').select('id, full_name, email, designation, avatar_url').eq('tenant_id', window.currentTenantId);
                users = data || [];
                if (users.length) window.globalUsersCache = users;
            } catch(e) {}
        }
        const savedMembers = JSON.parse(localStorage.getItem('dept_members_' + gid) || '[]');
        const savedAdmins  = JSON.parse(localStorage.getItem('dept_admins_'  + gid) || '[]');

        memberList.innerHTML = users.length ? users.map(u => {
            const uname    = window.toSentenceCase?.(u.full_name || u.email?.split('@')[0]) || u.email || '?';
            const isMember = savedMembers.length === 0 || savedMembers.includes(u.id);
            const isAdmin  = savedAdmins.includes(u.id);
            const isMe     = u.id === window.currentUser?.id;
            const init     = uname.charAt(0).toUpperCase();
            const photoStyle = u.avatar_url
                ? `background:url('${u.avatar_url}') center/cover;color:transparent;`
                : 'background:var(--accent);';
            return `<div class="flex items-center gap-2 p-2 border-b last:border-b-0" style="border-color:var(--border-color);">
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0" style="${photoStyle}">${u.avatar_url?'':init}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold truncate" style="color:var(--text-primary);">${window.escapeHtml(uname)}${isMe?' <span style="color:#6366f1;font-size:9px;">(You)</span>':''}</div>
                    ${u.designation?`<div class="text-[10px] truncate" style="color:var(--text-secondary);">${window.escapeHtml(u.designation)}</div>`:''}
                </div>
                <label class="flex items-center gap-1 cursor-pointer" style="color:var(--text-secondary);">
                    <input type="checkbox" class="group-member-cb" data-uid="${u.id}" ${isMember?'checked':''}>
                    <span class="text-[9px] font-bold">Member</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer" style="color:#f59e0b;">
                    <input type="checkbox" class="group-admin-cb" data-uid="${u.id}" ${isAdmin?'checked':''}>
                    <span class="text-[9px] font-bold">Admin</span>
                </label>
            </div>`;
        }).join('') : '<p class="text-xs italic p-3" style="color:var(--text-secondary);">No members found.</p>';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeGroupSettings = function() {
    const modal = document.getElementById('groupSettingsModal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};



// ─── CHANGE PASSWORD ──────────────────────────────────────────
// Staff self-service password change using Supabase auth.updateUser()
window.openChangePassword = function() {
    const existing = document.getElementById('changePwdSection');
    if (existing) {
        existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
        return;
    }

    // Insert change password section into settings modal
    const settingsModal = document.getElementById('settingsModal');
    if (!settingsModal) return;

    const section = document.createElement('div');
    section.id = 'changePwdSection';
    section.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color);';
    section.innerHTML = `
        <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
                   color:var(--text-secondary);margin:0 0 12px;">Change Password</h4>
        <div class="mb-3">
            <label class="block text-xs font-bold mb-1" style="color:var(--text-secondary);">New Password</label>
            <div style="position:relative;">
                <input id="newPwdInput" type="password" placeholder="Min 8 characters"
                    class="w-full px-3 py-2 rounded-lg border text-sm"
                    style="background:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);padding-right:40px;">
                <i class="fa-solid fa-eye" id="newPwdEye" onclick="window.toggleNewPwdEye()"
                   style="position:absolute;right:12px;top:50%;transform:translateY(-50%);
                          color:var(--text-secondary);cursor:pointer;"></i>
            </div>
        </div>
        <div class="mb-3">
            <label class="block text-xs font-bold mb-1" style="color:var(--text-secondary);">Confirm New Password</label>
            <input id="confirmPwdInput" type="password" placeholder="Repeat new password"
                class="w-full px-3 py-2 rounded-lg border text-sm"
                style="background:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
        </div>
        <div id="pwdChangeErr" style="color:#dc2626;font-size:12px;font-weight:600;display:none;
             padding:7px 12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca;margin-bottom:10px;"></div>
        <button onclick="window.saveNewPassword()"
            class="w-full py-2 rounded-xl text-white font-bold text-sm"
            style="background:var(--accent);" id="savePwdBtn">
            <i class="fa-solid fa-lock"></i> Update Password
        </button>`;

    settingsModal.appendChild(section);
};

window.toggleNewPwdEye = function() {
    const p = document.getElementById('newPwdInput');
    const i = document.getElementById('newPwdEye');
    if (!p) return;
    p.type = p.type === 'password' ? 'text' : 'password';
    i.className = p.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
};

window.saveNewPassword = async function() {
    const newPwd  = document.getElementById('newPwdInput')?.value  || '';
    const confirm = document.getElementById('confirmPwdInput')?.value || '';
    const errEl   = document.getElementById('pwdChangeErr');
    const btn     = document.getElementById('savePwdBtn');

    errEl.style.display = 'none';
    if (newPwd.length < 8)  { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display='block'; return; }
    if (newPwd !== confirm)  { errEl.textContent = 'Passwords do not match.';                 errEl.style.display='block'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

    const { error } = await sb.auth.updateUser({ password: newPwd });
    if (error) {
        errEl.textContent = 'Error: ' + error.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> Update Password';
        return;
    }

    // Success
    document.getElementById('newPwdInput').value    = '';
    document.getElementById('confirmPwdInput').value = '';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Update Password';
    document.getElementById('changePwdSection').style.display = 'none';
    window.showCenterToast('Password updated successfully ✓','fa-solid fa-check','text-green-500');
};
