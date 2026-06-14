/**
 * rbac.js — MPGS TaskFlow Phase 3
 * ─────────────────────────────────────────────────────────────
 * Role-Based Access Control + Feature Flag enforcement.
 * Called after renderMainApp() to apply visibility rules.
 *
 * Roles:  principal, vp_admin, hod, exam_controller, teacher
 * Features: tasks_enabled, uploads_enabled, scheduling_enabled,
 *           reports_enabled
 * ─────────────────────────────────────────────────────────────
 */

// ── Role helpers ──────────────────────────────────────────────
window.isTeacher      = () => !window.currentRole || window.currentRole === 'teacher';
window.isHOD          = () => ['hod','exam_controller'].includes(window.currentRole);
window.isAdmin        = () => ['principal','vp_admin'].includes(window.currentRole);

// ── Capability checks (use these everywhere in app) ──────────
window.canSchedule    = () => !window.isTeacher() && window.hasFeature('scheduling_enabled');
window.canUpload      = () => window.hasFeature('uploads_enabled');
window.canSeeTaskHub  = () => window.hasFeature('tasks_enabled');
window.canCreateTask  = () => window.hasFeature('tasks_enabled') && !window.isTeacher();
window.canCreateGroup = () => !window.isTeacher();
window.canSeeGroupGear= () => !window.isTeacher(); // HOD sees own dept; principal sees all

// ── Main RBAC enforcement ────────────────────────────────────
// Called by main.js after renderMainApp() and after loadChatsList()
window.applyRBAC = function() {
    _applyTopBar();
    _applyInputArea();
    _applyTaskHub();
    checkSubscription();
};

function _applyTopBar() {
    // ── Schedule button (top bar) ─────────────────────────────
    // Teacher: ALWAYS hidden
    // HOD/Principal: hidden if !scheduling_enabled
    if (!window.canSchedule()) {
        document.querySelectorAll(
            '.topbar-icon-btn[onclick*="openTopPanel(\'scheduled\'"],' +
            '.topbar-icon-btn[onclick*="showScheduleModal"]'
        ).forEach(el => el.style.display = 'none');

        // Also hide the clock-shaped Schedule top bar icon
        document.querySelectorAll('.top-bar-icon').forEach(btn => {
            if (btn.textContent?.trim().toLowerCase() === 'schedule') {
                btn.style.display = 'none';
            }
        });
    }
}

function _applyInputArea() {
    // ── File attachment ───────────────────────────────────────
    if (!window.canUpload()) {
        const fileBtn = document.querySelector('[onclick*="fileAttachment"]');
        if (fileBtn) fileBtn.style.display = 'none';
        const fileInput = document.getElementById('fileAttachment');
        if (fileInput) fileInput.disabled = true;
    }

    // ── Schedule button in editor toolbar ────────────────────
    if (!window.canSchedule()) {
        document.querySelectorAll('button[onclick*="showScheduleModal"]')
            .forEach(el => el.style.display = 'none');
    }
}

function _applyTaskHub() {
    if (!window.canSeeTaskHub()) {
        // Hide entire right sidebar and its toggle button
        const rs = document.getElementById('rightSidebar');
        if (rs) rs.style.display = 'none';
        const resizer = document.getElementById('rightResizer');
        if (resizer) resizer.style.display = 'none';
        document.querySelectorAll('.topbar-icon-btn').forEach(btn => {
            if (btn.textContent?.trim().toLowerCase() === 'tasks') {
                btn.style.display = 'none';
            }
        });
    }
}

// ── Apply group gear visibility ──────────────────────────────
// Called from loadChatsList() after rendering dept items
window.applyGroupGearRBAC = function() {
    if (window.isTeacher()) {
        document.querySelectorAll('[onclick*="openGroupSettings"]')
            .forEach(el => el.style.display = 'none');
    }
    // HOD/Exam Controller: can see gear (they manage their dept group)
    // Principal/VP: see all gears (already visible)
};

// ── Subscription / Trial check ───────────────────────────────
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

    if (isExpired) {
        _showTrialBanner('expired', 0);
        _blockMessaging();
    } else if (daysLeft !== null && daysLeft <= 7) {
        _showTrialBanner('warning', daysLeft);
    }
};

function _showTrialBanner(type, days) {
    // Remove existing banner
    document.getElementById('trialStatusBanner')?.remove();

    const isExpired = type === 'expired';
    const bg    = isExpired ? '#fef2f2' : '#fefce8';
    const border= isExpired ? '#fca5a5' : '#fde68a';
    const color = isExpired ? '#dc2626'  : '#b45309';
    const icon  = isExpired ? 'fa-circle-xmark' : 'fa-triangle-exclamation';
    const msg   = isExpired
        ? '⛔ Your trial has expired. Contact developer to upgrade your plan.'
        : `⚠️ Trial expires in ${days} day${days===1?'':'s'}. Contact developer to upgrade.`;

    const banner = document.createElement('div');
    banner.id = 'trialStatusBanner';
    banner.style.cssText = `
        position:fixed; top:0; left:0; right:0; z-index:9998;
        background:${bg}; border-bottom:2px solid ${border};
        color:${color}; font-size:12px; font-weight:700;
        padding:8px 20px; text-align:center; display:flex;
        align-items:center; justify-content:center; gap:8px;
        box-shadow:0 2px 8px rgba(0,0,0,.08);
    `;
    banner.innerHTML = `<i class="fa-solid ${icon}"></i> ${msg}`;

    // Add close button for warning (not for expired)
    if (!isExpired) {
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:14px;color:' + color + ';margin-left:12px;font-weight:700;';
        closeBtn.onclick = () => banner.remove();
        banner.appendChild(closeBtn);
    }

    document.body.insertBefore(banner, document.body.firstChild);

    // Push app content down so banner doesn't overlap
    const root = document.getElementById('root');
    if (root) root.style.paddingTop = '36px';
}

function _blockMessaging() {
    window._trialExpired = true;

    // Disable send button
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.title    = 'Trial expired — upgrade to send messages';
        sendBtn.style.opacity = '0.4';
        sendBtn.style.cursor  = 'not-allowed';
    }

    // Show overlay on Quill editor
    const editor = document.getElementById('richEditor');
    if (editor) {
        editor.contentEditable = 'false';
        editor.style.opacity   = '0.4';
        editor.title = 'Trial expired — upgrade to send messages';
    }

    // Disable file attachment
    const fileBtn = document.querySelector('[onclick*="fileAttachment"]');
    if (fileBtn) { fileBtn.disabled = true; fileBtn.style.opacity = '0.4'; }
}

// ── Export trial-expired flag so sendMessage() can check ─────
// Usage in messages.js sendMessage(): if (window._trialExpired) return;
