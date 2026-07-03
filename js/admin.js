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
    if (IS_MOB()) renderAdminMobile(); else renderAdmin();
    renderInlineRolesTable();
    loadQuickTagsUI();
    await loadAdminData();
    await loadArchivedStaff();
})();

// ≤768px gets the dedicated mobile app shell; desktop keeps the full panel.
const IS_MOB = () => window.innerWidth <= 768;
// Re-render the correct shell if the viewport crosses the breakpoint.
let _admWasMob = IS_MOB();
window.addEventListener('resize', () => {
    const m = IS_MOB();
    if (m === _admWasMob) return;
    _admWasMob = m;
    if (m) renderAdminMobile(); else renderAdmin();
    renderInlineRolesTable(); loadQuickTagsUI();
    loadAdminData(); loadArchivedStaff();
}, { passive:true });

// ─── RENDER SHELL ──────────────────────────────────────────────
function renderAdmin() {
    const schoolName = window.currentSchoolName || 'School';
    const userName   = window.currentUser?.user_metadata?.full_name
                    || window.currentUser?.email?.split('@')[0] || 'Admin';

    const btn3d = (label, icon, onclick, color='var(--accent)') =>
        `<button onclick="${onclick}" style="
            display:inline-flex;align-items:center;gap:7px;padding:8px 16px;
            border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;color:#fff;
            background:${color};box-shadow:0 2px 6px rgba(0,0,0,.15);
            transition:opacity .15s,box-shadow .15s;"
            onmousedown="this.style.opacity='.85';"
            onmouseup="this.style.opacity='1';"
        ><i class="fa-solid ${icon}"></i>${label}</button>`;

    const sectionHead = (title, sub, id) =>
        `<div class="section-hdr" onclick="window._toggleSection('${id}')"
            style="background:var(--accent);padding:14px 22px;cursor:pointer;user-select:none;
            display:flex;align-items:center;justify-content:space-between;">
            <div>
                <h2 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 2px;">${title}</h2>
                <p style="font-size:12px;color:rgba(255,255,255,.8);margin:0;">${sub}</p>
            </div>
            <i id="chevron-${id}" class="fa-solid fa-chevron-up"
               style="color:rgba(255,255,255,.8);font-size:13px;transition:transform .22s;"></i>
        </div>
        <div id="section-${id}">`;

    document.getElementById('adminRoot').innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:20px 16px;font-size:14px;">

        <!-- Top bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <div class="school-badge" style="flex:1;min-width:220px;max-width:420px;">
                <div class="school-badge-name">${window.escapeHtml(schoolName)}</div>
                <div class="school-badge-sub">✦ &nbsp; Powered by TaskFlow &nbsp; ✦</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">
                    <i class="fa-solid fa-user-shield" style="color:var(--accent);"></i>
                    ${window.escapeHtml(userName)}
                    <span style="font-size:11px;background:rgba(99,102,241,.1);color:#6366f1;padding:2px 8px;border-radius:20px;margin-left:4px;">${window.currentRoleName || 'Admin'}</span>
                </span>
                ${btn3d('','fa-circle-half-stroke','window.toggleAdminTheme()','#6366f1')}
                ${btn3d('Chat','fa-comments',"window.location.href='/?mode=chat'",'#0ea5e9')}
                ${btn3d('Logout','fa-arrow-right-from-bracket','window.logout?.()','#ef4444')}
            </div>
        </div>

        <!-- Trial banner -->
        <div id="trialBanner" class="trial-banner" style="margin-bottom:20px;">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-star" style="color:#6366f1;font-size:16px;"></i>
            </div>
            <div style="flex:1;">
                <div id="planName" style="font-size:13px;font-weight:700;color:var(--text-primary);">Loading plan...</div>
                <div id="planSub" style="font-size:11px;color:var(--text-secondary);margin-top:2px;"></div>
            </div>
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px;">
            <div class="stat-card"><div class="stat-icon" style="background:rgba(99,102,241,.1);"><i class="fa-solid fa-users" style="color:#6366f1;font-size:18px;"></i></div><div><div class="stat-val" id="statTotal">—</div><div class="stat-lbl">Total Staff</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(22,163,74,.1);"><i class="fa-solid fa-user-check" style="color:#16a34a;font-size:18px;"></i></div><div><div class="stat-val" id="statApproved">—</div><div class="stat-lbl">Approved</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(245,158,11,.1);"><i class="fa-solid fa-user-clock" style="color:#f59e0b;font-size:18px;"></i></div><div><div class="stat-val" id="statPending">—</div><div class="stat-lbl">Pending</div></div></div>
            <div class="stat-card"><div class="stat-icon" style="background:rgba(239,68,68,.1);"><i class="fa-solid fa-calendar-xmark" style="color:#ef4444;font-size:18px;"></i></div><div><div class="stat-val" id="statDays">—</div><div class="stat-lbl">Trial Days Left</div></div></div>
        </div>

        <!-- STAFF MANAGEMENT -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;
             box-shadow:0 1px 4px rgba(0,0,0,.07);">
            ${sectionHead('👥 Staff Management','Add, approve or remove staff members','staff')}
            <div style="padding:14px 20px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <input type="text" id="staffSearch" placeholder="Search name or email..."
                    oninput="filterStaff(this.value)"
                    style="padding:8px 12px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:13px;outline:none;width:220px;">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn-outline btn-sm" onclick="window.printStaffTable()"><i class="fa-solid fa-print"></i> Print</button>
                    <button class="btn-outline btn-sm" onclick="window.openBulkAddModal()" style="color:#0ea5e9;border-color:#0ea5e9;"><i class="fa-solid fa-file-csv"></i> Bulk Add</button>
                    <button class="btn-accent" onclick="openAddStaffModal()"><i class="fa-solid fa-plus"></i> Add Staff</button>
                </div>
            </div>
            <div style="overflow-x:auto;">
                <table class="staff-table">
                    <thead><tr>
                        <th>Staff Member</th><th>Role</th><th>Designation</th>
                        <th>Department</th><th>Approved</th><th>Last Login</th><th>Actions</th>
                    </tr></thead>
                    <tbody id="staffTableBody">
                        <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);">
                            <i class="fa-solid fa-spinner fa-spin"></i> Loading staff...
                        </td></tr>
                    </tbody>
                </table>
            </div>
            <!-- Archived Staff -->
            <div id="archivedSection" style="display:none;border-top:1px solid var(--border-color);">
                <div style="padding:10px 20px;background:var(--bg-body);display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:12px;font-weight:700;color:var(--text-secondary);"><i class="fa-solid fa-box-archive" style="margin-right:6px;color:#f59e0b;"></i>Archived Staff</span>
                    <button class="btn-outline btn-sm" onclick="loadArchivedStaff()" style="font-size:11px;">Refresh</button>
                </div>
                <div style="overflow-x:auto;">
                    <table class="staff-table">
                        <thead><tr>
                            <th>Staff Member</th><th>Role</th><th>Archived</th><th>Actions</th>
                        </tr></thead>
                        <tbody id="archivedTableBody">
                            <tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text-secondary);">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div></div>

        <!-- Login note -->
        <div style="margin:14px 0 24px;padding:13px 18px;background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:12px;font-size:13px;">
            <strong style="color:var(--text-primary);">How Staff Login:</strong>
            <span style="color:var(--text-secondary);margin-left:6px;">
                Visit <strong style="color:var(--accent);">niltask.vercel.app</strong> using their
                <strong style="color:var(--text-primary);">email</strong> and the
                <strong style="color:var(--text-primary);">password you set</strong>.
                They can change it from <strong style="color:var(--text-primary);">Profile → Settings</strong>.
            </span>
        </div>

        <hr style="border:none;border-top:1px solid var(--border-color);margin:0 0 24px;">

        <!-- ROLES & PERMISSIONS -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;margin-bottom:24px;
             box-shadow:0 1px 4px rgba(0,0,0,.07);">
            ${sectionHead('🛡️ Roles &amp; Permissions','Which role can do what — Download PDF to share with staff','roles')}
            <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-outline btn-sm" onclick="window.openRolesPermPanel?.()"><i class="fa-solid fa-expand"></i> Full View</button>
                <button class="btn-outline btn-sm" onclick="window.printRolesPDF()"><i class="fa-solid fa-file-pdf"></i> Download PDF</button>
            </div>
            <div style="overflow-x:auto;">
                <table class="staff-table">
                    <thead><tr>
                        <th>Staff Member</th>
                        <th>Role</th>
                        <th style="text-align:center;">Schedule Msg</th>
                        <th style="text-align:center;">Upload</th>
                        <th style="text-align:center;">Create Task</th>
                        <th style="text-align:center;">Task Hub</th>
                        <th style="text-align:center;">Manage Groups</th>
                        <th style="text-align:center;">Activity Feed</th>
                        <th style="text-align:center;">Dashboard</th>
                        <th style="text-align:center;">Admin Panel</th>
                        <th style="text-align:center;">Reminders</th>
                        <th style="text-align:center;">Can Be Assigned</th>
                    </tr></thead>
                    <tbody id="rolesInlineTbody">
                        <tr><td colspan="12" style="padding:20px;text-align:center;color:var(--text-secondary);">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div></div>

        <hr style="border:none;border-top:1px solid var(--border-color);margin:0 0 24px;">

        <!-- QUICK TAGS -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.07);">
            ${sectionHead('🏷️ Quick Text Tags','Manage tag chips shown in the reaction menu for all staff','tags')}
            <div id="section-tags">
                <div style="padding:12px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="newTagInput" placeholder="New tag label..." maxlength="20"
                        style="padding:8px 12px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:13px;outline:none;flex:1;min-width:140px;">
                    <input type="color" id="newTagColor" value="#1d4ed8" title="Tag colour"
                        style="width:36px;height:34px;border-radius:8px;border:1px solid var(--border-color);cursor:pointer;padding:2px;">
                    <button class="btn-accent" onclick="window.addQuickTag()" style="font-size:13px;padding:8px 14px;">
                        <i class="fa-solid fa-plus"></i> Add Tag
                    </button>
                </div>
                <div id="tagsContainer" style="padding:14px 20px;display:flex;flex-wrap:wrap;gap:10px;min-height:56px;">
                    <span style="font-size:12px;color:var(--text-secondary);">Loading...</span>
                </div>
                <div style="padding:4px 20px 12px;font-size:11px;color:var(--text-secondary);">Changes appear immediately in the reaction menu for all staff.</div>
            </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border-color);margin:0 0 24px;">

        <!-- SCORECARD -->
        <div style="background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;
             box-shadow:0 1px 4px rgba(0,0,0,.07);">
            ${sectionHead('🏆 Staff Scorecard','Objective task-based performance — international standard','scorecard')}
            <div style="padding:10px 20px;background:var(--bg-body);border-bottom:1px solid var(--border-color);display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:11px;font-weight:700;color:var(--text-secondary);">Grade:</span>
                <span style="font-size:11px;"><span style="background:#dcfce7;color:#16a34a;padding:1px 8px;border-radius:10px;font-weight:700;">A+</span> ≥90%</span>
                <span style="font-size:11px;"><span style="background:#dbeafe;color:#1d4ed8;padding:1px 8px;border-radius:10px;font-weight:700;">A</span> ≥80%</span>
                <span style="font-size:11px;"><span style="background:#fef9c3;color:#854d0e;padding:1px 8px;border-radius:10px;font-weight:700;">B</span> ≥65%</span>
                <span style="font-size:11px;"><span style="background:#ffedd5;color:#c2410c;padding:1px 8px;border-radius:10px;font-weight:700;">C</span> ≥50%</span>
                <span style="font-size:11px;"><span style="background:#fee2e2;color:#b91c1c;padding:1px 8px;border-radius:10px;font-weight:700;">D</span> &lt;50%</span>
                
            </div>
            <div style="padding:10px 20px;border-bottom:1px solid var(--border-color);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <select id="scMonth" style="padding:7px 10px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-primary);font-size:12px;outline:none;">
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_quarter">This Quarter</option>
                    <option value="this_year">This Year</option>
                </select>
                <button class="btn-accent" onclick="loadScorecard()" style="font-size:12px;padding:8px 14px;"><i class="fa-solid fa-chart-bar"></i> Generate Scorecard</button>
                <button class="btn-outline btn-sm" onclick="window.printScorecard()"><i class="fa-solid fa-print"></i> Print</button>
            </div>
            <div style="overflow-x:auto;">
                <table class="staff-table">
                    <thead><tr>
                        <th>Staff Member</th>
                        <th>Role</th>
                        <th style="text-align:center;border-left:2px solid var(--border-color);">Tasks</th>
                        <th style="text-align:center;color:#16a34a;">On Time</th>
                        <th style="text-align:center;color:#f59e0b;">Delayed</th>
                        <th style="text-align:center;color:#ef4444;">Pending</th>
                        <th style="text-align:center;color:#6366f1;">Transferred</th>
                        <th style="text-align:center;border-left:2px solid var(--border-color);">Msgs Sent</th>
                        <th style="text-align:center;">Msgs Rcvd</th>
                        <th style="text-align:center;">Ack'd</th>
                        <th style="text-align:center;border-left:2px solid var(--border-color);">Active Days</th>
                        <th style="text-align:center;border-left:2px solid var(--border-color);">Score</th>
                        <th style="text-align:center;">Grade</th>
                        <th style="text-align:center;">Card</th>
                    </tr></thead>
                    <tbody id="scorecardBody">
                        <tr><td colspan="14" style="text-align:center;padding:32px;color:var(--text-secondary);">
                            Select period and click <strong>Generate Scorecard</strong>
                        </td></tr>
                    </tbody>
                </table>
            </div>
            <div id="scorecardNote" style="padding:12px 20px;font-size:11px;color:var(--text-secondary);border-top:1px solid var(--border-color);display:none;">
                📊 Scores calculated automatically from task data — objective, transparent, unchallengeable.
            </div>
        </div></div>

    </div>`;

    injectResetModal();
}

// Reset-password modal — shared by desktop + mobile shells.
function injectResetModal() {
    if (document.getElementById('resetPwdModal')) return;
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

// ─── MOBILE APP SHELL ─────────────────────────────────────────
// A native-feeling phone layout: sticky app bar with a Chat⇆Admin toggle,
// tab panels (Home · Staff · Scores · More), list cards instead of wide
// tables, and a floating "Add Staff". Reuses every desktop handler + the
// same element IDs, so all data loaders and modals work unchanged.
let _admTabCur = 'home';
function renderAdminMobile() {
    const schoolName = window.currentSchoolName || 'School';
    const userName   = window.currentUser?.user_metadata?.full_name
                    || window.currentUser?.email?.split('@')[0] || 'Admin';
    const tile = (id,label,dot) =>
        `<div class="ma-tile"><div class="ma-tile-n" id="${id}">—</div><div class="ma-tile-l"><span class="ma-dot" style="background:${dot};"></span>${label}</div></div>`;
    const qa = (tab,ico,bg,fg,title,sub) =>
        `<button class="ma-qa" onclick="window._admTab('${tab}')"><div class="ma-qi" style="background:${bg};color:${fg};">${ico}</div><div class="ma-qt">${title}</div><div class="ma-qs">${sub}</div></button>`;

    document.getElementById('adminRoot').innerHTML = `
    <div id="adminMobile">
      <div class="ma-bar">
        <div class="ma-brand">
          <div class="ma-school">${window.escapeHtml(schoolName)}</div>
          <div class="ma-role">${window.escapeHtml(window.currentRoleName || 'Admin')} · ${window.escapeHtml(userName)}</div>
        </div>
        <div class="ma-seg">
          <button onclick="window.location.href='/?mode=chat'">💬 Chat</button>
          <button class="on">🛡 Admin</button>
        </div>
      </div>

      <div class="ma-body">
        <!-- HOME -->
        <section class="ma-panel" id="matab-home">
          <div class="ma-trial" id="trialBanner">
            <div class="ma-trial-ic"><i class="fa-solid fa-star"></i></div>
            <div style="flex:1;min-width:0;">
              <div class="ma-trial-t" id="planName">Loading plan…</div>
              <div class="ma-trial-s" id="planSub"></div>
            </div>
          </div>
          <div class="ma-tiles">
            ${tile('statTotal','Total staff','var(--accent)')}
            ${tile('statApproved','Approved','#16a34a')}
            ${tile('statPending','Pending','#f59e0b')}
            ${tile('statDays','Trial days left','var(--accent)')}
          </div>
          <div class="ma-seclbl">Manage</div>
          <div class="ma-qa-grid">
            ${qa('staff','👥','rgba(99,102,241,.12)','#4f46e5','Staff','Add · approve · edit')}
            ${qa('roles','🛡','rgba(22,163,74,.12)','#15803d','Roles','Permissions · PDF')}
            ${qa('scores','🏆','rgba(245,158,11,.14)','#b45309','Scorecard','Performance')}
            ${qa('tags','🏷','rgba(14,165,233,.12)','#0369a1','Text Tags','Reaction chips')}
          </div>
          <div class="ma-seclbl" style="margin-top:6px;">Account</div>
          <div class="ma-acct">
            <button class="ma-acct-btn" onclick="window.toggleAdminTheme()"><i class="fa-solid fa-circle-half-stroke"></i> Toggle theme</button>
            <button class="ma-acct-btn danger" onclick="window.logout?.()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Log out</button>
          </div>
        </section>

        <!-- STAFF -->
        <section class="ma-panel" id="matab-staff" style="display:none;">
          <div class="ma-search"><i class="fa-solid fa-magnifying-glass"></i>
            <input id="staffSearch" placeholder="Search name or email…" oninput="filterStaff(this.value)"></div>
          <div class="ma-row-tools">
            <button class="btn-outline btn-sm" onclick="window.openBulkAddModal()" style="color:#0ea5e9;border-color:#0ea5e9;"><i class="fa-solid fa-file-csv"></i> Bulk add</button>
            <button class="btn-outline btn-sm" onclick="window.printStaffTable()"><i class="fa-solid fa-print"></i> Print</button>
          </div>
          <div id="staffTableBody" class="ma-list"></div>

          <div class="ma-seclbl" style="margin-top:18px;">Archived Staff</div>
          <div id="archivedSection">
            <div class="ma-row-tools"><button class="btn-outline btn-sm" onclick="loadArchivedStaff()">Refresh</button></div>
            <div class="ma-scroll"><table class="staff-table"><thead><tr><th>Staff</th><th>Role</th><th>Archived</th><th>Actions</th></tr></thead>
              <tbody id="archivedTableBody"><tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text-secondary);">Loading…</td></tr></tbody></table></div>
          </div>
        </section>

        <!-- ROLES -->
        <section class="ma-panel" id="matab-roles" style="display:none;">
          <div class="ma-row-tools">
            <button class="btn-outline btn-sm" onclick="window.openRolesPermPanel?.()"><i class="fa-solid fa-expand"></i> Full view</button>
            <button class="btn-outline btn-sm" onclick="window.printRolesPDF()"><i class="fa-solid fa-file-pdf"></i> PDF</button>
          </div>
          <div class="ma-scroll"><table class="staff-table"><thead><tr>
            <th>Staff</th><th>Role</th><th>Sched</th><th>Upload</th><th>Task</th><th>Hub</th><th>Groups</th><th>Activity</th><th>Dash</th><th>Admin</th><th>Remind</th><th>Assign</th>
          </tr></thead><tbody id="rolesInlineTbody"></tbody></table></div>
        </section>

        <!-- SCORES -->
        <section class="ma-panel" id="matab-scores" style="display:none;">
          <div class="ma-row-tools">
            <select id="scMonth" class="ma-select">
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year</option>
            </select>
            <button class="btn-accent btn-sm" onclick="loadScorecard()"><i class="fa-solid fa-chart-bar"></i> Generate</button>
            <button class="btn-outline btn-sm" onclick="window.printScorecard()"><i class="fa-solid fa-print"></i> Print</button>
          </div>
          <div id="scorecardBody" class="ma-list">
            <div class="ma-empty">Pick a period and tap <b>Generate</b>.</div>
          </div>
          <div id="scorecardNote" style="display:none;"></div>
        </section>

        <!-- TAGS -->
        <section class="ma-panel" id="matab-tags" style="display:none;">
          <div class="ma-row-tools">
            <input type="text" id="newTagInput" placeholder="New tag label…" maxlength="20" class="ma-input" style="flex:1;">
            <input type="color" id="newTagColor" value="#1d4ed8" title="Tag colour" class="ma-color">
            <button class="btn-accent btn-sm" onclick="window.addQuickTag()"><i class="fa-solid fa-plus"></i> Add</button>
          </div>
          <div id="tagsContainer" class="ma-tags"><span style="font-size:12px;color:var(--text-secondary);">Loading…</span></div>
          <div style="font-size:11.5px;color:var(--text-secondary);">Changes appear immediately in the reaction menu for all staff.</div>
        </section>
      </div>

      <button class="ma-fab" id="maFab" onclick="openAddStaffModal()"><i class="fa-solid fa-plus"></i> Add Staff</button>

      <nav class="ma-tabs">
        <button class="ma-tab on" data-tab="home"  onclick="window._admTab('home')"><i class="fa-solid fa-house"></i>Home</button>
        <button class="ma-tab"    data-tab="staff" onclick="window._admTab('staff')"><i class="fa-solid fa-users"></i>Staff</button>
        <button class="ma-tab"    data-tab="roles" onclick="window._admTab('roles')"><i class="fa-solid fa-shield-halved"></i>Roles</button>
        <button class="ma-tab"    data-tab="scores" onclick="window._admTab('scores')"><i class="fa-solid fa-trophy"></i>Scores</button>
        <button class="ma-tab"    data-tab="tags"  onclick="window._admTab('tags')"><i class="fa-solid fa-tag"></i>Tags</button>
      </nav>
    </div>`;

    injectResetModal();
    window._admTab(_admTabCur);
}

// Switch mobile tab panels + reflect the FAB (only shown on the Staff tab).
window._admTab = function(name) {
    _admTabCur = name;
    ['home','staff','roles','scores','tags'].forEach(t => {
        const p = document.getElementById('matab-'+t);
        if (p) p.style.display = t===name ? 'flex' : 'none';
    });
    document.querySelectorAll('.ma-tab').forEach(b => b.classList.toggle('on', b.dataset.tab===name));
    const fab = document.getElementById('maFab');
    if (fab) fab.style.display = name==='staff' ? 'flex' : 'none';
    const body = document.querySelector('#adminMobile .ma-body');
    if (body) body.scrollTop = 0;
};

// Staff as list cards (mobile). Reuses the same per-row handlers as the table.
function renderStaffCards(staff) {
    const box = document.getElementById('staffTableBody');
    if (!box) return;
    if (!staff.length) {
        box.innerHTML = `<div class="ma-empty" style="padding:36px 18px;">
            <div style="font-size:34px;margin-bottom:8px;">👥</div>
            <div style="font-weight:800;color:var(--text-primary);font-size:15px;">Add your first staff member</div>
            <div style="margin-top:6px;">Tap <b>＋ Add Staff</b> below to get started.</div></div>`;
        return;
    }
    const roleNames = { management:'Management', principal:'Principal', vp_admin:'VP / Admin', coordinator:'Coordinator', exam_controller:'Exam Controller', hod:'HOD', teacher:'Teacher', admin_staff:'Admin Staff', support_staff:'Support Staff' };
    const avatarColors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
    box.innerHTML = staff.map((s,i) => {
        const roleName = roleNames[s.role] || 'Teacher';
        const avColor = avatarColors[i % avatarColors.length];
        const initials = (s.full_name || 'U').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
        const statusPill = s.approved
            ? `<span class="ma-pill g">Approved</span>`
            : `<span class="ma-pill w">Pending</span>`;
        return `<div class="ma-scard">
            <div class="ma-av" style="background:${avColor};">${initials}</div>
            <div class="ma-who">
              <div class="ma-nm">${window.escapeHtml(s.full_name)}</div>
              <div class="ma-meta">${window.escapeHtml(roleName)}${s.designation?' · '+window.escapeHtml(s.designation):(s.department?' · '+window.escapeHtml(s.department):'')}</div>
            </div>
            ${statusPill}
            <button class="ma-kebab" onclick="window._admStaffSheet('${s.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
        </div>`;
    }).join('');
}

// Row-action bottom sheet for a staff member (mobile).
window._admStaffSheet = function(id) {
    const s = allStaff.find(x => String(x.id) === String(id));
    if (!s) return;
    const initials = (s.full_name || 'U').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    const email = window.escapeHtml(s.email), name = window.escapeHtml(s.full_name);
    let sheet = document.getElementById('maSheet');
    if (!sheet) { sheet = document.createElement('div'); sheet.id='maSheet'; sheet.className='ma-sheet-scrim'; document.body.appendChild(sheet); }
    sheet.innerHTML = `<div class="ma-sheet">
        <div class="ma-grab"></div>
        <div class="ma-sh-head">
          <div class="ma-av" style="background:#6366f1;">${initials}</div>
          <div style="min-width:0;"><div class="ma-nm">${name}</div><div class="ma-meta">${email}</div></div>
        </div>
        <button class="ma-act" onclick="window._admSheetClose();openEditStaffModal('${s.id}')"><i class="fa-solid fa-pen"></i> Edit details</button>
        <button class="ma-act" onclick="window._admSheetClose();openResetPwdModal('${email}','${name}')"><i class="fa-solid fa-key"></i> Reset password</button>
        <button class="ma-act" onclick="window._admSheetClose();toggleApproval('${s.id}', ${s.approved})"><i class="fa-solid fa-user-check"></i> ${s.approved?'Block (un-approve)':'Approve for login'}</button>
        <button class="ma-act danger" onclick="window._admSheetClose();archiveStaff('${s.id}','${name}')"><i class="fa-solid fa-box-archive"></i> Archive staff member</button>
        <button class="ma-act danger" onclick="window._admSheetClose();permanentDeleteStaff('${s.id}','${name}')"><i class="fa-solid fa-trash"></i> Delete permanently</button>
    </div>`;
    sheet.classList.add('open');
    sheet.onclick = (e) => { if (e.target === sheet) window._admSheetClose(); };
};
window._admSheetClose = function() { document.getElementById('maSheet')?.classList.remove('open'); };

// Scorecard as cards (mobile). Consumes the same RPC rows as the table.
function renderScoreCards(staff) {
    const box = document.getElementById('scorecardBody');
    if (!box) return;
    if (!staff.length) { box.innerHTML = `<div class="ma-empty">No task data for this period yet.</div>`; return; }
    const gradeColors = { 'A+':{bg:'#dcfce7',color:'#16a34a'},'A':{bg:'#dbeafe',color:'#1d4ed8'},'B':{bg:'#fef9c3',color:'#854d0e'},'C':{bg:'#ffedd5',color:'#c2410c'},'D':{bg:'#fee2e2',color:'#b91c1c'},'N/A':{bg:'#f1f5f9',color:'#64748b'} };
    box.innerHTML = staff.map(s => {
        const gc = gradeColors[s.grade] || gradeColors['N/A'];
        const pct = s.score ?? 0;
        const barColor = pct>=90?'#16a34a':pct>=65?'#f59e0b':'#ef4444';
        const ackRate = s.msgs_received>0 ? Math.round(s.acknowledged/s.msgs_received*100)+'%' : '—';
        return `<div class="ma-sc">
          <div class="ma-sc-top">
            <div class="ma-grade" style="background:${gc.bg};color:${gc.color};"><div class="g">${s.grade}</div><div class="gl">Grade</div></div>
            <div style="flex:1;min-width:0;">
              <div class="ma-nm">${window.escapeHtml(s.staff_name||'—')}</div>
              <div style="display:flex;align-items:baseline;gap:6px;margin:2px 0 5px;">
                <span style="font-size:19px;font-weight:900;color:${barColor};font-variant-numeric:tabular-nums;">${s.score!==null?s.score+'%':'—'}</span>
                <span style="font-size:11px;color:var(--text-secondary);">overall</span>
              </div>
              <div class="ma-bar"><i style="width:${Math.min(100,pct)}%;background:${barColor};"></i></div>
            </div>
            <button class="ma-kebab" onclick='window.downloadStaffScorecard(${JSON.stringify(s).replace(/'/g,"&#39;")})' title="Download card"><i class="fa-solid fa-download"></i></button>
          </div>
          <div class="ma-metrics">
            <div class="ma-metric"><div class="mv">${s.tasks_on_time||0}</div><div class="ml">On time</div></div>
            <div class="ma-metric"><div class="mv">${s.tasks_delayed||0}</div><div class="ml">Delayed</div></div>
            <div class="ma-metric"><div class="mv">${s.tasks_pending||0}</div><div class="ml">Pending</div></div>
            <div class="ma-metric"><div class="mv">${s.tasks_total||0}</div><div class="ml">Tasks</div></div>
            <div class="ma-metric"><div class="mv">${ackRate}</div><div class="ml">Ack rate</div></div>
            <div class="ma-metric"><div class="mv">${s.active_days||0}</div><div class="ml">Active</div></div>
          </div>
        </div>`;
    }).join('');
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

    if (error) { return; }

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
    if (IS_MOB()) return renderStaffCards(staff);
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
                    <button class="btn-outline btn-sm" onclick="openResetPwdModal('${window.escapeHtml(s.email)}','${window.escapeHtml(s.full_name)}')" title="Reset Password" style="color:#f59e0b;border-color:#fde68a;">
                        <i class="fa-solid fa-key"></i>
                    </button>
                    <div style="position:relative;display:inline-block;" class="action-menu-wrap">
                        <button class="btn-danger" title="Remove Options"
                            onclick="window._toggleStaffMenu(this)"
                            style="padding:5px 10px;">
                            <i class="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                        <div class="staff-action-menu" style="display:none;position:absolute;right:0;top:100%;margin-top:4px;
                             background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:10px;
                             box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:9999;min-width:180px;overflow:hidden;">
                            <button onclick="window._toggleStaffMenu(this.closest('.action-menu-wrap').querySelector('button'));archiveStaff('${s.id}','${window.escapeHtml(s.full_name)}')"
                                style="width:100%;padding:10px 14px;background:none;border:none;cursor:pointer;
                                       text-align:left;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                                <i class="fa-solid fa-box-archive" style="color:#f59e0b;"></i> Archive
                            </button>
                            <div style="height:1px;background:var(--border-color);"></div>
                            <button onclick="window._toggleStaffMenu(this.closest('.action-menu-wrap').querySelector('button'));permanentDeleteStaff('${s.id}','${window.escapeHtml(s.full_name)}')"
                                style="width:100%;padding:10px 14px;background:none;border:none;cursor:pointer;
                                       text-align:left;font-size:13px;color:#ef4444;display:flex;align-items:center;gap:8px;">
                                <i class="fa-solid fa-trash"></i> Delete Permanently
                            </button>
                        </div>
                    </div>
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
            // 1. Update allowed_users (name, role, designation, dept)
            const { error: auErr } = await sb.from('allowed_users')
                .update({ full_name, role, designation, department })
                .eq('id', editId)
                .eq('tenant_id', window.currentTenantId);
            if (auErr) throw new Error(auErr.message);

            // 2. Update profiles (name, designation, dept, role column)
            const staffEmail = document.getElementById('sfEmail').value.trim().toLowerCase();
            await sb.from('profiles')
                .update({ full_name, designation, department, role })
                .eq('email', staffEmail)
                .eq('tenant_id', window.currentTenantId);

            // 3. Update user_roles — THIS is what auth.js reads at login
            // First find the role_id from the roles table
            const { data: roleRow } = await sb.from('roles')
                .select('id')
                .eq('name', role)
                .maybeSingle();

            if (roleRow?.id) {
                // Find the profile id for this user
                const { data: prof } = await sb.from('profiles')
                    .select('id')
                    .eq('email', staffEmail)
                    .eq('tenant_id', window.currentTenantId)
                    .maybeSingle();

                if (prof?.id) {
                    // Upsert user_roles so role takes effect on next login
                    await sb.from('user_roles')
                        .upsert({
                            user_id:   prof.id,
                            tenant_id: window.currentTenantId,
                            role_id:   roleRow.id
                        }, { onConflict: 'user_id,tenant_id' });
                }
            }

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
        const msg = editId
            ? 'Staff updated ✓' + (editId ? ' — user must log out and back in for role change to take effect.' : '')
            : 'Staff member added ✓';
        showToast(msg, '#16a34a');

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
// ─── STAFF MENU TOGGLE ───────────────────────────────────────
window._toggleStaffMenu = function(btn) {
    const menu = btn.closest('.action-menu-wrap').querySelector('.staff-action-menu');
    const isOpen = menu.style.display === 'block';
    document.querySelectorAll('.staff-action-menu').forEach(m => m.style.display = 'none');
    menu.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        setTimeout(() => {
            document.addEventListener('click', function _c(e) {
                if (!e.target.closest('.action-menu-wrap')) {
                    document.querySelectorAll('.staff-action-menu').forEach(m => m.style.display = 'none');
                    document.removeEventListener('click', _c);
                }
            });
        }, 0);
    }
};

// ─── ARCHIVE (soft delete — recoverable by developer) ─────────
window.archiveStaff = async function(id, name) {
    if (!confirm('Archive ' + name + '?\n\nThey will be blocked from logging in but can be restored later.')) return;
    const { error } = await sb.from('allowed_users')
        .update({ deleted_at: new Date().toISOString(), approved: false })
        .eq('id', id)
        .eq('tenant_id', window.currentTenantId);
    if (error) { showToast('Archive failed: ' + error.message, '#dc2626'); return; }
    showToast(name + ' archived ✓', '#f59e0b');
    await loadStaff();
    await loadArchivedStaff();
};

// ─── PERMANENT DELETE ─────────────────────────────────────────
window.permanentDeleteStaff = async function(id, name) {
    if (!confirm('⚠️ Permanently delete ' + name + '?\n\nThis cannot be undone. Their messages and task history will remain but their account will be gone.')) return;
    if (!confirm('Are you absolutely sure? Type OK to confirm.')) return;
    const { error } = await sb.from('allowed_users')
        .delete()
        .eq('id', id)
        .eq('tenant_id', window.currentTenantId);
    if (error) { showToast('Delete failed: ' + error.message, '#dc2626'); return; }
    showToast(name + ' permanently deleted', '#ef4444');
    await loadStaff();
};

// ─── LOAD ARCHIVED STAFF ──────────────────────────────────────
window.loadArchivedStaff = async function() {
    const section = document.getElementById('archivedSection');
    const tbody   = document.getElementById('archivedTableBody');
    if (!section || !tbody) return;

    const { data, error } = await sb.from('allowed_users')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    if (error) { tbody.innerHTML = '<tr><td colspan="4" style="padding:16px;color:#ef4444;">Error: ' + error.message + '</td></tr>'; return; }

    if (!data || data.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    tbody.innerHTML = data.map(s => {
        const archivedDate = s.deleted_at ? new Date(s.deleted_at).toLocaleDateString('en-IN') : '—';
        return '<tr>' +
            '<td><div style="font-weight:700;font-size:13px;">' + window.escapeHtml(s.full_name || '—') + '</div>' +
            '<div style="font-size:11px;color:var(--text-secondary);">' + window.escapeHtml(s.email || '') + '</div></td>' +
            '<td><span class="role-pill role-' + (s.role||'teacher') + '">' + (s.role||'').replace('_',' ') + '</span></td>' +
            '<td style="font-size:12px;color:var(--text-secondary);">' + archivedDate + '</td>' +
            '<td><button class="btn-outline btn-sm" onclick="restoreStaff(\'' + s.id + '\',\'' + window.escapeHtml(s.full_name) + '\')" style="color:#16a34a;border-color:#16a34a;">' +
            '<i class="fa-solid fa-rotate-left"></i> Restore</button></td>' +
            '</tr>';
    }).join('');
};

// ─── RESTORE ARCHIVED STAFF ───────────────────────────────────
window.restoreStaff = async function(id, name) {
    if (!confirm('Restore ' + name + '? They will be able to log in again.')) return;
    const { error } = await sb.from('allowed_users')
        .update({ deleted_at: null, approved: true })
        .eq('id', id)
        .eq('tenant_id', window.currentTenantId);
    if (error) { showToast('Restore failed: ' + error.message, '#dc2626'); return; }
    showToast(name + ' restored ✓', '#16a34a');
    await loadStaff();
    await loadArchivedStaff();
};

// ─── RESET PASSWORD ──────────────────────────────────────────
let _resetTargetEmail = null;

window.openResetPwdModal = function(email, name) {
    _resetTargetEmail = email;
    document.getElementById('resetPwdForName').textContent = 'Resetting password for: ' + name;
    document.getElementById('resetNewPwd').value = '';
    document.getElementById('resetPwdErr').style.display = 'none';
    document.getElementById('resetPwdModal').classList.add('open');
};

window.closeResetPwdModal = function() {
    document.getElementById('resetPwdModal').classList.remove('open');
    _resetTargetEmail = null;
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
                email:        _resetTargetEmail,
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

    if (IS_MOB()) { renderScoreCards(staff); if (note) note.style.display = 'block'; return; }

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
        const ackRate = s.msgs_received > 0
            ? Math.round(s.acknowledged / s.msgs_received * 100) + '%'
            : '—';

        return `<tr>
            <td>
                <div style="font-weight:700;font-size:13px;">${window.escapeHtml(s.staff_name || '—')}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${window.escapeHtml(s.email || '')}</div>
                ${s.designation ? `<div style="font-size:10px;color:var(--text-secondary);">${window.escapeHtml(s.designation)}</div>` : ''}
            </td>
            <td><span class="role-pill role-${(s.role||'teacher').toLowerCase().replace(/ /g,'_')}" style="font-size:10px;">${window.escapeHtml(s.role||'')}</span></td>
            <td style="text-align:center;font-weight:700;border-left:2px solid var(--border-color);">${s.tasks_total||0}</td>
            <td style="text-align:center;color:#16a34a;font-weight:700;">${s.tasks_on_time||0}</td>
            <td style="text-align:center;color:#f59e0b;font-weight:700;">${s.tasks_delayed||0}</td>
            <td style="text-align:center;color:#ef4444;font-weight:700;">${s.tasks_pending||0}</td>
            <td style="text-align:center;color:#6366f1;font-weight:700;">${s.tasks_transferred||0}</td>
            <td style="text-align:center;border-left:2px solid var(--border-color);">${s.msgs_sent||0}</td>
            <td style="text-align:center;">${s.msgs_received||0}</td>
            <td style="text-align:center;" title="Reactions + Replies / Messages Received">${ackRate}</td>
            <td style="text-align:center;border-left:2px solid var(--border-color);">${s.active_days||0}</td>
            <td style="text-align:center;border-left:2px solid var(--border-color);">
                <div style="font-size:15px;font-weight:800;color:${barColor};">${s.score !== null ? s.score + '%' : '—'}</div>
                ${s.tasks_total > 0 ? `<div style="width:60px;height:4px;background:var(--border-color);border-radius:4px;margin:3px auto 0;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;"></div>
                </div>` : ''}
            </td>
            <td style="text-align:center;">
                <span style="background:${gc.bg};color:${gc.color};padding:3px 12px;border-radius:20px;font-size:12px;font-weight:800;">${s.grade}</span>
            </td>
            <td style="text-align:center;">
                <button class="btn-outline btn-sm" onclick='window.downloadStaffScorecard(${JSON.stringify(s).replace(/'/g,"&#39;")})' style="font-size:11px;padding:4px 8px;" title="Download scorecard">
                    <i class="fa-solid fa-download"></i>
                </button>
            </td>
        </tr>`;
    }).join('');

    if (note) note.style.display = 'block';
    showToast('Scorecard generated ✓', '#16a34a');
};

// ─── INLINE ROLES TABLE ──────────────────────────────────────
const ROLE_PERMS_MAP = {
    principal:       { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:1,admin:1,manageStaff:1,reminders:1,assignable:0 },
    management:      { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:1,admin:1,manageStaff:0,reminders:1,assignable:0 },
    vp_admin:        { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:1,admin:1,manageStaff:1,reminders:1,assignable:1 },
    hod:             { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:1,admin:0,manageStaff:0,reminders:1,assignable:1 },
    exam_controller: { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:1,admin:0,manageStaff:0,reminders:1,assignable:1 },
    coordinator:     { schedule:1,upload:1,createTask:1,taskHub:1,groups:1,activity:1,dashboard:0,admin:0,manageStaff:0,reminders:1,assignable:1 },
    teacher:         { schedule:0,upload:1,createTask:0,taskHub:1,groups:0,activity:1,dashboard:0,admin:0,manageStaff:0,reminders:1,assignable:1 },
    admin_staff:     { schedule:0,upload:1,createTask:0,taskHub:1,groups:0,activity:1,dashboard:0,admin:0,manageStaff:0,reminders:1,assignable:1 },
    support_staff:   { schedule:0,upload:1,createTask:0,taskHub:1,groups:0,activity:1,dashboard:0,admin:0,manageStaff:0,reminders:1,assignable:1 },
};
const PERM_LABELS = [
    {key:'schedule',    label:'Schedule Msg'},
    {key:'upload',      label:'Upload Files'},
    {key:'createTask',  label:'Create Task'},
    {key:'taskHub',     label:'Task Hub'},
    {key:'groups',      label:'Manage Groups'},
    {key:'activity',    label:'Activity Feed'},
    {key:'dashboard',   label:'Dashboard'},
    {key:'admin',       label:'Admin Panel'},
    {key:'reminders',   label:'Reminders'},
    {key:'assignable',  label:'Can Be Assigned'},
];
const ROLE_PERMS_MATRIX = [
    { perm:'Send Messages',      principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Schedule Messages',  principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:0,support_staff:0 },
    { perm:'Upload Files',       principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Create Tasks',       principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:0,support_staff:0 },
    { perm:'View Task Hub',      principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Can Be Assigned Task',principal:0,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Manage Groups/Depts',principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:0,support_staff:0 },
    { perm:'View Activity Feed', principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'View Dashboard',     principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:0,teacher:0,support_staff:0 },
    { perm:'Admin Panel',        principal:1,vp_admin:1,hod:0,exam_controller:0,coordinator:0,teacher:0,support_staff:0 },
    { perm:'Manage Staff',       principal:1,vp_admin:1,hod:0,exam_controller:0,coordinator:0,teacher:0,support_staff:0 },
    { perm:'Set Reminders',      principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Edit/Delete Own Msg',principal:1,vp_admin:1,hod:1,exam_controller:1,coordinator:1,teacher:1,support_staff:1 },
    { perm:'Moderate Others Msg',principal:1,vp_admin:1,hod:0,exam_controller:0,coordinator:0,teacher:0,support_staff:0 },
];
const ROLE_COLS = [
    {key:'principal',label:'Principal'},{key:'vp_admin',label:'VP/Admin'},
    {key:'hod',label:'HOD'},{key:'exam_controller',label:'Exam Ctrl'},
    {key:'coordinator',label:'Coordinator'},{key:'teacher',label:'Teacher'},
    {key:'support_staff',label:'Support'},
];

async function renderInlineRolesTable() {
    const tbody = document.getElementById('rolesInlineTbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="12" style="padding:20px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

    const { data: profiles } = await sb.from('profiles')
        .select('id,full_name,email,role,designation,department')
        .eq('tenant_id', window.currentTenantId)
        .is('deleted_at', null)
        .order('full_name');

    const { data: userRoles } = await sb.from('user_roles')
        .select('user_id, roles(name)')
        .eq('tenant_id', window.currentTenantId);

    const roleMap = {};
    (userRoles||[]).forEach(ur => { roleMap[ur.user_id] = ur.roles?.name; });

    if (!profiles?.length) {
        tbody.innerHTML = `<tr><td colspan="12" style="padding:20px;text-align:center;color:var(--text-secondary);">No staff found.</td></tr>`;
        return;
    }

    const tick = v => v
        ? '<span style="color:#16a34a;font-size:15px;font-weight:900;">✓</span>'
        : '<span style="color:#e5e7eb;font-size:14px;">—</span>';

    tbody.innerHTML = profiles.map((p, i) => {
        const role = roleMap[p.id] || p.role || 'teacher';
        const perms = ROLE_PERMS_MAP[role] || ROLE_PERMS_MAP.teacher;
        const roleLabel = role.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
        return `<tr style="${i%2?'':'background:var(--bg-body);'}">
            <td style="font-size:13px;">
                <div style="font-weight:700;">${window.escapeHtml(p.full_name||'—')}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${window.escapeHtml(p.email||'')}</div>
            </td>
            <td><span class="role-pill role-${role}" style="font-size:11px;">${roleLabel}</span></td>
            ${PERM_LABELS.map(pl=>`<td style="text-align:center;">${tick(perms[pl.key])}</td>`).join('')}
        </tr>`;
    }).join('');
}

// ─── ROLES PDF ───────────────────────────────────────────────
window.printRolesPDF = function() {
    const school = window.currentSchoolName || 'School';
    const rows = ROLE_PERMS_MATRIX.map((r,i) => `
        <tr style="background:${i%2?'#f9f9f9':'#fff'};">
            <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;font-weight:600;">${r.perm}</td>
            ${ROLE_COLS.map(c=>`<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;font-size:18px;font-weight:900;color:${r[c.key]?'#16a34a':'#d1d5db'};">${r[c.key]?'✓':'—'}</td>`).join('')}
        </tr>`).join('');
    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${school} — Roles & Permissions</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Inter',sans-serif;background:#fff;padding:32px;}
      .hdr{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;padding:28px 32px;border-radius:16px;margin-bottom:24px;position:relative;overflow:hidden;}
      .hdr::after{content:'';position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.08);}
      h1{font-size:22px;font-weight:900;margin-bottom:4px;position:relative;z-index:1;}
      .sub{font-size:12px;opacity:.8;position:relative;z-index:1;}
      .legend{display:flex;gap:20px;margin-bottom:16px;font-size:12px;align-items:center;}
      table{width:100%;border-collapse:collapse;}
      th{padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;text-align:center;}
      th:first-child{text-align:left;min-width:180px;}
      .foot{margin-top:24px;font-size:11px;color:#9ca3af;text-align:center;}
      @media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
    <div class="hdr"><h1>🛡️ Roles &amp; Permissions</h1><div class="sub">${school} · Generated ${new Date().toLocaleString('en-IN')}</div></div>
    <div class="legend">
      <strong style="color:#16a34a;font-size:18px;">✓</strong> = Granted &nbsp;
      <strong style="color:#d1d5db;font-size:16px;">—</strong> = Not applicable
    </div>
    <table><thead><tr><th style="text-align:left;">Permission</th>${ROLE_COLS.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="foot">MPGS TaskFlow · Role-Based Access Control</div>
    <script>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
};

// ─── PRINT STAFF TABLE ───────────────────────────────────────
window.printStaffTable = function() {
    const school = window.currentSchoolName || 'School';
    const rows = allStaff.map((s,i) => `<tr style="background:${i%2?'#f9f9f9':'#fff'};">
        <td>${s.full_name||'—'}</td><td>${s.email||'—'}</td>
        <td>${(s.role||'').replace('_',' ')}</td><td>${s.designation||'—'}</td>
        <td>${s.department||'—'}</td>
        <td>${s.last_login?new Date(s.last_login).toLocaleDateString('en-IN'):'Never'}</td>
        <td>${s.approved?'Active':'Blocked'}</td>
    </tr>`).join('');
    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${school} Staff</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Inter',sans-serif;padding:24px;font-size:12px;}
    .hdr{background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:18px;}
    h1{font-size:18px;font-weight:900;margin-bottom:3px;}.sub{font-size:11px;opacity:.8;}
    table{width:100%;border-collapse:collapse;}th{padding:8px 10px;background:#f8fafc;border:1px solid #e5e7eb;font-size:10px;font-weight:800;text-transform:uppercase;text-align:left;}
    td{padding:7px 10px;border:1px solid #e5e7eb;}
    @media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
    <div class="hdr"><h1>${school} — Staff Directory</h1><div class="sub">${allStaff.length} members · ${new Date().toLocaleString('en-IN')}</div></div>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Designation</th><th>Department</th><th>Last Login</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <script>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
};

// ─── PRINT SCORECARD ─────────────────────────────────────────
window.printScorecard = function() {
    const tbody = document.getElementById('scorecardBody');
    if (!tbody || tbody.textContent.includes('Generate Scorecard')) { alert('Generate the scorecard first.'); return; }
    const school = window.currentSchoolName || 'School';
    const period = document.getElementById('scMonth')?.selectedOptions[0]?.text || '';
    const rows = Array.from(tbody.querySelectorAll('tr')).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (!cells.length) return '';
        const nameDiv  = cells[0]?.querySelector('div:first-child')?.innerText || '';
        const emailDiv = cells[0]?.querySelector('div:nth-child(2)')?.innerText || '';
        const rest = cells.slice(1, 13).map((td, i) =>
            `<td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;">${td.innerText.trim()}</td>`
        ).join('');
        return `<tr>
            <td style="padding:7px 10px;border:1px solid #e5e7eb;">
                <div style="font-weight:700;">${nameDiv}</div>
                <div style="font-size:10px;color:#6b7280;">${emailDiv}</div>
            </td>${rest}</tr>`;
    }).join('');
    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${school} Scorecard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Inter',sans-serif;padding:24px;font-size:12px;}
    .hdr{background:linear-gradient(135deg,#6366f1,#4338ca);color:#fff;padding:22px 26px;border-radius:14px;margin-bottom:18px;position:relative;overflow:hidden;}
    .hdr::after{content:'';position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.08);}
    h1{font-size:20px;font-weight:900;margin-bottom:3px;position:relative;z-index:1;}.sub{font-size:11px;opacity:.8;position:relative;z-index:1;}
    .grades{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
    .grades span{padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;}
    table{width:100%;border-collapse:collapse;}
    th{padding:9px 10px;background:#f8fafc;border:1px solid #e5e7eb;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;text-align:center;}
    th:first-child{text-align:left;}td{padding:7px 10px;border:1px solid #e5e7eb;vertical-align:top;}
    .foot{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center;}
    @media print{.hdr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>
    <div class="hdr"><h1>🏆 Staff Scorecard</h1><div class="sub">${school} · ${period} · ${new Date().toLocaleString('en-IN')}</div></div>
    <div class="grades">
      <span style="background:#dcfce7;color:#16a34a;">A+ ≥90%</span>
      <span style="background:#dbeafe;color:#1d4ed8;">A ≥80%</span>
      <span style="background:#fef9c3;color:#854d0e;">B ≥65%</span>
      <span style="background:#ffedd5;color:#c2410c;">C ≥50%</span>
      <span style="background:#fee2e2;color:#b91c1c;">D &lt;50%</span>
      <span style="color:#6b7280;font-weight:400;">Task×40% + Comm×25% + Resp×20% + Presence×15%</span>
    </div>
    <table><thead><tr>
      <th style="text-align:left;">Staff Member</th><th>Role</th>
      <th>Tasks</th><th style="color:#16a34a;">On Time</th>
      <th style="color:#f59e0b;">Delayed</th><th style="color:#ef4444;">Pending</th>
      <th style="color:#8b5cf6;">Transferred</th>
      <th>Sent</th><th>Rcvd</th><th>Ack%</th>
      <th>Active Days</th><th>Score</th><th>Grade</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">MPGS TaskFlow · Objective & Transparent Performance Scoring</div>
    <script>setTimeout(()=>window.print(),400);<\/script></body></html>`);
    w.document.close();
};

// ─── INDIVIDUAL SCORECARD ─────────────────────────────────────
window.downloadStaffScorecard = function(s) {
    const school = window.currentSchoolName || 'School';
    const period = document.getElementById('scMonth')?.selectedOptions[0]?.text || '';
    const gColors = {'A+':'#16a34a','A':'#1d4ed8','B':'#854d0e','C':'#c2410c','D':'#b91c1c','N/A':'#64748b'};
    const gc = gColors[s.grade]||'#64748b';
    const pct = s.score??0;
    const barColor = pct>=90?'#16a34a':pct>=65?'#f59e0b':'#ef4444';
    const ackRate = s.msgs_received>0 ? Math.round(s.acknowledged/s.msgs_received*100)+'%' : '—';

    const dimBar = (label, score, color, weight) => {
        const v = score??0;
        return `<div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <span style="font-size:12px;font-weight:600;color:#374151;">${label}</span>
                <span style="font-size:12px;font-weight:700;color:${v>=80?'#16a34a':v>=50?'#f59e0b':'#ef4444'};">${score!==null?v+'%':'N/A'} <span style="font-size:10px;font-weight:400;color:#9ca3af;">×${weight}</span></span>
            </div>
            <div style="height:6px;background:#f1f5f9;border-radius:6px;overflow:hidden;">
                <div style="width:${Math.min(100,v)}%;height:100%;background:${v>=80?'#16a34a':v>=50?'#f59e0b':'#ef4444'};border-radius:6px;"></div>
            </div>
        </div>`;
    };

    const statCell = (label, value, color) =>
        `<div style="text-align:center;background:#f8fafc;border-radius:10px;padding:12px 8px;">
            <div style="font-size:20px;font-weight:800;color:${color};">${value}</div>
            <div style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">${label}</div>
        </div>`;

    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Scorecard — ${s.staff_name}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
    .card{width:520px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.12),0 4px 16px rgba(0,0,0,.06);}
    .top{background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:28px 28px 24px;color:#fff;position:relative;overflow:hidden;}
    .top::before{content:'';position:absolute;top:-40px;right:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.07);}
    .top::after{content:'';position:absolute;bottom:-50px;left:-30px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.05);}
    .school{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:5px;position:relative;z-index:1;}
    .card-lbl{font-size:11px;opacity:.65;margin-bottom:16px;position:relative;z-index:1;}
    .name{font-size:22px;font-weight:900;margin-bottom:3px;position:relative;z-index:1;letter-spacing:-.3px;}
    .meta{font-size:12px;opacity:.75;position:relative;z-index:1;}
    .body{padding:24px 28px;}
    .period{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:9px 14px;font-size:12px;color:#1d4ed8;font-weight:600;margin-bottom:20px;display:flex;align-items:center;gap:8px;}
    .score-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:16px 20px;background:#f8fafc;border-radius:14px;}
    .grade-circle{width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:3px solid ${gc}40;background:${gc}12;}
    .gl{font-size:28px;font-weight:900;color:${gc};line-height:1;}
    .glbl{font-size:9px;font-weight:700;color:${gc};letter-spacing:1px;text-transform:uppercase;}
    .score-num{font-size:42px;font-weight:900;color:${barColor};line-height:1;}
    .score-lbl{font-size:11px;color:#9ca3af;font-weight:600;margin-top:2px;}
    .bar-track{height:6px;background:#e5e7eb;border-radius:6px;overflow:hidden;width:140px;margin:6px 0 0 auto;}
    .bar-fill{height:100%;width:${Math.min(100,pct)}%;background:${barColor};border-radius:6px;}
    .task-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px;}
    .msg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px;}
    .section-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px;}
    .dim-section{margin-bottom:20px;}
    .formula-note{font-size:10px;color:#9ca3af;text-align:center;padding-top:8px;border-top:1px solid #f1f5f9;line-height:1.6;}
    .foot{background:#f8fafc;border-top:1px solid #f1f5f9;padding:13px 28px;font-size:10px;color:#9ca3af;text-align:center;}
    @media print{body{background:#fff;padding:0;}.card{box-shadow:none;border-radius:0;width:100%;}.top{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style></head><body>
    <div class="card">
      <div class="top">
        <div class="school">${school}</div>
        <div class="card-lbl">Staff Performance Scorecard</div>
        <div class="name">${s.staff_name||'—'}</div>
        <div class="meta">${s.role||''}${s.designation?' · '+s.designation:''}</div>
      </div>
      <div class="body">
        <div class="period">📅 ${period}</div>

        <!-- Final score & grade -->
        <div class="score-row">
          <div class="grade-circle"><div class="gl">${s.grade}</div><div class="glbl">Grade</div></div>
          <div style="text-align:right;">
            <div class="score-num">${s.score!==null?s.score+'%':'—'}</div>
            <div class="score-lbl">Overall Performance</div>
            <div class="bar-track"><div class="bar-fill"></div></div>
          </div>
        </div>

        <!-- Task stats -->
        <div class="section-lbl">Task Performance (40%)</div>
        <div class="task-grid">
          ${statCell('Total', s.tasks_total||0, '#6366f1')}
          ${statCell('On Time', s.tasks_on_time||0, '#16a34a')}
          ${statCell('Delayed', s.tasks_delayed||0, '#f59e0b')}
          ${statCell('Pending', s.tasks_pending||0, '#ef4444')}
          ${statCell('Transferred', s.tasks_transferred||0, '#8b5cf6')}
        </div>

        <!-- Communication stats -->
        <div class="section-lbl">Communication (25%) · Responsiveness (20%) · Presence (15%)</div>
        <div class="msg-grid">
          ${statCell('Msgs Sent', s.msgs_sent||0, '#0ea5e9')}
          ${statCell('Msgs Rcvd', s.msgs_received||0, '#64748b')}
          ${statCell('Ack Rate', ackRate, '#10b981')}
        </div>
        <div class="msg-grid" style="margin-bottom:20px;">
          ${statCell('Active Days', s.active_days||0, '#f59e0b')}
          ${statCell('Reactions+Replies', s.acknowledged||0, '#6366f1')}
          ${statCell('Day Score', (s.score_presence||0)+'%', '#64748b')}
        </div>

        <!-- Dimension breakdown -->
        <div class="dim-section">
          <div class="section-lbl">Score breakdown</div>
          ${dimBar('Task Delivery', s.score_task, barColor, '40%')}
          ${dimBar('Communication', s.score_comm, '#0ea5e9', '25%')}
          ${dimBar('Responsiveness', s.score_resp, '#10b981', '20%')}
          ${dimBar('Presence', s.score_presence, '#f59e0b', '15%')}
        </div>
      </div>
      <div class="foot">Generated by MPGS TaskFlow · ${new Date().toLocaleString('en-IN')} · Objective &amp; Transparent</div>
    </div>
    <script>setTimeout(()=>window.print(),500);<\/script>
    </body></html>`);
    w.document.close();
};

// ─── BULK ADD ─────────────────────────────────────────────────
window.openBulkAddModal = function() {
    let modal = document.getElementById('bulkAddModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'bulkAddModal';
        modal.className = 'modal-wrap';
        modal.innerHTML = `
        <div class="modal-card" style="max-width:540px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
                <h3 style="font-size:15px;font-weight:800;color:var(--text-primary);margin:0;">
                    <i class="fa-solid fa-file-csv" style="color:#0ea5e9;margin-right:8px;"></i>Bulk Add Staff
                </h3>
                <button onclick="document.getElementById('bulkAddModal').classList.remove('open')"
                    style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-secondary);">✕</button>
            </div>
            <div style="background:var(--bg-body);border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--text-secondary);">
                1. Download sample CSV &nbsp; 2. Fill in details &nbsp; 3. Upload — passwords auto-set to <strong>firstname123</strong>
            </div>
            <button class="btn-outline" onclick="window.downloadSampleCSV()" style="width:100%;justify-content:center;margin-bottom:12px;">
                <i class="fa-solid fa-download"></i> Download Sample CSV
            </button>
            <div class="field">
                <label>Upload Filled CSV</label>
                <input type="file" id="bulkCSVInput" accept=".csv"
                    style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-body);color:var(--text-primary);font-size:12px;">
            </div>
            <div id="bulkPreview" style="display:none;margin-bottom:12px;max-height:180px;overflow-y:auto;background:var(--bg-body);border:1px solid var(--border-color);border-radius:9px;padding:10px;font-size:12px;"></div>
            <div class="err-msg" id="bulkErr"></div>
            <div style="display:flex;gap:10px;margin-top:10px;">
                <button class="btn-outline" style="flex:1;" onclick="document.getElementById('bulkAddModal').classList.remove('open')">Cancel</button>
                <button class="btn-accent" style="flex:2;" id="bulkAddBtn" onclick="window.doBulkAdd()">
                    <i class="fa-solid fa-users"></i> Add All Staff
                </button>
            </div>
            <div id="bulkProgress" style="display:none;margin-top:10px;font-size:12px;color:var(--text-secondary);"></div>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById('bulkCSVInput').addEventListener('change', function() {
            const reader = new FileReader();
            reader.onload = e => {
                const lines = e.target.result.split('\n').filter(l=>l.trim());
                const dataLines = lines.slice(1);
                const preview = document.getElementById('bulkPreview');
                if (!dataLines.length) { preview.style.display='none'; return; }
                preview.style.display = 'block';
                let pwdVisible = false;
                const makeTable = (show) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <strong style="font-size:12px;">${dataLines.length} staff detected</strong>
                        <button id="pwdToggleBtn" onclick="(function(){
                            var btn=document.getElementById('pwdToggleBtn');
                            var cells=document.querySelectorAll('.pwd-cell');
                            var hidden=cells[0]?.dataset.hidden==='1';
                            cells.forEach(c=>{c.textContent=hidden?c.dataset.pwd:'••••••••';c.dataset.hidden=hidden?'0':'1';});
                            btn.innerHTML=hidden?'<i class=\\'fa-solid fa-eye-slash\\'></i> Hide':'<i class=\\'fa-solid fa-eye\\'></i> Show passwords';
                        })()" style="font-size:11px;padding:3px 10px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-body);color:var(--text-secondary);cursor:pointer;">
                            <i class="fa-solid fa-eye"></i> Show passwords
                        </button>
                    </div>
                    <div style="overflow-x:auto;max-height:160px;overflow-y:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead><tr style="background:var(--bg-body);">
                            <th style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:left;font-weight:700;">Name</th>
                            <th style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:left;font-weight:700;">Email</th>
                            <th style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:left;font-weight:700;">Role</th>
                            <th style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:left;font-weight:700;">Dept</th>
                            <th style="padding:5px 8px;border-bottom:1px solid var(--border-color);text-align:left;font-weight:700;">Default Password</th>
                        </tr></thead>
                        <tbody>
                        ${dataLines.map((l,i) => {
                            const [name,email,role,dept] = l.split(',').map(x=>x?.trim());
                            const pwd = (name||'').split(' ').pop().toLowerCase().replace(/[^a-z]/g,'')+'123';
                            return `<tr style="${i%2?'':'background:var(--bg-body);opacity:.7;'}">
                                <td style="padding:5px 8px;border-bottom:1px solid var(--border-color);">${name||'—'}</td>
                                <td style="padding:5px 8px;border-bottom:1px solid var(--border-color);color:var(--text-secondary);">${email||'—'}</td>
                                <td style="padding:5px 8px;border-bottom:1px solid var(--border-color);">${(role||'teacher').replace(/_/g,' ')}</td>
                                <td style="padding:5px 8px;border-bottom:1px solid var(--border-color);">${dept||'—'}</td>
                                <td style="padding:5px 8px;border-bottom:1px solid var(--border-color);">
                                    <span class="pwd-cell" data-pwd="${pwd}" data-hidden="1" style="font-family:'Inter',sans-serif;letter-spacing:2px;">••••••••</span>
                                </td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                    </div>`;
                preview.innerHTML = makeTable(false);
            };
            reader.readAsText(this.files[0]);
        });
    }
    modal.classList.add('open');
};

window.downloadSampleCSV = function() {
    const csv = `full_name,email,role,department,designation\nMr. Rajesh Kumar,rajesh@school.com,teacher,Science,Physics Teacher\nMrs. Priya Sharma,priya@school.com,hod,Mathematics,Head of Department`;
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'staff_bulk_upload_sample.csv';
    a.click();
};

window.doBulkAdd = async function() {
    const fileInput = document.getElementById('bulkCSVInput');
    const btn       = document.getElementById('bulkAddBtn');
    const errEl     = document.getElementById('bulkErr');
    const progress  = document.getElementById('bulkProgress');
    errEl.style.display = 'none';

    if (!fileInput.files[0]) {
        errEl.textContent = 'Upload a CSV file first.';
        errEl.style.display = 'block';
        return;
    }

    const lines = (await fileInput.files[0].text())
        .split('\n').map(l => l.trim()).filter(l => l).slice(1);
    if (!lines.length) {
        errEl.textContent = 'No data rows found.';
        errEl.style.display = 'block';
        return;
    }

    // ── Duplicate check against existing staff ──────────────
    const existingEmails = new Set((allStaff || []).map(s => (s.email||'').toLowerCase()));
    const duplicates = [];
    const uniqueLines = lines.filter(l => {
        const email = (l.split(',')[1] || '').trim().toLowerCase();
        if (!email) return true;
        if (existingEmails.has(email)) { duplicates.push(email); return false; }
        return true;
    });

    if (duplicates.length) {
        const dupList = duplicates.slice(0, 5).join(', ') + (duplicates.length > 5 ? ` ...and ${duplicates.length - 5} more` : '');
        const proceed = confirm(
            `⚠️ ${duplicates.length} duplicate email(s) already exist in the system and will be skipped:\n\n${dupList}\n\nProceed with the ${uniqueLines.length} unique staff member(s)?`
        );
        if (!proceed) return;
    }

    if (!uniqueLines.length) {
        errEl.textContent = 'All emails already exist — nothing to add.';
        errEl.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding...';
    progress.style.display = 'block';

    const { data: { session } } = await sb.auth.getSession();
    let added = 0, failed = 0, failedNames = [];

    for (let i = 0; i < uniqueLines.length; i++) {
        const [full_name, email, role, department, designation] = uniqueLines[i].split(',').map(x => x?.trim());
        if (!full_name || !email) { failed++; failedNames.push(`Row: missing name/email`); continue; }
        const password = full_name.split(' ').pop().toLowerCase().replace(/[^a-z]/g, '') + '123';
        progress.textContent = `Adding ${i + 1}/${uniqueLines.length}: ${full_name}...`;
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/create-school-user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
                body: JSON.stringify({ email, password, full_name, role: role||'teacher', designation: designation||'', department: department||'' })
            });
            const r = await res.json();
            if (!res.ok || r.error) { failed++; failedNames.push(`${full_name}: ${r.error}`); }
            else added++;
        } catch(e) { failed++; failedNames.push(`${full_name}: ${e.message}`); }
    }

    progress.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-users"></i> Add All Staff';

    let msg = `✓ Added ${added}`;
    if (duplicates.length) msg += ` · ${duplicates.length} duplicate(s) skipped`;
    if (failed) msg += ` · ${failed} failed`;
    showToast(msg, added ? '#16a34a' : '#dc2626');

    if (added) {
        document.getElementById('bulkAddModal').classList.remove('open');
        await loadStaff();
    }
};

// ─── COLLAPSIBLE SECTIONS ─────────────────────────────────────
window._toggleSection = function(id) {
    const body = document.getElementById('section-' + id);
    const chev = document.getElementById('chevron-' + id);
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    if (chev) chev.style.transform = collapsed ? '' : 'rotate(180deg)';
};

// ─── QUICK TAGS ───────────────────────────────────────────────
const DEFAULT_TAGS = [
    {v:'Thank You',c:'#16a34a',bg:'#f0fdf4',border:'#bbf7d0'},
    {v:'Noted',    c:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
    {v:'Copied',   c:'#7c3aed',bg:'#f5f3ff',border:'#ddd6fe'},
    {v:'Yes Sir',  c:'#c2410c',bg:'#fff7ed',border:'#fed7aa'},
    {v:'Yes Madam',c:'#be185d',bg:'#fdf2f8',border:'#fbcfe8'},
];

function getTagKey() { return 'quickTags_' + (window.currentTenantId || 'default'); }

function loadQuickTagsUI() {
    const container = document.getElementById('tagsContainer');
    if (!container) return;
    const raw = localStorage.getItem(getTagKey());
    const tags = raw ? JSON.parse(raw) : DEFAULT_TAGS;
    window._quickTags = tags; // keep messages.js in sync
    if (!tags.length) {
        container.innerHTML = '<span style="font-size:12px;color:var(--text-secondary);">No tags yet. Add one above.</span>';
        return;
    }
    container.innerHTML = tags.map((t,i) =>
        '<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 12px;border-radius:20px;font-size:13px;font-weight:700;cursor:default;border:1px solid ' + t.border + ';background:' + t.bg + ';color:' + t.c + ';">' +
        t.v +
        '<button onclick="window.editQuickTag(' + i + ')" title="Edit" style="background:none;border:none;cursor:pointer;color:' + t.c + ';font-size:11px;padding:0 2px;opacity:.7;">✏️</button>' +
        '<button onclick="window.deleteQuickTag(' + i + ')" title="Delete" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;padding:0 2px;">✕</button>' +
        '</div>'
    ).join('');
}

window.addQuickTag = function() {
    const label = document.getElementById('newTagInput')?.value.trim();
    const hex   = document.getElementById('newTagColor')?.value || '#1d4ed8';
    if (!label) { showToast('Enter a tag label first.','#ef4444'); return; }
    const raw  = localStorage.getItem(getTagKey());
    const tags = raw ? JSON.parse(raw) : [...DEFAULT_TAGS];
    if (tags.find(t => t.v.toLowerCase() === label.toLowerCase())) {
        showToast('Tag already exists.','#f59e0b'); return;
    }
    const bg = hex + '18', border = hex + '55';
    tags.push({v:label, c:hex, bg, border});
    localStorage.setItem(getTagKey(), JSON.stringify(tags));
    window._quickTags = tags;
    document.getElementById('newTagInput').value = '';
    loadQuickTagsUI();
    showToast('"' + label + '" tag added.','#16a34a');
};

window.editQuickTag = function(idx) {
    const raw  = localStorage.getItem(getTagKey());
    const tags = raw ? JSON.parse(raw) : [...DEFAULT_TAGS];
    const t    = tags[idx];
    if (!t) return;
    const newLabel = prompt('Edit tag label:', t.v);
    if (newLabel === null) return;
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    tags[idx].v = trimmed;
    localStorage.setItem(getTagKey(), JSON.stringify(tags));
    window._quickTags = tags;
    loadQuickTagsUI();
};

window.deleteQuickTag = function(idx) {
    const raw  = localStorage.getItem(getTagKey());
    const tags = raw ? JSON.parse(raw) : [...DEFAULT_TAGS];
    const name = tags[idx]?.v;
    if (!name || !confirm('Delete tag "' + name + '"?')) return;
    tags.splice(idx, 1);
    localStorage.setItem(getTagKey(), JSON.stringify(tags));
    window._quickTags = tags;
    loadQuickTagsUI();
    showToast('"' + name + '" deleted.','#ef4444');
};

// ─── THEME TOGGLE ─────────────────────────────────────────────
window.toggleAdminTheme = function() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('adminTheme', next);
};
;(()=>{ const t=localStorage.getItem('adminTheme'); if(t) document.documentElement.setAttribute('data-theme',t); })();

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
