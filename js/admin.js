/**
 * admin.js — MPGS TaskFlow Admin Panel VER 2.0.0
 * ─────────────────────────────────────────────────────────────
 * Principal / VP management: add staff, toggle approved, edit,
 * soft-delete, view school info and subscription status.
 * ─────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';

// ── SUPABASE PROJECT URL (needed to call Edge Function) ───────
const SUPABASE_URL = 'https://apfymygzwkzjhhgmtkaj.supabase.co';

// ─── BOOT ──────────────────────────────────────────────────────
;(async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/'; return; }

    window.currentUser = session.user;
    if (typeof window.loadTenantContext === 'function') {
        const loaded = await window.loadTenantContext();
        if (!loaded || !window.currentPermissions?.admin_panel) {
            window.location.href = '/';
            return;
        }
    }
    renderAdmin();
    await loadAdminData();
})();

// ─── RENDER SHELL ──────────────────────────────────────────────
function renderAdmin() {
    const schoolName = window.currentSchoolName || 'School';
    const userName   = window.currentUser?.user_metadata?.full_name
                    || window.currentUser?.email?.split('@')[0] || 'Admin';

    document.getElementById('adminRoot').innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:20px 16px;">

        <!-- Top bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">

            <!-- School badge -->
            <div class="school-badge" style="flex:1;min-width:220px;max-width:380px;">
                <div class="school-badge-name">${window.escapeHtml(schoolName)}</div>
                <div class="school-badge-sub">✦ &nbsp; Powered by TaskFlow &nbsp; ✦</div>
            </div>

            <!-- Right actions -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);">
                    <i class="fa-solid fa-user-shield" style="color:var(--accent);"></i>
                    ${window.escapeHtml(userName)}
                    <span style="font-size:10px;background:rgba(99,102,241,.1);color:#6366f1;padding:2px 8px;border-radius:20px;margin-left:4px;">${window.currentRoleName || 'Admin'}</span>
                </div>
                <button class="btn-outline btn-sm" onclick="window.location.href='/?mode=chat'">
                    <i class="fa-solid fa-comments"></i> Go to Chat
                </button>
                <button class="btn-outline btn-sm" onclick="window.logout?.()">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Logout
                </button>
            </div>
        </div>

        <!-- Trial / Subscription banner -->
        <div id="trialBanner" class="trial-banner" style="margin-bottom:20px;">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-star" style="color:#6366f1;font-size:16px;"></i>
            </div>
            <div style="flex:1;">
                <div id="planName" style="font-size:13px;font-weight:700;color:var(--text-primary);">Loading plan...</div>
                <div id="planSub" style="font-size:11px;color:var(--text-secondary);margin-top:2px;"></div>
            </div>
        </div>

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px;">
            <div class="stat-card">
                <div class="stat-icon" style="background:rgba(99,102,241,.1);">
                    <i class="fa-solid fa-users" style="color:#6366f1;font-size:18px;"></i>
                </div>
                <div>
                    <div class="stat-val" id="statTotal">—</div>
                    <div class="stat-lbl">Total Staff</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:rgba(22,163,74,.1);">
                    <i class="fa-solid fa-user-check" style="color:#16a34a;font-size:18px;"></i>
                </div>
                <div>
                    <div class="stat-val" id="statApproved">—</div>
                    <div class="stat-lbl">Approved</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:rgba(245,158,11,.1);">
                    <i class="fa-solid fa-user-clock" style="color:#f59e0b;font-size:18px;"></i>
                </div>
                <div>
                    <div class="stat-val" id="statPending">—</div>
                    <div class="stat-lbl">Pending</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon" style="background:rgba(239,68,68,.1);">
                    <i class="fa-solid fa-calendar-xmark" style="color:#ef4444;font-size:18px;"></i>
                </div>
                <div>
                    <div class="stat-val" id="statDays">—</div>
                    <div class="stat-lbl">Trial Days Left</div>
                </div>
            </div>
        </div>

        <!-- Staff management card -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;">

            <!-- Header row -->
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                    <h2 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0 0 2px;">Staff Management</h2>
                    <p style="font-size:11px;color:var(--text-secondary);margin:0;">Add, approve or remove staff members</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="text" id="staffSearch" placeholder="Search name or email..."
                        oninput="filterStaff(this.value)"
                        style="padding:8px 12px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:12px;outline:none;width:200px;">
                    <button class="btn-accent" onclick="openAddStaffModal()">
                        <i class="fa-solid fa-plus"></i> Add Staff
                    </button>
                </div>
            </div>

            <!-- Table -->
            <div style="overflow-x:auto;">
                <table class="staff-table">
                    <thead>
                        <tr>
                            <th>Staff Member</th>
                            <th>Role</th>
                            <th>Designation</th>
                            <th>Department</th>
                            <th>Approved</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="staffTableBody">
                        <tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary);">
                            <i class="fa-solid fa-spinner fa-spin"></i> Loading staff...
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Footer note -->
        <p style="text-align:center;font-size:11px;color:var(--text-secondary);margin-top:16px;">
            Staff login at <strong>niltask.vercel.app</strong> using their email and the password you set.
            They can change their password from Profile Settings.
        </p>
    </div>`;

    // Inject reset password modal (separate from add/edit modal)
    const resetModal = document.createElement('div');
    resetModal.id = 'resetPwdModal';
    resetModal.className = 'modal-wrap';
    resetModal.innerHTML = `
        <div class="modal-card" style="max-width:380px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <h3 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0;">
                    <i class="fa-solid fa-key" style="color:#f59e0b;margin-right:8px;"></i>Reset Password
                </h3>
                <button onclick="closeResetPwdModal()" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary);">✕</button>
            </div>
            <p id="resetPwdForName" style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;"></p>
            <div class="field">
                <label>New Password (min 8 characters)</label>
                <div style="position:relative;">
                    <input type="password" id="resetNewPwd" placeholder="Enter new password" style="padding-right:40px;">
                    <i class="fa-solid fa-eye" id="resetEye" onclick="toggleResetEye()"
                       style="position:absolute;right:13px;top:50%;transform:translateY(-50%);color:var(--text-secondary);cursor:pointer;"></i>
                </div>
            </div>
            <div class="err-msg" id="resetPwdErr"></div>
            <div style="display:flex;gap:10px;margin-top:8px;">
                <button class="btn-outline" style="flex:1;" onclick="closeResetPwdModal()">Cancel</button>
                <button class="btn-accent" style="flex:2;" id="resetPwdBtn" onclick="doResetPassword()">
                    <i class="fa-solid fa-key"></i> Reset Password
                </button>
            </div>
        </div>`;
    document.body.appendChild(resetModal);
}

// ─── LOAD DATA ────────────────────────────────────────────────
let allStaff = [];

async function loadAdminData() {
    await Promise.all([ loadSubscription(), loadStaff() ]);
}

async function loadSubscription() {
    const { data: sub } = await sb.from('subscriptions')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const planEl = document.getElementById('planName');
    const subEl  = document.getElementById('planSub');
    const daysEl = document.getElementById('statDays');

    if (!sub) {
        if (planEl) planEl.textContent = 'No subscription found';
        return;
    }

    const plan   = (sub.plan || 'trial').charAt(0).toUpperCase() + (sub.plan || 'trial').slice(1);
    const status = sub.status || 'trial';
    const colors = { trial:'#6366f1', active:'#16a34a', expired:'#dc2626', suspended:'#f59e0b' };
    const color  = colors[status] || '#6366f1';

    if (planEl) planEl.innerHTML = `<span style="color:${color};">${plan} Plan</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${color}18;color:${color};margin-left:8px;font-weight:700;">${status.toUpperCase()}</span>`;

    if (sub.trial_ends && status === 'trial') {
        const days = Math.max(0, Math.ceil((new Date(sub.trial_ends) - new Date()) / 86400000));
        if (subEl) subEl.textContent = `Trial ends: ${new Date(sub.trial_ends).toLocaleDateString('en-IN')} · ${days} days remaining`;
        if (daysEl) daysEl.textContent = days;
        if (days <= 7 && days > 0) {
            const banner = document.getElementById('trialBanner');
            if (banner) banner.style.borderColor = '#f59e0b';
        }
    } else {
        if (subEl) subEl.textContent = sub.billing_date ? `Next billing: ${new Date(sub.billing_date).toLocaleDateString('en-IN')}` : 'Contact developer for billing details';
        if (daysEl) daysEl.textContent = '∞';
    }
}

async function loadStaff() {
    const { data, error } = await sb.from('allowed_users')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (error) { console.error('loadStaff:', error); return; }

    allStaff = data || [];
    renderStaffTable(allStaff);
    updateStats(allStaff);
}

function updateStats(staff) {
    const total    = staff.length;
    const approved = staff.filter(s => s.approved).length;
    const pending  = total - approved;
    document.getElementById('statTotal')   .textContent = total;
    document.getElementById('statApproved').textContent = approved;
    document.getElementById('statPending') .textContent = pending;
}

function renderStaffTable(staff) {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    if (!staff.length) {
        tbody.innerHTML = `<tr><td colspan="6">
            <div style="padding:32px 24px;text-align:center;">
                <div style="width:56px;height:56px;border-radius:50%;background:rgba(var(--accent-rgb,.1));
                     display:flex;align-items:center;justify-content:center;margin:0 auto 14px;
                     background:rgba(99,102,241,.1);">
                    <i class="fa-solid fa-users" style="font-size:22px;color:var(--accent);"></i>
                </div>
                <h3 style="font-size:14px;font-weight:800;color:var(--text-primary);margin:0 0 6px;">
                    Welcome! Let's add your first staff member.
                </h3>
                <p style="font-size:12px;color:var(--text-secondary);margin:0 0 16px;max-width:320px;margin-left:auto;margin-right:auto;">
                    Add each teacher's name, email and a temporary password. They will login at
                    <strong>niltask.vercel.app</strong> and can change their password from settings.
                </p>
                <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
                    <button class="btn-accent" onclick="openAddStaffModal()" style="font-size:12px;padding:8px 18px;">
                        <i class="fa-solid fa-user-plus"></i> Add First Staff Member
                    </button>
                </div>
                <div style="margin-top:20px;background:var(--bg-body);border:1px solid var(--border-color);
                     border-radius:10px;padding:12px 16px;text-align:left;font-size:11px;
                     color:var(--text-secondary);max-width:400px;margin-left:auto;margin-right:auto;">
                    <div style="font-weight:700;color:var(--text-primary);margin-bottom:6px;">
                        <i class="fa-solid fa-circle-info" style="color:var(--accent);"></i> Quick steps
                    </div>
                    <div>1. Add staff → set role (Teacher / HOD / VP)</div>
                    <div>2. Share their email + password with them directly</div>
                    <div>3. Toggle <strong>Approved</strong> ON when they are ready to login</div>
                </div>
            </div>
        </td></tr>`;
        return;
    }

    const roleLabels = {
        principal:'principal', vp_admin:'vp_admin',
        exam_controller:'exam_controller', hod:'hod', teacher:'teacher'
    };
    const roleNames = {
        principal:'Principal', vp_admin:'VP / Admin',
        exam_controller:'Exam Controller', hod:'HOD', teacher:'Teacher'
    };
    const avatarColors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];

    tbody.innerHTML = staff.map((s, i) => {
        const roleKey = roleLabels[s.role] || 'teacher';
        const roleName = roleNames[s.role] || 'Teacher';
        const avColor = avatarColors[i % avatarColors.length];
        const initials = (s.full_name || 'U').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

        return `<tr id="row-${s.id}">
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="av" style="background:${avColor};">${initials}</div>
                    <div>
                        <div style="font-weight:700;font-size:13px;">${window.escapeHtml(s.full_name)}</div>
                        <div style="font-size:11px;color:var(--text-secondary);">${window.escapeHtml(s.email)}</div>
                    </div>
                </div>
            </td>
            <td><span class="role-pill role-${roleKey}">${roleName}</span></td>
            <td style="color:var(--text-secondary);font-size:12px;">${window.escapeHtml(s.designation || '—')}</td>
            <td style="color:var(--text-secondary);font-size:12px;">${window.escapeHtml(s.department || '—')}</td>
            <td>
                <label class="toggle" title="${s.approved ? 'Click to block' : 'Click to approve'}">
                    <input type="checkbox" ${s.approved ? 'checked' : ''} onchange="toggleApproval('${s.id}', ${s.approved})">
                    <span class="toggle-slider"></span>
                </label>
            </td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn-outline btn-sm" onclick="openEditStaffModal('${s.id}')" title="Edit">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-outline btn-sm" onclick="openResetPwdModal('${s.id}','${window.escapeHtml(s.full_name)}')" title="Reset Password" style="color:#f59e0b;border-color:#fde68a;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <button class="btn-danger" onclick="softDeleteStaff('${s.id}','${window.escapeHtml(s.full_name)}')" title="Remove">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─── SEARCH ───────────────────────────────────────────────────
window.filterStaff = function(term) {
    const t = term.toLowerCase();
    const filtered = !t ? allStaff : allStaff.filter(s =>
        s.full_name.toLowerCase().includes(t) ||
        s.email.toLowerCase().includes(t) ||
        (s.designation || '').toLowerCase().includes(t) ||
        (s.department  || '').toLowerCase().includes(t)
    );
    renderStaffTable(filtered);
};

// ─── ADD STAFF MODAL ─────────────────────────────────────────
window.openAddStaffModal = function() {
    document.getElementById('editUserId').value = '';
    document.getElementById('modalTitle').textContent = 'Add Staff Member';
    document.getElementById('saveStaffBtn').innerHTML = '<i class="fa-solid fa-user-plus"></i> Add Staff Member';
    document.getElementById('sfName').value   = '';
    document.getElementById('sfEmail').value  = '';
    document.getElementById('sfPassword').value = '';
    document.getElementById('sfRole').value   = 'teacher';
    document.getElementById('sfDept').value   = '';
    document.getElementById('sfDesig').value  = '';
    document.getElementById('passwordField').style.display = 'block';
    document.getElementById('sfEmail').disabled = false;
    document.getElementById('modalErr').style.display = 'none';
    document.getElementById('staffModal').classList.add('open');
};

window.openEditStaffModal = function(id) {
    const s = allStaff.find(x => x.id === id);
    if (!s) return;
    document.getElementById('editUserId').value   = id;
    document.getElementById('modalTitle').textContent = 'Edit Staff Member';
    document.getElementById('saveStaffBtn').innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
    document.getElementById('sfName').value   = s.full_name;
    document.getElementById('sfEmail').value  = s.email;
    document.getElementById('sfEmail').disabled = true;   // can't change email
    document.getElementById('sfPassword').value = '';
    document.getElementById('sfRole').value   = s.role;
    document.getElementById('sfDept').value   = s.department || '';
    document.getElementById('sfDesig').value  = s.designation || '';
    document.getElementById('passwordField').style.display = 'none'; // no pwd change in edit
    document.getElementById('modalErr').style.display = 'none';
    document.getElementById('staffModal').classList.add('open');
};

window.closeStaffModal = function() {
    document.getElementById('staffModal').classList.remove('open');
    document.getElementById('sfEmail').disabled = false;
};

window.togglePwdEye = function() {
    const p = document.getElementById('sfPassword');
    const i = document.getElementById('pwdEye');
    p.type = p.type === 'password' ? 'text' : 'password';
    i.className = p.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
};

// ─── SAVE STAFF ──────────────────────────────────────────────
window.saveStaff = async function() {
    const btn      = document.getElementById('saveStaffBtn');
    const errEl    = document.getElementById('modalErr');
    const editId   = document.getElementById('editUserId').value;
    const full_name   = document.getElementById('sfName').value.trim();
    const email       = document.getElementById('sfEmail').value.trim().toLowerCase();
    const password    = document.getElementById('sfPassword').value;
    const role        = document.getElementById('sfRole').value;
    const department  = document.getElementById('sfDept').value.trim();
    const designation = document.getElementById('sfDesig').value.trim();

    errEl.style.display = 'none';

    if (!full_name)                          { showErr('Name is required.');             return; }
    if (!editId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                                              { showErr('Enter a valid email.');          return; }
    if (!editId && password.length < 8)      { showErr('Password must be 8+ chars.');    return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
        if (editId) {
            // ── EDIT: update allowed_users only (no auth changes)
            const { error } = await sb.from('allowed_users')
                .update({ full_name, role, designation, department })
                .eq('id', editId)
                .eq('tenant_id', window.currentTenantId);
            if (error) throw new Error(error.message);

            // Also update profile if it exists
            await sb.from('profiles')
                .update({ full_name, designation, department })
                .eq('email', document.getElementById('sfEmail').value.trim())
                .eq('tenant_id', window.currentTenantId);

        } else {
            // ── ADD: call Edge Function which creates auth user + profile + role + allowed_users
            const { data: { session } } = await sb.auth.getSession();
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-school-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ email, password, full_name, role, designation, department })
            });
            const result = await resp.json();
            if (!resp.ok || result.error) throw new Error(result.error || 'Failed to create user');
        }

        window.closeStaffModal();
        await loadStaff();
        showToast(editId ? 'Staff updated ✓' : 'Staff member added ✓', '#16a34a');

    } catch (e) {
        showErr(e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = editId
            ? '<i class="fa-solid fa-save"></i> Save Changes'
            : '<i class="fa-solid fa-user-plus"></i> Add Staff Member';
    }
};

function showErr(msg) {
    const el = document.getElementById('modalErr');
    el.textContent = msg;
    el.style.display = 'block';
}

// ─── TOGGLE APPROVAL ─────────────────────────────────────────
window.toggleApproval = async function(id, current) {
    const newVal = !current;
    const { error } = await sb.from('allowed_users')
        .update({ approved: newVal })
        .eq('id', id)
        .eq('tenant_id', window.currentTenantId);

    if (error) {
        showToast('Update failed: ' + error.message, '#dc2626');
        await loadStaff(); // re-render to revert toggle
        return;
    }
    const s = allStaff.find(x => x.id === id);
    if (s) s.approved = newVal;
    updateStats(allStaff);
    showToast(newVal ? 'Access granted ✓' : 'Access blocked', newVal ? '#16a34a' : '#f59e0b');
};

// ─── SOFT DELETE ─────────────────────────────────────────────
window.softDeleteStaff = async function(id, name) {
    if (!confirm(`Remove ${name} from this school?\n\nThis will block their login. They will not be deleted from the system.`)) return;

    const { error } = await sb.from('allowed_users')
        .update({ deleted_at: new Date().toISOString(), approved: false })
        .eq('id', id)
        .eq('tenant_id', window.currentTenantId);

    if (error) { showToast('Remove failed: ' + error.message, '#dc2626'); return; }
    showToast(`${name} removed from school`, '#f59e0b');
    await loadStaff();
};

// ─── RESET PASSWORD ──────────────────────────────────────────
let _resetTargetId = null;

window.openResetPwdModal = function(userId, name) {
    _resetTargetId = userId;
    document.getElementById('resetPwdForName').textContent = `Resetting password for: ${name}`;
    document.getElementById('resetNewPwd').value = '';
    document.getElementById('resetPwdErr').style.display = 'none';
    document.getElementById('resetPwdModal').classList.add('open');
};

window.closeResetPwdModal = function() {
    document.getElementById('resetPwdModal').classList.remove('open');
    _resetTargetId = null;
};

window.toggleResetEye = function() {
    const p = document.getElementById('resetNewPwd');
    const i = document.getElementById('resetEye');
    p.type = p.type === 'password' ? 'text' : 'password';
    i.className = p.type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
};

window.doResetPassword = async function() {
    const btn      = document.getElementById('resetPwdBtn');
    const errEl    = document.getElementById('resetPwdErr');
    const newPwd   = document.getElementById('resetNewPwd').value;
    errEl.style.display = 'none';

    if (newPwd.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting...';

    try {
        const { data: { session } } = await sb.auth.getSession();
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-school-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                mode:         'reset_password',
                user_id:      _resetTargetId,
                new_password: newPwd
            })
        });
        const result = await resp.json();
        if (!resp.ok || result.error) throw new Error(result.error || 'Reset failed');

        window.closeResetPwdModal();
        showToast('Password reset successfully ✓', '#16a34a');

    } catch(e) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Reset Password';
    }
};

// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, color = '#16a34a') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);
        background:#fff;border:1.5px solid ${color};border-radius:10px;
        padding:10px 20px;font-size:13px;font-weight:700;color:${color};
        box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:9999;
        display:flex;align-items:center;gap:8px;white-space:nowrap;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .4s'; setTimeout(() => t.remove(), 400); }, 3000);
}
