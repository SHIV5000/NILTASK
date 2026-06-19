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

// Format last login timestamp into human-readable string
function fmtLogin(ts) {
    if (!ts) return '<span style="color:var(--text-secondary);font-size:11px;">Never</span>';
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 60)    return '<span style="color:#16a34a;font-size:11px;font-weight:700;">Just now</span>';
    if (diff < 3600)  return `<span style="font-size:11px;">${Math.floor(diff/60)}m ago</span>`;
    if (diff < 86400) return `<span style="font-size:11px;">${Math.floor(diff/3600)}h ago</span>`;
    if (diff < 604800)return `<span style="font-size:11px;">${Math.floor(diff/86400)}d ago</span>`;
    return `<span style="font-size:11px;">${new Date(ts).toLocaleDateString('en-IN')}</span>`;
}

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
    <div style="max-width:100%;margin:0 auto;padding:20px 24px;">

        <!-- Top bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">

            <!-- School badge -->
            <div class="school-badge" style="flex:1;min-width:220px;max-width:480px;">
                <div class="school-badge-name">${window.escapeHtml(schoolName)}</div>
                <div class="school-badge-sub">✦ &nbsp; Powered by TaskFlow &nbsp; ✦</div>
            </div>

            <!-- Right actions -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div style="font-size:13px;font-weight:600;color:var(--text-secondary);">
                    <i class="fa-solid fa-user-shield" style="color:var(--accent);"></i>
                    ${window.escapeHtml(userName)}
                    <span style="font-size:11px;background:rgba(99,102,241,.1);color:#6366f1;padding:2px 8px;border-radius:20px;margin-left:4px;">${window.currentRoleName || 'Admin'}</span>
                </div>
                <button class="btn-outline btn-sm" onclick="window.openRolesPermPanel?.()">
                    <i class="fa-solid fa-user-shield"></i> Roles &amp; Permissions
                </button>
                <button class="btn-outline btn-sm" onclick="window.toggleAdminTheme()">
                    <i class="fa-solid fa-circle-half-stroke"></i>
                </button>
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
                    <button class="btn-outline btn-sm" onclick="window.printStaffTable()" title="Print staff list">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                    <button class="btn-outline btn-sm" onclick="window.openBulkAddModal()" style="color:#0ea5e9;border-color:#0ea5e9;">
                        <i class="fa-solid fa-file-csv"></i> Bulk Add
                    </button>
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
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="staffTableBody">
                        <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);">
                            <i class="fa-solid fa-spinner fa-spin"></i> Loading staff...
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Login instruction — 3D card -->
        <div style="margin-top:16px;margin-bottom:8px;
             background:linear-gradient(135deg,var(--accent) 0%,color-mix(in srgb,var(--accent) 60%,#000) 100%);
             border-radius:16px;padding:20px 24px;
             box-shadow:0 6px 0 rgba(0,0,0,.25),0 10px 24px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.18);
             position:relative;overflow:hidden;transform:perspective(600px) rotateX(1deg);">
            <div style="position:absolute;top:0;left:0;right:0;height:50%;background:rgba(255,255,255,.07);border-radius:16px 16px 0 0;"></div>
            <div style="position:relative;z-index:1;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.18);
                     display:flex;align-items:center;justify-content:center;flex-shrink:0;
                     box-shadow:0 2px 8px rgba(0,0,0,.2);">
                    <i class="fa-solid fa-mobile-screen" style="color:#fff;font-size:20px;"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:14px;font-weight:800;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.3);margin-bottom:4px;">
                        How Staff Login
                    </div>
                    <div style="font-size:12px;color:rgba(255,255,255,.85);line-height:1.6;">
                        Visit <strong style="color:#fff;background:rgba(0,0,0,.2);padding:1px 8px;border-radius:6px;font-family:monospace;">niltask.vercel.app</strong>
                        → use their <strong style="color:#fff;">email</strong> and the <strong style="color:#fff;">password you set</strong>.
                        They can change their password from <strong style="color:#fff;">Profile → Settings</strong>.
                    </div>
                </div>
            </div>
        </div>
        <!-- ── SCORECARD SECTION ──────────────────────────── -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;margin-top:24px;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                    <h2 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0 0 2px;">
                        🏆 Staff Scorecard
                        <span style="font-size:9px;background:var(--accent);color:#fff;padding:1px 7px;border-radius:10px;margin-left:6px;font-weight:700;vertical-align:middle;">WORLD FIRST</span>
                    </h2>
                    <p style="font-size:11px;color:var(--text-secondary);margin:0;">Objective task-based performance scores for transparent promotions &amp; increments</p>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select id="scMonth" style="padding:7px 10px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:12px;outline:none;">
                        <option value="this_month">This Month</option>
                        <option value="last_month">Last Month</option>
                        <option value="this_quarter">This Quarter</option>
                        <option value="this_year">This Year</option>
                    </select>
                    <button class="btn-accent" onclick="loadScorecard()" style="font-size:12px;padding:8px 14px;">
                        <i class="fa-solid fa-chart-bar"></i> Generate Scorecard
                    </button>
                    <button class="btn-outline btn-sm" onclick="window.printScorecard()" style="font-size:12px;">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                </div>
            </div>
            <div style="padding:8px 20px;background:var(--bg-body);border-bottom:1px solid var(--border-color);display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">Grade:</span>
                <span style="font-size:11px;"><span style="background:#dcfce7;color:#16a34a;padding:1px 8px;border-radius:10px;font-weight:700;">A+</span> 90–100%</span>
                <span style="font-size:11px;"><span style="background:#dbeafe;color:#1d4ed8;padding:1px 8px;border-radius:10px;font-weight:700;">A</span> 80–89%</span>
                <span style="font-size:11px;"><span style="background:#fef9c3;color:#854d0e;padding:1px 8px;border-radius:10px;font-weight:700;">B</span> 65–79%</span>
                <span style="font-size:11px;"><span style="background:#ffedd5;color:#c2410c;padding:1px 8px;border-radius:10px;font-weight:700;">C</span> 50–64%</span>
                <span style="font-size:11px;"><span style="background:#fee2e2;color:#b91c1c;padding:1px 8px;border-radius:10px;font-weight:700;">D</span> &lt;50%</span>
                <span style="font-size:10px;color:var(--text-secondary);margin-left:auto;">On-time ×4 + Delayed ×1 ÷ Total ×4 × 100</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="staff-table">
                    <thead><tr>
                        <th>Staff Member</th><th>Role</th>
                        <th style="text-align:center;">Tasks</th>
                        <th style="text-align:center;color:#16a34a;">On Time</th>
                        <th style="text-align:center;color:#f59e0b;">Delayed</th>
                        <th style="text-align:center;color:#ef4444;">Pending</th>
                        <th style="text-align:center;">Score</th>
                        <th style="text-align:center;">Grade</th>
                        <th style="text-align:center;">Card</th>
                    </tr></thead>
                    <tbody id="scorecardBody">
                        <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary);">
                            Select period and click <strong>Generate Scorecard</strong>
                        </td></tr>
                    </tbody>
                </table>
            </div>
            <div id="scorecardNote" style="padding:12px 20px;font-size:11px;color:var(--text-secondary);border-top:1px solid var(--border-color);display:none;">
                📊 Scores are calculated automatically from task data — objective, transparent, unchallengeable. Share with staff for fair increment &amp; promotion decisions.
            </div>
        </div>

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
    // Query 1: allowed_users (no join — profiles linked by email only, no FK)
    const { data: staff, error } = await sb
        .from('allowed_users')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (error) { console.error('loadStaff:', error); return; }

    // Query 2: profiles for last_login — merge by email
    const emails = (staff || []).map(s => s.email).filter(Boolean);
    let profileMap = {};
    if (emails.length) {
        const { data: profiles } = await sb
            .from('profiles')
            .select('email, last_login')
            .eq('tenant_id', window.currentTenantId)
            .in('email', emails);
        (profiles || []).forEach(p => { profileMap[p.email] = p; });
    }

    // Merge last_login into each staff row
    allStaff = (staff || []).map(s => ({
        ...s,
        last_login: profileMap[s.email]?.last_login || null
    }));

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
        tbody.innerHTML = `<tr><td colspan="7">
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
        management:'Management', principal:'Principal',
        vp_admin:'VP / Admin', coordinator:'Coordinator',
        exam_controller:'Exam Controller', hod:'HOD',
        teacher:'Teacher', admin_staff:'Admin Staff',
        support_staff:'Support Staff'
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
            <td>${fmtLogin(s.last_login)}</td>
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

// ─── SCORECARD ───────────────────────────────────────────────
window.loadScorecard = async function() {
    const tbody = document.getElementById('scorecardBody');
    const note  = document.getElementById('scorecardNote');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin"></i> Calculating scores...
    </td></tr>`;

    // Calculate date range from selector
    const sel   = document.getElementById('scMonth').value;
    const today = new Date();
    let fromDate, toDate = today.toISOString().split('T')[0];

    if (sel === 'this_month') {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    } else if (sel === 'last_month') {
        const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        fromDate = d.toISOString().split('T')[0];
        toDate = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
    } else if (sel === 'this_quarter') {
        const q = Math.floor(today.getMonth() / 3);
        fromDate = new Date(today.getFullYear(), q * 3, 1).toISOString().split('T')[0];
    } else { // this_year
        fromDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
    }

    const { data, error } = await sb.rpc('get_staff_scorecard', {
        p_tenant_id: window.currentTenantId,
        p_from:      fromDate,
        p_to:        toDate
    });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#dc2626;">
            Error: ${error.message}
        </td></tr>`;
        return;
    }

    const staff = Array.isArray(data) ? data : JSON.parse(data || '[]');

    if (!staff.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-secondary);">
            No task data found for this period. Assign tasks to staff to start tracking scores.
        </td></tr>`;
        return;
    }

    const gradeColors = {
        'A+': { bg:'#dcfce7', color:'#16a34a' },
        'A':  { bg:'#dbeafe', color:'#1d4ed8' },
        'B':  { bg:'#fef9c3', color:'#854d0e' },
        'C':  { bg:'#ffedd5', color:'#c2410c' },
        'D':  { bg:'#fee2e2', color:'#b91c1c' },
        'N/A':{ bg:'#f1f5f9', color:'#64748b' },
    };

    tbody.innerHTML = staff.map(s => {
        const gc  = gradeColors[s.grade] || gradeColors['N/A'];
        const pct = s.score ?? 0;
        const barColor = pct >= 90 ? '#16a34a' : pct >= 65 ? '#f59e0b' : '#ef4444';

        return `<tr>
            <td>
                <div style="font-weight:700;font-size:13px;">${window.escapeHtml(s.staff_name || '—')}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${window.escapeHtml(s.email || '')}</div>
                ${s.designation ? `<div style="font-size:10px;color:var(--text-secondary);">${window.escapeHtml(s.designation)}</div>` : ''}
            </td>
            <td><span class="role-pill role-${(s.role||'teacher').toLowerCase().replace(/ /g,'_')}" style="font-size:10px;">${window.escapeHtml(s.role||'')}</span></td>
            <td style="text-align:center;font-weight:700;">${s.tasks_total || 0}</td>
            <td style="text-align:center;color:#16a34a;font-weight:700;">${s.tasks_on_time || 0}</td>
            <td style="text-align:center;color:#f59e0b;font-weight:700;">${s.tasks_delayed || 0}</td>
            <td style="text-align:center;color:#ef4444;font-weight:700;">${s.tasks_pending || 0}</td>
            <td style="text-align:center;">
                <div style="font-size:15px;font-weight:800;color:${barColor};">${s.score !== null ? s.score + '%' : '—'}</div>
                ${s.tasks_total > 0 ? `<div style="width:60px;height:4px;background:var(--border-color);border-radius:4px;margin:3px auto 0;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width .5s;"></div>
                </div>` : ''}
            </td>
            <td style="text-align:center;">
                <span style="background:${gc.bg};color:${gc.color};padding:3px 12px;border-radius:20px;font-size:12px;font-weight:800;">${s.grade}</span>
            </td>
            <td style="text-align:center;">
                <button class="btn-outline btn-sm" onclick="window.downloadStaffScorecard(${JSON.stringify(s).replace(/"/g,'&quot;')})" title="Download scorecard" style="font-size:11px;padding:4px 10px;">
                    <i class="fa-solid fa-download"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    if (note) note.style.display = 'block';
    showToast('Scorecard generated ✓', '#16a34a');
};

// ─── PRINT STAFF TABLE ───────────────────────────────────────
window.printStaffTable = function() {
    const school = window.currentSchoolName || 'School';
    const rows = allStaff.map((s,i) => `<tr style="background:${i%2?'#f9f9f9':'#fff'}">
        <td>${s.full_name||'—'}</td><td>${s.email||'—'}</td>
        <td>${(s.role||'').replace('_',' ')}</td>
        <td>${s.designation||'—'}</td><td>${s.department||'—'}</td>
        <td>${s.last_login ? new Date(s.last_login).toLocaleDateString('en-IN') : 'Never'}</td>
        <td>${s.approved ? 'Active' : 'Blocked'}</td>
    </tr>`).join('');
    const w = window.open('','_blank');
    w.document.write(`<html><head><title>${school} — Staff</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}
    h1{font-size:16px;}table{width:100%;border-collapse:collapse;}
    th{padding:7px 8px;border:1px solid #ccc;background:#f0f2f5;text-align:left;font-size:11px;text-transform:uppercase;}
    td{padding:6px 8px;border:1px solid #ddd;}</style></head><body>
    <h1>${school} — Staff Directory</h1>
    <p style="color:#666;font-size:11px;">Total: ${allStaff.length} · Printed ${new Date().toLocaleString('en-IN')}</p>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Designation</th><th>Department</th><th>Last Login</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
    w.document.close(); w.print();
};

// ─── PRINT SCORECARD TABLE ───────────────────────────────────
window.printScorecard = function() {
    const tbody = document.getElementById('scorecardBody');
    if (!tbody || tbody.innerHTML.includes('Generate Scorecard')) {
        alert('Generate the scorecard first.'); return;
    }
    const school = window.currentSchoolName || 'School';
    const period = document.getElementById('scMonth')?.selectedOptions[0]?.text || '';
    const w = window.open('','_blank');
    w.document.write(`<html><head><title>${school} Scorecard</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}
    h1{font-size:16px;}table{width:100%;border-collapse:collapse;}
    th{padding:7px 8px;border:1px solid #ccc;background:#f0f2f5;text-align:center;font-size:11px;text-transform:uppercase;}
    th:first-child{text-align:left;}td{padding:6px 8px;border:1px solid #ddd;text-align:center;}
    td:first-child{text-align:left;}</style></head><body>
    <h1>🏆 ${school} — Staff Scorecard</h1>
    <p style="color:#666;font-size:11px;">Period: ${period} · Printed ${new Date().toLocaleString('en-IN')}</p>
    <p style="font-size:11px;color:#666;">Grading: A+ ≥90% · A ≥80% · B ≥65% · C ≥50% · D &lt;50%</p>
    <table><thead><tr><th>Staff Member</th><th>Role</th><th>Tasks</th><th>On Time</th><th>Delayed</th><th>Pending</th><th>Score</th><th>Grade</th></tr></thead>
    <tbody>${tbody.innerHTML}</tbody></table></body></html>`);
    w.document.close(); w.print();
};

// ─── INDIVIDUAL SCORECARD DOWNLOAD ───────────────────────────
window.downloadStaffScorecard = function(s) {
    const school = window.currentSchoolName || 'School';
    const period = document.getElementById('scMonth')?.selectedOptions[0]?.text || '';
    const gradeColors = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c','N/A':'#64748b'};
    const gc = gradeColors[s.grade] || '#64748b';
    const pct = s.score ?? 0;
    const bar = Math.min(100, pct);
    const barColor = pct >= 90 ? '#16a34a' : pct >= 65 ? '#f59e0b' : '#ef4444';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Scorecard — ${s.staff_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Inter',sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
      .card{width:480px;background:#fff;border-radius:24px;overflow:hidden;
            box-shadow:0 20px 60px rgba(0,0,0,.15),0 4px 12px rgba(0,0,0,.08);}
      .header{background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:32px 28px;color:#fff;position:relative;overflow:hidden;}
      .header::before{content:'';position:absolute;top:-40px;right:-40px;width:180px;height:180px;
                      border-radius:50%;background:rgba(255,255,255,.08);}
      .header::after{content:'';position:absolute;bottom:-60px;left:-30px;width:200px;height:200px;
                     border-radius:50%;background:rgba(255,255,255,.06);}
      .school-name{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.8;margin-bottom:6px;}
      .card-title{font-size:13px;font-weight:600;opacity:.75;margin-bottom:20px;}
      .staff-name{font-size:26px;font-weight:900;letter-spacing:-.5px;margin-bottom:4px;}
      .staff-meta{font-size:12px;opacity:.75;}
      .body{padding:28px;}
      .grade-block{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}
      .grade-circle{width:90px;height:90px;border-radius:50%;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;
                    background:linear-gradient(135deg,${gc}22,${gc}11);
                    border:3px solid ${gc}44;}
      .grade-letter{font-size:36px;font-weight:900;color:${gc};}
      .grade-label{font-size:9px;font-weight:700;color:${gc};letter-spacing:1px;text-transform:uppercase;}
      .score-block{text-align:right;}
      .score-num{font-size:48px;font-weight:900;color:${barColor};line-height:1;}
      .score-label{font-size:11px;color:#94a3b8;font-weight:600;margin-top:2px;}
      .bar-track{height:8px;background:#f1f5f9;border-radius:8px;overflow:hidden;margin-top:6px;width:160px;margin-left:auto;}
      .bar-fill{height:100%;width:${bar}%;background:${barColor};border-radius:8px;}
      .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
      .stat{background:#f8fafc;border-radius:12px;padding:14px 10px;text-align:center;}
      .stat-num{font-size:22px;font-weight:800;}
      .stat-lbl{font-size:10px;color:#94a3b8;font-weight:600;margin-top:3px;text-transform:uppercase;}
      .period{background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;
              font-size:12px;color:#0369a1;font-weight:600;margin-bottom:20px;display:flex;align-items:center;gap:8px;}
      .footer{background:#f8fafc;border-top:1px solid #f1f5f9;padding:14px 28px;
              font-size:10px;color:#94a3b8;text-align:center;}
    </style></head><body>
    <div class="card">
      <div class="header">
        <div class="school-name">${school}</div>
        <div class="card-title">Performance Scorecard</div>
        <div class="staff-name">${s.staff_name||'—'}</div>
        <div class="staff-meta">${s.role||''} ${s.designation ? '· '+s.designation : ''}</div>
      </div>
      <div class="body">
        <div class="period">📅 Period: ${period}</div>
        <div class="grade-block">
          <div class="grade-circle">
            <div class="grade-letter">${s.grade}</div>
            <div class="grade-label">Grade</div>
          </div>
          <div class="score-block">
            <div class="score-num">${s.score !== null ? s.score+'%' : '—'}</div>
            <div class="score-label">Performance Score</div>
            <div class="bar-track"><div class="bar-fill"></div></div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><div class="stat-num" style="color:#6366f1">${s.tasks_total||0}</div><div class="stat-lbl">Total</div></div>
          <div class="stat"><div class="stat-num" style="color:#16a34a">${s.tasks_on_time||0}</div><div class="stat-lbl">On Time</div></div>
          <div class="stat"><div class="stat-num" style="color:#f59e0b">${s.tasks_delayed||0}</div><div class="stat-lbl">Delayed</div></div>
          <div class="stat"><div class="stat-num" style="color:#ef4444">${s.tasks_pending||0}</div><div class="stat-lbl">Pending</div></div>
        </div>
        <p style="font-size:11px;color:#94a3b8;text-align:center;">Formula: (On-time×4 + Delayed×1) ÷ (Total×4) × 100</p>
      </div>
      <div class="footer">Generated by MPGS TaskFlow · ${new Date().toLocaleString('en-IN')} · Objective &amp; Transparent</div>
    </div>
    <script>window.print();<\/script>
    </body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
};

// ─── BULK ADD MODAL ──────────────────────────────────────────
window.openBulkAddModal = function() {
    let modal = document.getElementById('bulkAddModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulkAddModal';
        modal.className = 'modal-wrap';
        modal.innerHTML = `
        <div class="modal-card" style="max-width:560px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <h3 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0;">
                    <i class="fa-solid fa-file-csv" style="color:#0ea5e9;margin-right:8px;"></i>Bulk Add Staff
                </h3>
                <button onclick="document.getElementById('bulkAddModal').classList.remove('open')"
                    style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary);">✕</button>
            </div>
            <div style="background:var(--bg-body);border:1px solid var(--border-color);border-radius:10px;padding:14px;margin-bottom:16px;font-size:12px;color:var(--text-secondary);">
                <strong style="color:var(--text-primary);">How it works:</strong><br>
                1. Download the sample CSV below<br>
                2. Fill in name, email, role, department, designation for each staff<br>
                3. Upload the filled CSV — passwords auto-generated as <strong>firstname123</strong> (lowercase)
            </div>
            <div style="margin-bottom:14px;">
                <button class="btn-outline" onclick="window.downloadSampleCSV()" style="width:100%;justify-content:center;">
                    <i class="fa-solid fa-download"></i> Download Sample CSV
                </button>
            </div>
            <div class="field">
                <label>Upload Filled CSV</label>
                <input type="file" id="bulkCSVInput" accept=".csv"
                    style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-body);color:var(--text-primary);font-size:12px;">
            </div>
            <div id="bulkPreview" style="display:none;margin-bottom:14px;max-height:200px;overflow-y:auto;background:var(--bg-body);border:1px solid var(--border-color);border-radius:9px;padding:10px;font-size:12px;"></div>
            <div class="err-msg" id="bulkErr"></div>
            <div style="display:flex;gap:10px;margin-top:8px;">
                <button class="btn-outline" style="flex:1;" onclick="document.getElementById('bulkAddModal').classList.remove('open')">Cancel</button>
                <button class="btn-accent" style="flex:2;" id="bulkAddBtn" onclick="window.doBulkAdd()">
                    <i class="fa-solid fa-users"></i> Add All Staff
                </button>
            </div>
            <div id="bulkProgress" style="display:none;margin-top:12px;font-size:12px;color:var(--text-secondary);"></div>
        </div>`;
        document.body.appendChild(modal);

        document.getElementById('bulkCSVInput').addEventListener('change', function() {
            const file = this.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const lines = e.target.result.split('\n').filter(l => l.trim());
                const preview = document.getElementById('bulkPreview');
                preview.style.display = 'block';
                preview.innerHTML = `<strong>${lines.length - 1} staff members detected:</strong><br><br>` +
                    lines.slice(1,6).map(l => {
                        const [name,email,role,dept,desig] = l.split(',').map(x=>x.trim());
                        return `• ${name||'?'} (${email||'?'}) — ${role||'teacher'}`;
                    }).join('<br>') +
                    (lines.length > 6 ? `<br>... and ${lines.length - 6} more` : '');
            };
            reader.readAsText(file);
        });
    }
    modal.classList.add('open');
};

window.downloadSampleCSV = function() {
    const csv = `full_name,email,role,department,designation
Mr. Rajesh Kumar,rajesh.kumar@school.com,teacher,Science,Physics Teacher
Mrs. Priya Sharma,priya.sharma@school.com,hod,Mathematics,Head of Department
Mr. Anil Verma,anil.verma@school.com,vp_admin,Administration,Vice Principal`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'staff_bulk_upload_sample.csv';
    a.click();
};

window.doBulkAdd = async function() {
    const fileInput = document.getElementById('bulkCSVInput');
    const btn = document.getElementById('bulkAddBtn');
    const errEl = document.getElementById('bulkErr');
    const progress = document.getElementById('bulkProgress');
    errEl.style.display = 'none';

    if (!fileInput.files[0]) { errEl.textContent = 'Please upload a CSV file.'; errEl.style.display = 'block'; return; }

    const text = await fileInput.files[0].text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const dataLines = lines.slice(1).filter(l => l);
    if (!dataLines.length) { errEl.textContent = 'No data rows found.'; errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
    progress.style.display = 'block';

    const { data: { session } } = await sb.auth.getSession();
    let added = 0, failed = 0, failedNames = [];

    for (let i = 0; i < dataLines.length; i++) {
        const [full_name, email, role, department, designation] = dataLines[i].split(',').map(x => x?.trim());
        if (!full_name || !email) { failed++; failedNames.push(`Row ${i+2}: missing name or email`); continue; }

        const firstName = full_name.split(' ').pop().toLowerCase().replace(/[^a-z]/g,'');
        const password = firstName + '123';

        progress.textContent = `Adding ${i+1} of ${dataLines.length}: ${full_name}...`;

        try {
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-school-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email, password, full_name, role: role||'teacher', designation: designation||'', department: department||'' })
            });
            const result = await resp.json();
            if (!resp.ok || result.error) { failed++; failedNames.push(`${full_name}: ${result.error}`); }
            else added++;
        } catch(e) { failed++; failedNames.push(`${full_name}: ${e.message}`); }
    }

    progress.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-users"></i> Add All Staff';

    let msg = `✓ Added ${added} staff.`;
    if (failed) msg += ` ${failed} failed: ${failedNames.slice(0,3).join(', ')}${failedNames.length > 3 ? '...' : ''}`;
    showToast(msg, added ? '#16a34a' : '#dc2626');

    if (added) {
        document.getElementById('bulkAddModal').classList.remove('open');
        await loadStaff();
    }
};

// ─── THEME TOGGLE ────────────────────────────────────────────
window.toggleAdminTheme = function() {
    const html = document.documentElement;
    const cur = html.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('adminTheme', next);
};
;(()=>{
    const t = localStorage.getItem('adminTheme');
    if (t) document.documentElement.setAttribute('data-theme', t);
})();

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
