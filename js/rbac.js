/**
 * rbac.js — MPGS TaskFlow v1.62
 * Role-Based Access Control + Feature Flag enforcement.
 * Called by main.js after renderMainApp() and after loadChatsList().
 *
 * ROLES (low → high privilege)
 *   support_staff | teacher | admin_staff | coordinator | exam_controller | hod | vp_admin | management | principal
 *
 * CAPABILITY MAP (confirmed)
 *   Group create/manage : management, principal, vp_admin, exam_controller, coordinator, hod
 *   Task create         : management, principal, vp_admin, hod, coordinator, exam_controller
 *   Task hub visible    : ALL roles
 *   Task update/submit  : assignee, irrespective of role
 *   Task assign-to      : NOT principal, NOT management
 *   Schedule message    : management, principal, vp_admin, hod, coordinator, exam_controller
 *   File upload         : ALL roles (feature-flagged)
 *   Send messages       : ALL roles
 *   Edit/delete own msg : ALL roles (within 30 min)
 *   Delete any msg      : principal, vp_admin, management only
 *   Admin panel         : principal, vp_admin, management
 */

// ─────────────────────────────────────────────────────────────
// ROLE SETS — single source of truth; update here to affect all
// ─────────────────────────────────────────────────────────────
const R = window._ROLES = {
    GROUP_MANAGERS : ['management','principal','vp_admin','exam_controller','coordinator','hod'],
    TASK_CREATORS  : ['management','principal','vp_admin','hod','coordinator','exam_controller'],
    SCHEDULERS     : ['management','principal','vp_admin','hod','coordinator','exam_controller'],
    TASK_FORBIDDEN : ['principal','management'],   // cannot be assigned a task
    ADMIN_PANEL    : ['principal','vp_admin','management'],
    MSG_MODERATORS : ['principal','vp_admin','management'],
};

// ─────────────────────────────────────────────────────────────
// ROLE HELPERS
// ─────────────────────────────────────────────────────────────
window.isTeacher       = () => !window.currentRole ||
    ['teacher','support_staff','admin_staff'].includes(window.currentRole);

window.isAdmin         = () => R.ADMIN_PANEL.includes(window.currentRole);
window.isHOD           = () => ['hod','exam_controller','coordinator'].includes(window.currentRole);
window.isSeniorStaff   = () => R.GROUP_MANAGERS.includes(window.currentRole);

// ─────────────────────────────────────────────────────────────
// CAPABILITY CHECKS  — use these everywhere in the app
// ─────────────────────────────────────────────────────────────

// Group / Department
window.canCreateGroup  = () => R.GROUP_MANAGERS.includes(window.currentRole);
window.canSeeGroupGear = () => R.GROUP_MANAGERS.includes(window.currentRole);

// Tasks
window.canCreateTask   = () => window.hasFeature('tasks_enabled') &&
    R.TASK_CREATORS.includes(window.currentRole);
window.canSeeTaskHub   = () => window.hasFeature('tasks_enabled'); // ALL roles
window.canBeAssigned   = () => !R.TASK_FORBIDDEN.includes(window.currentRole);

// Scheduled messages
window.canSchedule     = () => window.hasFeature('scheduling_enabled') &&
    R.SCHEDULERS.includes(window.currentRole);

// File upload — all roles, feature-flagged
window.canUpload       = () => window.hasFeature('uploads_enabled');

// Messages
window.canEditMessage  = (senderId) => senderId === window.currentUser?.id;
window.canDeleteMessage= (senderId) =>
    senderId === window.currentUser?.id || R.MSG_MODERATORS.includes(window.currentRole);
window.canForward      = () => true;

// Admin panel access
window.canAccessAdmin  = () => R.ADMIN_PANEL.includes(window.currentRole);

// ─────────────────────────────────────────────────────────────
// SERVER-SIDE GUARD — called at submission, not just UI hide
// ─────────────────────────────────────────────────────────────

/**
 * Call this at the TOP of any task creation function.
 * Returns true if blocked (show error), false if allowed.
 */
window.guardCreateTask = function() {
    if (!window.canCreateTask()) {
        window.showCenterToast(
            'Task creation is not allowed for your role (' + (window.currentRoleName || window.currentRole) + ').',
            'fa-solid fa-ban', 'text-red-400'
        );
        return true; // blocked
    }
    return false; // allowed
};

window.guardSchedule = function() {
    if (!window.canSchedule()) {
        window.showCenterToast(
            'Scheduled messages are not available for your role.',
            'fa-solid fa-ban', 'text-red-400'
        );
        return true;
    }
    return false;
};

/**
 * Call this at the TOP of any group create / edit / archive function.
 * Returns true if blocked (show error), false if allowed.
 */
window.canManageGroups = () => R.GROUP_MANAGERS.includes(window.currentRole);
window.guardManageGroups = function() {
    if (!window.canManageGroups()) {
        window.showCenterToast(
            'Group management is not allowed for your role (' + (window.currentRoleName || window.currentRole) + ').',
            'fa-solid fa-ban', 'text-red-400'
        );
        return true; // blocked
    }
    return false; // allowed
};

// ─────────────────────────────────────────────────────────────
// MAIN RBAC ENFORCEMENT
// ─────────────────────────────────────────────────────────────
window.applyRBAC = function() {
    const role = window.currentRole || '';

    const canTask  = window._ROLES?.TASK_CREATORS.includes(role) && window.hasFeature('tasks_enabled');
    const canSched = window._ROLES?.SCHEDULERS.includes(role)     && window.hasFeature('scheduling_enabled');
    const canGroup = window._ROLES?.GROUP_MANAGERS.includes(role);

    // ── Schedule ─────────────────────────────────────────────
    const hide = v => v ? '' : 'none';
    const topSched = document.getElementById('topBarScheduleBtn');
    if (topSched) topSched.style.display = hide(canSched);

    const compSched = document.getElementById('composerScheduleBtn');
    if (compSched) compSched.style.display = hide(canSched);

    // ── Create Task (all dd-items with class rbac-create-task) ─
    document.querySelectorAll('.rbac-create-task')
        .forEach(el => { el.style.display = hide(canTask); });

    // ── Group gear ────────────────────────────────────────────
    document.querySelectorAll('[onclick*="openGroupSettings"]')
        .forEach(el => { el.style.display = hide(canGroup); });

    // ── Create group button ───────────────────────────────────
    document.querySelectorAll('[onclick*="openNewGroupModal"]')
        .forEach(el => { el.style.display = hide(canGroup); });

    // ── Right sidebar / Task hub (visible to ALL) ─────────────
    // no hiding — task hub is open to all roles

    checkSubscription();
};

function _applyTopBar()    {}
function _applyInputArea() {
    if (!window.canUpload?.()) {
        const fileBtn = document.querySelector('[onclick*="fileAttachment"]');
        if (fileBtn) fileBtn.style.display = 'none';
        const fileInput = document.getElementById('fileAttachment');
        if (fileInput) fileInput.disabled = true;
    }
}
function _applyTaskHub() {}

// ─────────────────────────────────────────────────────────────
// GROUP GEAR RBAC
// ─────────────────────────────────────────────────────────────
window.applyGroupGearRBAC = function() {
    if (!window.canSeeGroupGear()) {
        document.querySelectorAll('[onclick*="openGroupSettings"]')
            .forEach(el => el.style.display = 'none');
    }
};

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION / TRIAL CHECK
// ─────────────────────────────────────────────────────────────
window.checkSubscription = function() {
    const sub = window.currentSubscription;
    if (!sub) return;
    const now      = new Date();
    const trialEnd = sub.trial_ends ? new Date(sub.trial_ends) : null;
    const isExpired = (sub.status === 'trial' || sub.status === 'expired') &&
                       trialEnd && trialEnd < now;
    const daysLeft  = trialEnd
        ? Math.max(0, Math.ceil((trialEnd - now) / 86400000))
        : null;
    if (isExpired)                          { _showTrialBanner('expired', 0); _blockMessaging(); }
    else if (daysLeft !== null && daysLeft <= 7) { _showTrialBanner('warning', daysLeft); }
};

function _showTrialBanner(type, days) {
    document.getElementById('trialStatusBanner')?.remove();
    const isExpired = type === 'expired';
    const bg     = isExpired ? '#fef2f2' : '#fefce8';
    const border = isExpired ? '#fca5a5' : '#fde68a';
    const color  = isExpired ? '#dc2626'  : '#b45309';
    const icon   = isExpired ? 'fa-circle-xmark' : 'fa-triangle-exclamation';
    const msg    = isExpired
        ? '⛔ Trial expired. Contact developer to upgrade.'
        : '⚠️ Trial expires in ' + days + ' day' + (days === 1 ? '' : 's') + '. Contact developer to upgrade.';
    const banner = document.createElement('div');
    banner.id = 'trialStatusBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:' + bg +
        ';border-bottom:2px solid ' + border + ';color:' + color +
        ';font-size:12px;font-weight:700;padding:8px 20px;text-align:center;' +
        'display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,.08);';
    banner.innerHTML = '<i class="fa-solid ' + icon + '"></i> ' + msg;
    if (!isExpired) {
        const btn = document.createElement('button');
        btn.innerHTML = '✕';
        btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:' + color + ';margin-left:12px;font-weight:700;';
        btn.onclick = () => banner.remove();
        banner.appendChild(btn);
    }
    document.body.insertBefore(banner, document.body.firstChild);
    const root = document.getElementById('root');
    if (root) root.style.paddingTop = '36px';
}

function _blockMessaging() {
    window._trialExpired = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.title    = 'Trial expired';
        sendBtn.style.opacity = '0.4';
        sendBtn.style.cursor  = 'not-allowed';
    }
    const editor = document.getElementById('richEditor');
    if (editor) { editor.contentEditable = 'false'; editor.style.opacity = '0.4'; }
    const fileBtn = document.querySelector('[onclick*="fileAttachment"]');
    if (fileBtn) { fileBtn.disabled = true; fileBtn.style.opacity = '0.4'; }
}
