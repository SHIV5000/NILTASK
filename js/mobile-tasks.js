
import { sb } from './shared.js';

/*
 * NILTASK Mobile Task UI v2
 * -------------------------------------------------------------
 * Additive mobile task module.
 *
 * It does NOT replace mobile.js.
 * It overrides only the visual rendering of:
 *   - Mobile Tasks screen
 *   - Mobile Task Detail screen
 *
 * All task-related database operations are tenant-scoped.
 */

const MOBILE_TASK_MAX_WIDTH = 768;
const NILTASK_TASK_UI_VERSION = 'v205';
window.NILTASK_TASK_UI_VERSION = NILTASK_TASK_UI_VERSION;
const CLOSED_STATUSES = new Set(['transferred', 'cancelled']);

let originalMobileNavigate = null;
let mobileTaskObserver = null;
let mobileTaskRenderLock = false;
let currentMobileTaskScreen = null;
let currentMobileTaskParams = null;
let mobileTaskFilter = localStorage.getItem('nmt_task_filter') || 'all';
let mobileTaskSort = localStorage.getItem('nmt_task_sort') || 'created_desc';

window.nmtSetTaskFilter = function(value) {
    mobileTaskFilter = value || 'all';
    try { localStorage.setItem('nmt_task_filter', mobileTaskFilter); } catch (e) {}
    renderMobileTasks();
};

window.nmtSetTaskSort = function(value) {
    mobileTaskSort = value || 'created_desc';
    try { localStorage.setItem('nmt_task_sort', mobileTaskSort); } catch (e) {}
    renderMobileTasks();
};

/* -------------------------------------------------------------------------- */
/* Context helpers                                                            */
/* -------------------------------------------------------------------------- */

function getTenantId() {
    return window.currentTenantId || null;
}

function getCurrentUserId() {
    return window.currentUser?.id || null;
}

function isMobileTaskDevice() {
    return (
        window.innerWidth <= MOBILE_TASK_MAX_WIDTH ||
        window.matchMedia('(max-width: 768px)').matches ||
        Boolean(window.IS_NATIVE)
    );
}

function escapeHtml(value = '') {
    if (typeof window.escapeHtml === 'function') {
        return window.escapeHtml(String(value));
    }

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeAttribute(value = '') {
    return escapeHtml(value);
}

function showToast(
    message,
    type = 'info'
) {
    if (typeof window.showCenterToast === 'function') {
        const settings = {
            success: [
                'fa-solid fa-circle-check',
                'text-green-500'
            ],
            error: [
                'fa-solid fa-circle-xmark',
                'text-red-500'
            ],
            warning: [
                'fa-solid fa-triangle-exclamation',
                'text-orange-500'
            ],
            info: [
                'fa-solid fa-circle-info',
                'text-blue-500'
            ]
        };

        const [icon, colour] =
            settings[type] || settings.info;

        window.showCenterToast(
            message,
            icon,
            colour
        );

        return;
    }

    alert(message);
}

function getUserName(userId) {
    const user = (
        window.globalUsersCache || []
    ).find(item => item.id === userId);

    const value =
        user?.full_name ||
        user?.email?.split('@')[0] ||
        'Unknown';

    return typeof window.toSentenceCase === 'function'
        ? window.toSentenceCase(value)
        : value;
}

function getProfileName(profile) {
    const value =
        profile?.full_name ||
        profile?.email?.split('@')[0] ||
        'Unknown';

    return typeof window.toSentenceCase === 'function'
        ? window.toSentenceCase(value)
        : value;
}

function formatDate(value) {
    if (!value) return 'No deadline';

    if (typeof window.getISTDate === 'function') {
        return window.getISTDate(value);
    }

    return new Date(value).toLocaleDateString(
        'en-IN'
    );
}

function formatDateTime(value) {
    if (!value) return '';

    try {
        return new Date(value).toLocaleString(
            'en-IN',
            {
                timeZone: 'Asia/Kolkata',
                dateStyle: 'medium',
                timeStyle: 'short'
            }
        );
    } catch {
        return '';
    }
}

function isOverdue(deadline) {
    if (!deadline) return false;

    const date = new Date(deadline);

    date.setHours(23, 59, 59, 999);

    return date < new Date();
}

/* -------------------------------------------------------------------------- */
/* Assignment status helpers                                                  */
/* -------------------------------------------------------------------------- */

function getEffectiveStatus(assignment) {
    if (!assignment) {
        return 'pending_ack';
    }

    if (
        assignment.status === 'pending_ack' &&
        (
            assignment.state === 'acknowledged' ||
            assignment.acked === true
        )
    ) {
        return 'acknowledged';
    }

    return assignment.status || 'pending_ack';
}

function isClosedAssignment(assignment) {
    return CLOSED_STATUSES.has(
        getEffectiveStatus(assignment)
    );
}

function getStatusInformation(status) {
    const map = {
        pending_ack: {
            label: 'Awaiting Acknowledgement',
            shortLabel: 'Awaiting',
            icon: 'fa-regular fa-clock',
            colour: '#c2410c',
            border: '#fb923c',
            background: '#fff7ed'
        },

        acknowledged: {
            label: 'Acknowledged',
            shortLabel: 'Acknowledged',
            icon: 'fa-solid fa-check',
            colour: '#1d4ed8',
            border: '#60a5fa',
            background: '#eff6ff'
        },

        in_progress: {
            label: 'In Progress',
            shortLabel: 'Working',
            icon: 'fa-solid fa-spinner',
            colour: '#4338ca',
            border: '#818cf8',
            background: '#eef2ff'
        },

        submitted: {
            label: 'Waiting for Review',
            shortLabel: 'Submitted',
            icon: 'fa-solid fa-paper-plane',
            colour: '#a21caf',
            border: '#d946ef',
            background: '#fdf4ff'
        },

        needs_review: {
            label: 'Changes Required',
            shortLabel: 'Rework',
            icon: 'fa-solid fa-rotate-left',
            colour: '#b91c1c',
            border: '#ef4444',
            background: '#fef2f2'
        },

        accepted: {
            label: 'Completed',
            shortLabel: 'Completed',
            icon: 'fa-solid fa-circle-check',
            colour: '#166534',
            border: '#22c55e',
            background: '#f0fdf4'
        },

        transferred: {
            label: 'Transferred',
            shortLabel: 'Transferred',
            icon: 'fa-solid fa-arrow-right-arrow-left',
            colour: '#64748b',
            border: '#94a3b8',
            background: '#f8fafc'
        },

        cancelled: {
            label: 'Cancelled',
            shortLabel: 'Cancelled',
            icon: 'fa-solid fa-ban',
            colour: '#475569',
            border: '#64748b',
            background: '#f8fafc'
        },

        mixed: {
            label: 'Mixed Progress',
            shortLabel: 'Mixed',
            icon: 'fa-solid fa-users',
            colour: '#7e22ce',
            border: '#a855f7',
            background: '#faf5ff'
        },

        empty: {
            label: 'No Active Assignees',
            shortLabel: 'Empty',
            icon: 'fa-solid fa-user-slash',
            colour: '#64748b',
            border: '#cbd5e1',
            background: '#f8fafc'
        }
    };

    return map[status] || map.empty;
}

function summariseAssignments(assignments = []) {
    const active = assignments.filter(
        assignment => !isClosedAssignment(assignment)
    );

    const counts = {};

    for (const assignment of active) {
        const status = getEffectiveStatus(assignment);

        counts[status] =
            (counts[status] || 0) + 1;
    }

    const total = active.length;

    const engaged = active.filter(
        assignment =>
            getEffectiveStatus(assignment) !==
            'pending_ack'
    ).length;

    const completed = active.filter(
        assignment =>
            getEffectiveStatus(assignment) ===
            'accepted'
    ).length;

    const statuses = Object.keys(counts);

    let overallStatus = 'empty';

    if (total > 0) {
        overallStatus =
            statuses.length === 1
                ? statuses[0]
                : 'mixed';
    }

    return {
        active,
        counts,
        total,
        engaged,
        completed,
        overallStatus,

        engagementPercentage:
            total > 0
                ? Math.round((engaged / total) * 100)
                : 0,

        completionPercentage:
            total > 0
                ? Math.round((completed / total) * 100)
                : 0
    };
}

/* -------------------------------------------------------------------------- */
/* Mobile styles                                                              */
/* -------------------------------------------------------------------------- */

function installMobileTaskStyles() {
    if (
        document.getElementById(
            'niltask-mobile-task-v2-styles'
        )
    ) {
        return;
    }

    const style = document.createElement('style');

    style.id = 'niltask-mobile-task-v2-styles';

    style.textContent = `
        .nmt-screen {
            min-height:100%;
            background:var(--bg-body,#f6f7fb);
            color:var(--text-primary,#111827);
        }

        .nmt-header {
            position:sticky;
            top:0;
            z-index:20;
            display:flex;
            align-items:center;
            gap:10px;
            min-height:56px;
            padding:8px 13px;
            background:var(--bg-body,#fff);
            border-bottom:1px solid var(--border-color,#e5e7eb);
        }

        .nmt-header-title {
            min-width:0;
            flex:1;
            font-size:18px;
            font-weight:900;
            color:var(--text-primary,#111827);
        }

        .nmt-header-button {
            width:38px;
            height:38px;
            border:0;
            border-radius:50%;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            background:var(--bg-sidebar,#f1f5f9);
            color:var(--text-primary,#334155);
            cursor:pointer;
        }

        .nmt-list {
            padding:18px 12px 100px;
        }

        .nmt-card {
            position:relative;
            margin-bottom:24px;
            overflow:visible;
            border:2px solid var(--border-color,#dbe2ea);
            border-radius:20px;
            background:var(--bg-body,#fff);
            box-shadow:
                0 4px 10px rgba(15,23,42,.08),
                0 16px 32px rgba(15,23,42,.08);
        }

        .nmt-card.completed {
            opacity:.73;
        }

        .nmt-card:not(:last-child)::after {
            content:'';
            position:absolute;
            left:14px;
            right:14px;
            bottom:-14px;
            height:2px;
            border-radius:999px;
            background:var(--border-color,#d1d5db);
        }

        .nmt-card-accent {
            height:5px;
        }

        .nmt-card-content {
            padding:15px;
        }

        .nmt-title-row {
            display:flex;
            gap:10px;
            align-items:flex-start;
        }

        .nmt-title-area {
            min-width:0;
            flex:1;
        }

        .nmt-task-title {
            margin:0;
            color:var(--text-primary,#111827);
            font-size:17px;
            line-height:1.4;
            font-weight:900;
            overflow-wrap:anywhere;
        }

        .nmt-task-meta {
            margin-top:5px;
            color:var(--text-secondary,#64748b);
            font-size:12px;
            line-height:1.5;
        }

        .nmt-priority {
            flex-shrink:0;
            border-radius:999px;
            padding:7px 9px;
            font-size:9px;
            font-weight:900;
            letter-spacing:.06em;
        }

        .nmt-status-row {
            margin-top:13px;
            display:flex;
            align-items:center;
            gap:8px;
            flex-wrap:wrap;
        }

        .nmt-status {
            display:inline-flex;
            align-items:center;
            gap:6px;
            min-height:36px;
            padding:8px 12px;
            border:1px solid;
            border-radius:999px;
            font-size:11px;
            font-weight:800;
        }

        .nmt-deadline {
            display:inline-flex;
            align-items:center;
            gap:5px;
            color:var(--text-secondary,#64748b);
            font-size:12px;
            font-weight:700;
        }

        .nmt-deadline.overdue {
            color:#b91c1c;
        }

        .nmt-stat-grid {
            display:grid;
            grid-template-columns:repeat(4,minmax(0,1fr));
            gap:6px;
            margin-top:14px;
        }

        .nmt-stat {
            border:1px solid var(--border-color,#eef2f7);
            border-radius:12px;
            padding:9px 4px;
            text-align:center;
            background:var(--bg-sidebar,#f8fafc);
        }

        .nmt-stat-number {
            display:block;
            color:var(--text-primary,#111827);
            font-size:15px;
            line-height:1;
            font-weight:900;
        }

        .nmt-stat-label {
            display:block;
            margin-top:5px;
            color:var(--text-secondary,#64748b);
            font-size:7.5px;
            font-weight:800;
            text-transform:uppercase;
        }

        .nmt-progress {
            margin-top:14px;
        }

        .nmt-progress-label {
            display:flex;
            justify-content:space-between;
            gap:8px;
            color:var(--text-secondary,#64748b);
            font-size:9px;
            font-weight:700;
        }

        .nmt-progress-track {
            position:relative;
            height:7px;
            margin-top:7px;
            border-radius:999px;
            overflow:hidden;
            background:#e5e7eb;
        }

        .nmt-progress-engaged,
        .nmt-progress-completed {
            position:absolute;
            top:0;
            left:0;
            bottom:0;
            border-radius:999px;
        }

        .nmt-progress-engaged {
            background:#c4b5fd;
        }

        .nmt-progress-completed {
            background:#22c55e;
        }

        .nmt-action-row {
            display:flex;
            gap:8px;
            margin-top:15px;
        }

        .nmt-button {
            min-height:48px;
            border:0;
            border-radius:12px;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:7px;
            padding:11px 14px;
            cursor:pointer;
            font-size:13px;
            font-weight:900;
        }

        .nmt-button.primary {
            flex:1;
            color:#fff;
            background:var(--accent,#4f46e5);
        }

        .nmt-button.secondary {
            color:var(--text-primary,#334155);
            background:var(--bg-sidebar,#f1f5f9);
            border:1px solid var(--border-color,#e2e8f0);
        }

        .nmt-button.icon {
            width:48px;
            padding:0;
        }

        /* Compact controls only on collapsed task cards; detail-sheet controls stay large. */
        .nmt-card .nmt-action-row {
            gap:5px;
        }

        .nmt-card .nmt-button {
            min-height:40px;
            padding:8px 9px;
            gap:5px;
            font-size:10.5px;
            line-height:1.2;
        }

        .nmt-card .nmt-button.primary {
            white-space:nowrap;
        }

        .nmt-card .nmt-button.icon {
            width:38px;
            min-width:38px;
            padding:0;
        }

        .nmt-empty {
            padding:45px 20px;
            color:var(--text-secondary,#64748b);
            text-align:center;
            font-size:13px;
        }

        .nmt-detail-content {
            padding:14px 12px 90px;
        }

        .nmt-section {
            margin-bottom:12px;
            padding:13px;
            border:1px solid var(--border-color,#e5e7eb);
            border-radius:16px;
            background:var(--bg-body,#fff);
        }

        .nmt-section-title {
            display:flex;
            align-items:center;
            gap:7px;
            margin-bottom:11px;
            color:var(--text-primary,#111827);
            font-size:13px;
            font-weight:900;
            text-transform:uppercase;
            letter-spacing:.035em;
        }

        .nmt-person {
            display:flex;
            align-items:center;
            gap:9px;
            min-height:58px;
            padding:12px 0;
            border-bottom:1px solid var(--border-color,#eef2f7);
        }

        .nmt-person:last-child {
            border-bottom:0;
        }

        .nmt-avatar {
            width:33px;
            height:33px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            flex-shrink:0;
            color:#fff;
            background:#6366f1;
            font-size:11px;
            font-weight:900;
        }

        .nmt-person-info {
            min-width:0;
            flex:1;
        }

        .nmt-person-name {
            overflow:hidden;
            text-overflow:ellipsis;
            white-space:nowrap;
            color:var(--text-primary,#111827);
            font-size:14px;
            font-weight:800;
        }

        .nmt-person-state {
            margin-top:3px;
            color:var(--text-secondary,#64748b);
            font-size:11px;
        }

        .nmt-person-actions {
            display:flex;
            gap:5px;
            flex-wrap:wrap;
            justify-content:flex-end;
        }

        .nmt-mini-button {
            min-height:40px;
            border:0;
            border-radius:9px;
            padding:9px 12px;
            cursor:pointer;
            font-size:11px;
            font-weight:800;
        }

        .nmt-mini-blue {
            color:#1d4ed8;
            background:#eff6ff;
        }

        .nmt-mini-orange {
            color:#c2410c;
            background:#fff7ed;
        }

        .nmt-mini-green {
            color:#166534;
            background:#f0fdf4;
        }

        .nmt-mini-red {
            color:#b91c1c;
            background:#fef2f2;
        }

        .nmt-mini-purple {
            color:#7e22ce;
            background:#faf5ff;
        }

        .nmt-trail-row {
            display:flex;
            gap:11px;
            padding:13px 0;
            border-bottom:1px solid var(--border-color,#eef2f7);
        }

        .nmt-trail-row:last-child {
            border-bottom:0;
        }

        .nmt-trail-number {
            width:32px;
            height:32px;
            border-radius:50%;
            flex-shrink:0;
            display:flex;
            align-items:center;
            justify-content:center;
            color:#4338ca;
            background:#eef2ff;
            font-size:11px;
            font-weight:900;
        }

        .nmt-trail-body {
            min-width:0;
            flex:1;
        }

        .nmt-trail-meta {
            color:var(--text-primary,#111827);
            font-size:12px;
            font-weight:800;
        }

        .nmt-trail-time {
            color:var(--text-secondary,#94a3b8);
            font-weight:600;
        }

        .nmt-trail-comment {
            margin-top:5px;
            color:var(--text-secondary,#475569);
            font-size:12px;
            line-height:1.55;
            overflow-wrap:anywhere;
        }

        #nmtActionOverlay {
            position:fixed;
            inset:0;
            z-index:30000;
            display:none;
        }

        #nmtActionOverlay.open {
            display:block;
        }

        .nmt-overlay-backdrop {
            position:absolute;
            inset:0;
            background:rgba(15,23,42,.52);
            backdrop-filter:blur(3px);
        }

        .nmt-sheet {
            position:absolute;
            left:0;
            right:0;
            bottom:0;
            max-height:88vh;
            overflow:hidden;
            display:flex;
            flex-direction:column;
            border-radius:24px 24px 0 0;
            background:var(--bg-body,#fff);
            box-shadow:0 -20px 60px rgba(15,23,42,.28);
            animation:nmtSheetIn .22s ease-out;
        }

        .nmt-sheet-handle {
            width:43px;
            height:4px;
            margin:9px auto 0;
            border-radius:999px;
            background:#cbd5e1;
        }

        .nmt-sheet-header {
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            padding:12px 17px;
            border-bottom:1px solid var(--border-color,#e5e7eb);
        }

        .nmt-sheet-title {
            color:var(--text-primary,#111827);
            font-size:15px;
            font-weight:900;
        }

        .nmt-sheet-close {
            width:34px;
            height:34px;
            border:0;
            border-radius:50%;
            color:var(--text-primary,#334155);
            background:var(--bg-sidebar,#f1f5f9);
        }

        .nmt-sheet-body {
            overflow-y:auto;
            padding:17px;
        }

        .nmt-sheet-footer {
            display:flex;
            gap:8px;
            padding:13px 17px calc(13px + env(safe-area-inset-bottom));
            border-top:1px solid var(--border-color,#e5e7eb);
        }

        .nmt-sheet-footer .nmt-button {
            flex:1;
        }

        .nmt-field {
            margin-bottom:14px;
        }

        .nmt-label {
            display:block;
            margin-bottom:7px;
            color:var(--text-primary,#334155);
            font-size:10px;
            font-weight:900;
        }

        .nmt-input {
            width:100%;
            box-sizing:border-box;
            min-height:43px;
            padding:10px 11px;
            border:1px solid var(--border-color,#cbd5e1);
            border-radius:12px;
            outline:none;
            color:var(--text-primary,#111827);
            background:var(--bg-body,#fff);
            font-family:inherit;
            font-size:12px;
        }

        textarea.nmt-input {
            min-height:105px;
            resize:vertical;
        }

        .nmt-manage-grid {
            display:grid;
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:9px;
        }

        .nmt-manage-option {
            min-height:78px;
            border:1px solid var(--border-color,#e5e7eb);
            border-radius:14px;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            gap:8px;
            padding:10px;
            color:var(--text-primary,#334155);
            background:var(--bg-sidebar,#f8fafc);
            font-size:10px;
            font-weight:900;
            text-align:center;
        }

        .nmt-manage-option i {
            font-size:18px;
            color:var(--accent,#4f46e5);
        }

        @keyframes nmtSheetIn {
            from {
                transform:translateY(100%);
            }

            to {
                transform:translateY(0);
            }
        }
    `;

    document.head.appendChild(style);
}

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

function ensureOverlay() {
    installMobileTaskStyles();

    let overlay =
        document.getElementById('nmtActionOverlay');

    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'nmtActionOverlay';

    overlay.innerHTML = `
        <div
            class="nmt-overlay-backdrop"
            data-nmt-action="close-overlay"
        ></div>

        <section class="nmt-sheet">
            <div class="nmt-sheet-handle"></div>

            <div class="nmt-sheet-header">
                <div
                    id="nmtSheetTitle"
                    class="nmt-sheet-title"
                >
                    Task Action
                </div>

                <button
                    type="button"
                    class="nmt-sheet-close"
                    data-nmt-action="close-overlay"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div
                id="nmtSheetBody"
                class="nmt-sheet-body"
            ></div>

            <div
                id="nmtSheetFooter"
                class="nmt-sheet-footer"
            ></div>
        </section>
    `;

    document.body.appendChild(overlay);

    return overlay;
}

function closeOverlay() {
    document
        .getElementById('nmtActionOverlay')
        ?.classList.remove('open');

    document.body.style.overflow = '';
}

function openOverlay({
    title,
    body,
    primaryLabel = null,
    primaryIcon = 'fa-solid fa-check',
    onPrimary = null
}) {
    const overlay = ensureOverlay();

    const titleElement =
        document.getElementById('nmtSheetTitle');

    const bodyElement =
        document.getElementById('nmtSheetBody');

    const footerElement =
        document.getElementById('nmtSheetFooter');

    titleElement.textContent = title;
    bodyElement.innerHTML = body;

    if (!primaryLabel || !onPrimary) {
        footerElement.innerHTML = `
            <button
                type="button"
                class="nmt-button secondary"
                data-nmt-action="close-overlay"
            >
                Close
            </button>
        `;
    } else {
        footerElement.innerHTML = `
            <button
                type="button"
                class="nmt-button secondary"
                data-nmt-action="close-overlay"
            >
                Cancel
            </button>

            <button
                type="button"
                id="nmtPrimaryAction"
                class="nmt-button primary"
            >
                <i class="${primaryIcon}"></i>
                ${escapeHtml(primaryLabel)}
            </button>
        `;

        const button =
            document.getElementById('nmtPrimaryAction');

        button.onclick = async () => {
            button.disabled = true;
            button.style.opacity = '.62';

            try {
                const result = await onPrimary();

                if (result !== false) {
                    closeOverlay();
                }
            } finally {
                button.disabled = false;
                button.style.opacity = '';
            }
        };
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

/* -------------------------------------------------------------------------- */
/* Tenant-safe database helpers                                               */
/* -------------------------------------------------------------------------- */

async function fetchTask(taskId) {
    const tenantId = getTenantId();

    if (!tenantId || !taskId) return null;

    const { data, error } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', taskId)
        .single();

    if (error || !data) {
        showToast(
            'Task was not found in this organisation.',
            'error'
        );

        return null;
    }

    return data;
}

async function fetchTaskAssignments(taskIds) {
    const tenantId = getTenantId();

    if (!tenantId || !taskIds.length) return [];

    const { data, error } = await sb
        .from('task_assignees')
        .select(`
            task_id,
            assignee_id,
            status,
            state,
            acked,
            profiles!assignee_id(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId)
        .in('task_id', taskIds);

    if (error) {
        console.error(
            '[mobile-tasks] assignee fetch failed',
            error
        );

        return [];
    }

    return data || [];
}

async function fetchTaskTrails(taskId) {
    const tenantId = getTenantId();

    if (!tenantId || !taskId) return [];

    const { data, error } = await sb
        .from('task_trails')
        .select(`
            id,
            task_id,
            user_id,
            action,
            comment,
            created_at,
            profiles(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId)
        .eq('task_id', taskId)
        .order('created_at', {
            ascending: false
        });

    if (error) {
        console.error(
            '[mobile-tasks] trail fetch failed',
            error
        );

        return [];
    }

    return data || [];
}


async function fetchTaskExtensionRequests(taskId) {
    const { data, error } = await sb
        .from('task_extension_requests')
        .select('id,task_id,assignee_id,requested_deadline,reason,status,created_at,decided_by,decision_reason,decided_at')
        .eq('tenant_id', getTenantId())
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

    if (error) {
        console.warn('[mobile-tasks] extension request fetch failed', error);
        return [];
    }

    return data || [];
}

async function respondTaskExtension(requestId, approve) {
    const decisionReason = approve
        ? 'Approved by task creator'
        : (prompt('Reason for declining this extension request:') || '').trim();

    if (!approve && !decisionReason) return;

    const { data: request } = await sb
        .from('task_extension_requests')
        .select('task_id,requested_deadline,reason')
        .eq('tenant_id', getTenantId())
        .eq('id', requestId)
        .maybeSingle();

    const { error } = await sb.rpc('respond_task_extension', {
        p_request_id: requestId,
        p_approve: Boolean(approve),
        p_decision_reason: decisionReason,
        p_tenant_id: getTenantId()
    });

    if (error) {
        showToast(`Could not process extension request: ${error.message}`, 'error');
        return;
    }

    if (request?.task_id) {
    }

    showToast(
        approve ? 'Deadline extension approved.' : 'Deadline extension declined.',
        approve ? 'success' : 'warning'
    );

    await refreshCurrentMobileTaskScreen();
}

async function updateAssignment(
    taskId,
    assigneeId,
    payload
) {
    const tenantId = getTenantId();

    const { data, error } = await sb
        .from('task_assignees')
        .update(payload)
        .eq('tenant_id', tenantId)
        .eq('task_id', taskId)
        .eq('assignee_id', assigneeId)
        .select();

    if (
        error ||
        !data ||
        data.length === 0
    ) {
        showToast(
            error?.message ||
            'Could not update the task.',
            'error'
        );

        return false;
    }

    return true;
}

async function postTaskReplyToOriginal(
    taskId,
    action,
    comment = ''
) {
    try {
        const { data: task, error: taskError } = await sb
            .from('tasks')
            .select('id,title,original_message_id,tenant_id')
            .eq('tenant_id', getTenantId())
            .eq('id', taskId)
            .single();

        if (taskError || !task?.original_message_id) return false;

        const { data: original, error: messageError } = await sb
            .from('messages')
            .select('id,room_id')
            .eq('tenant_id', getTenantId())
            .eq('id', task.original_message_id)
            .maybeSingle();

        if (messageError || !original?.id || !original?.room_id) return false;

        const labels = {
            CREATE: 'Task created',
            ACKNOWLEDGE: 'Acknowledged',
            ACK: 'Acknowledged',
            START: 'Work started',
            UPDATE: 'Progress update',
            FILE: 'File uploaded',
            SUBMIT: 'Submitted for review',
            ACCEPT: 'Completion accepted',
            RETURN: 'Returned for changes',
            REWORK: 'Returned for changes',
            DELEGATE: 'Delegated',
            TRANSFER: 'Transferred',
            REMINDER: 'Reminder sent',
            DEADLINE: 'Deadline changed',
            EXTENSION_REQUEST: 'Deadline extension requested',
            EXTENSION_APPROVED: 'Deadline extension approved',
            EXTENSION_REJECTED: 'Deadline extension declined',
            CANCEL: 'Task cancelled'
        };

        const label = labels[String(action || 'UPDATE').toUpperCase()] || String(action || 'Update');
        const html = `
            <div data-task-event="1" data-task-id="${escapeHtml(taskId)}">
                <p>📋 <strong>${escapeHtml(task.title || 'Task')}</strong></p>
                <p><strong>${escapeHtml(label)}</strong>${comment ? ` — ${escapeHtml(comment)}` : ''}</p>
            </div>
        `;

        const { error: insertError } = await sb
            .from('messages')
            .insert({
                room_id: original.room_id,
                parent_message_id: original.id,
                sender_id: getCurrentUserId(),
                tenant_id: getTenantId(),
                text: html,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.warn('[mobile-tasks] task reply insert failed', insertError);
            return false;
        }

        return true;
    } catch (error) {
        console.warn('[mobile-tasks] task reply insert failed', error);
        return false;
    }
}

async function addTrail(
    taskId,
    action,
    comment
) {
    const { error } = await sb
        .from('task_trails')
        .insert({
            task_id: taskId,
            user_id: getCurrentUserId(),
            tenant_id: getTenantId(),
            action,
            comment
        });

    if (error) {
        console.warn(
            '[mobile-tasks] trail insert failed',
            error
        );
        return false;
    }

    // Original-message compilation is handled once by the database trail trigger.
    return true;
}

async function notifyUser(
    userId,
    task,
    message
) {
    if (!userId || !task) return;

    if (typeof window.notifyUser === 'function') {
        await window.notifyUser(
            userId,
            message,
            null,
            'task',
            task.id
        );

        return;
    }

    await sb
        .from('notifications')
        .insert({
            user_id: userId,
            tenant_id: getTenantId(),
            task_id: task.id,
            // Task navigation uses task_id; message_id is a UUID FK and stays null.
            message_id: null,
            type: 'task',
            message,
            is_read: false
        });
}

async function refreshCurrentMobileTaskScreen() {
    if (
        currentMobileTaskScreen === 'taskDetail' &&
        currentMobileTaskParams?.id
    ) {
        await renderMobileTaskDetail(
            currentMobileTaskParams
        );
    } else {
        await renderMobileTasks();
    }
}

/* -------------------------------------------------------------------------- */
/* Assignee actions                                                           */
/* -------------------------------------------------------------------------- */

async function acknowledgeTask(
    taskId,
    assigneeId
) {
    const task = await fetchTask(taskId);

    if (!task) return;

    const success = await updateAssignment(
        taskId,
        assigneeId,
        {
            status: 'pending_ack',
            state: 'acknowledged',
            acked: true
        }
    );

    if (!success) return;

    await addTrail(
        taskId,
        'ACKNOWLEDGE',
        'Acknowledged the task'
    );

    await notifyUser(
        task.assigned_by,
        task,
        `✅ Task Acknowledged: ${task.title}`
    );

    showToast('Task acknowledged.', 'success');

    await refreshCurrentMobileTaskScreen();
}

async function startTask(
    taskId,
    assigneeId
) {
    const task = await fetchTask(taskId);

    if (!task) return;

    const success = await updateAssignment(
        taskId,
        assigneeId,
        {
            status: 'in_progress',
            state: 'in_progress',
            acked: true
        }
    );

    if (!success) return;

    await addTrail(
        taskId,
        'START',
        'Started work'
    );

    await notifyUser(
        task.assigned_by,
        task,
        `▶️ Work Started: ${task.title}`
    );

    showToast('Work started.', 'success');

    await refreshCurrentMobileTaskScreen();
}

async function submitTask(
    taskId,
    assigneeId,
    requireProof
) {
    const task = await fetchTask(taskId);

    if (!task) return;

    if (requireProof) {
        const { data } = await sb
            .from('task_trails')
            .select('id')
            .eq('tenant_id', getTenantId())
            .eq('task_id', taskId)
            .eq('user_id', getCurrentUserId())
            .eq('action', 'FILE')
            .limit(1);

        if (!data?.length) {
            showToast(
                'Upload proof before submitting.',
                'warning'
            );

            return;
        }
    }

    const success = await updateAssignment(
        taskId,
        assigneeId,
        {
            status: 'submitted',
            state: 'submitted'
        }
    );

    if (!success) return;

    await addTrail(
        taskId,
        'SUBMIT',
        'Submitted for Review'
    );

    await notifyUser(
        task.assigned_by,
        task,
        `📬 Task Submitted for Review: ${task.title}`
    );

    showToast(
        'Submitted for review.',
        'success'
    );

    await refreshCurrentMobileTaskScreen();
}

function openProgressUpdate(taskId) {
    openOverlay({
        title: 'Progress Update',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    Progress made
                </label>

                <textarea
                    id="nmtProgressText"
                    class="nmt-input"
                    placeholder="Write a clear progress update..."
                ></textarea>
            </div>
        `,

        primaryLabel: 'Post Update',
        primaryIcon: 'fa-solid fa-paper-plane',

        onPrimary: async () => {
            const text = (
                document.getElementById(
                    'nmtProgressText'
                )?.value || ''
            ).trim();

            if (!text) {
                showToast(
                    'Progress update cannot be empty.',
                    'warning'
                );

                return false;
            }

            const task = await fetchTask(taskId);

            if (!task) return false;

            await addTrail(
                taskId,
                'UPDATE',
                text
            );

            await notifyUser(
                task.assigned_by,
                task,
                `💬 Task Update: ${task.title} — ${text.substring(0, 60)}`
            );

            showToast(
                'Progress update posted.',
                'success'
            );

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}

function openUpload(taskId) {
    openOverlay({
        title: 'Upload Proof',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    Select file
                </label>

                <input
                    id="nmtUploadFile"
                    class="nmt-input"
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                >
            </div>

            <div
                style="
                    color:var(--text-secondary,#64748b);
                    font-size:10px;
                    line-height:1.55;
                "
            >
                The file is stored in a tenant-specific and
                task-specific private storage path.
            </div>
        `,

        primaryLabel: 'Upload',
        primaryIcon: 'fa-solid fa-upload',

        onPrimary: async () => {
            const file =
                document.getElementById(
                    'nmtUploadFile'
                )?.files?.[0];

            if (!file) {
                showToast(
                    'Select a file.',
                    'warning'
                );

                return false;
            }

            const safeName = file.name.replace(
                /[^a-zA-Z0-9.\-_]/g,
                '_'
            );

            const path =
                `tasks/${getTenantId()}/${taskId}/${Date.now()}_${safeName}`;

            const { error } = await sb
                .storage
                .from('task-proofs')
                .upload(path, file);

            if (error) {
                showToast(error.message, 'error');
                return false;
            }

            await addTrail(
                taskId,
                'FILE',
                `${file.name}|${path}`
            );

            const task = await fetchTask(taskId);

            if (task) {
                await notifyUser(
                    task.assigned_by,
                    task,
                    `📎 File uploaded on task: ${task.title}`
                );
            }

            showToast(
                'File uploaded successfully.',
                'success'
            );

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}

function openDelegate(taskId) {
    const options = (
        window.globalUsersCache || []
    )
        .filter(
            user => user.id !== getCurrentUserId()
        )
        .map(
            user => `
                <option value="${escapeAttribute(user.id)}">
                    ${escapeHtml(getProfileName(user))}
                </option>
            `
        )
        .join('');

    openOverlay({
        title: 'Delegate Task',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    Delegate to
                </label>

                <select
                    id="nmtDelegateUser"
                    class="nmt-input"
                >
                    <option value="">
                        Select staff member
                    </option>

                    ${options}
                </select>
            </div>

            <div class="nmt-field">
                <label class="nmt-label">
                    Instructions
                </label>

                <textarea
                    id="nmtDelegateComment"
                    class="nmt-input"
                    placeholder="Explain what work should be completed..."
                ></textarea>
            </div>

            <div
                style="
                    padding:11px;
                    border-radius:12px;
                    background:#faf5ff;
                    color:#6b21a8;
                    font-size:10px;
                    line-height:1.5;
                "
            >
                Delegation adds another assignee. The current
                assignee remains accountable.
            </div>
        `,

        primaryLabel: 'Delegate',
        primaryIcon: 'fa-solid fa-user-plus',

        onPrimary: async () => {
            const newAssigneeId =
                document.getElementById(
                    'nmtDelegateUser'
                )?.value;

            const comment = (
                document.getElementById(
                    'nmtDelegateComment'
                )?.value || ''
            ).trim();

            if (!newAssigneeId) {
                showToast(
                    'Select a staff member.',
                    'warning'
                );

                return false;
            }

            const { data: existing } = await sb
                .from('task_assignees')
                .select('assignee_id')
                .eq('tenant_id', getTenantId())
                .eq('task_id', taskId)
                .eq('assignee_id', newAssigneeId)
                .maybeSingle();

            if (existing) {
                showToast(
                    'This person is already assigned.',
                    'warning'
                );

                return false;
            }

            const { error } = await sb
                .from('task_assignees')
                .insert({
                    task_id: taskId,
                    assignee_id: newAssigneeId,
                    tenant_id: getTenantId(),
                    status: 'pending_ack',
                    state: 'pending',
                    acked: false
                });

            if (error) {
                showToast(error.message, 'error');
                return false;
            }

            await addTrail(
                taskId,
                'DELEGATE',
                comment ||
                `Delegated to ${getUserName(newAssigneeId)}`
            );

            const task = await fetchTask(taskId);

            if (task) {
                await notifyUser(
                    newAssigneeId,
                    task,
                    `👤 Task Delegated to you: ${task.title}`
                );

                await notifyUser(
                    task.assigned_by,
                    task,
                    `↗️ Task Delegated: ${task.title}`
                );
            }

            showToast('Task delegated.', 'success');

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}

/* -------------------------------------------------------------------------- */
/* Creator actions                                                            */
/* -------------------------------------------------------------------------- */

async function sendTaskReminder(
    taskId,
    assigneeId
) {
    const tenantId = getTenantId();
    const senderId = getCurrentUserId();

    if (!tenantId || !senderId || !taskId || !assigneeId) {
        showToast('Reminder information is incomplete.', 'warning');
        return false;
    }

    const { error } = await sb.rpc(
        'send_task_reminder',
        {
            p_task_id: taskId,
            p_assignee_id: assigneeId,
            p_tenant_id: tenantId,
            p_sender_id: senderId
        }
    );

    if (error) {
        showToast(`Reminder failed: ${error.message}`, 'error');
        return false;
    }

    const assigneeName = getUserName(assigneeId);

    await postTaskReplyToOriginal(
        taskId,
        'REMINDER',
        `Reminder sent to ${assigneeName}`
    );

    showToast(`Reminder sent to ${assigneeName}.`, 'success');
    await refreshCurrentMobileTaskScreen();
    return true;
}

async function remindAllPending(
    taskId
) {
    const assignments = await fetchTaskAssignments([taskId]);

    const pending = assignments.filter(assignment => {
        const status = getEffectiveStatus(assignment);
        return !isClosedAssignment(assignment) && status !== 'accepted';
    });

    if (!pending.length) {
        showToast('No pending assignees.', 'info');
        return;
    }

    let sent = 0;
    const failures = [];

    for (const assignment of pending) {
        const ok = await sendTaskReminder(taskId, assignment.assignee_id);
        if (ok) sent += 1;
        else failures.push(getProfileName(assignment.profiles));
    }

    if (sent) {
        showToast(`Reminder sent to ${sent} assignee(s).`, 'success');
    }

    if (failures.length) {
        showToast(`Reminder failed for: ${failures.join(', ')}`, 'warning');
    }

    await refreshCurrentMobileTaskScreen();
}

async function approveTask(
    taskId,
    assigneeId
) {
    const task = await fetchTask(taskId);

    if (!task) return;

    const success = await updateAssignment(
        taskId,
        assigneeId,
        {
            status: 'accepted',
            state: 'accepted'
        }
    );

    if (!success) return;

    await addTrail(
        taskId,
        'ACCEPT',
        `Completion accepted for ${getUserName(assigneeId)}`
    );

    await notifyUser(
        assigneeId,
        task,
        `🎉 Task Accepted: ${task.title}`
    );

    showToast(
        'Completion accepted.',
        'success'
    );

    await refreshCurrentMobileTaskScreen();
}

function openReturnForChanges(
    taskId,
    assigneeId
) {
    openOverlay({
        title: 'Return for Changes',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    Required changes
                </label>

                <textarea
                    id="nmtReturnFeedback"
                    class="nmt-input"
                    placeholder="Clearly explain the corrections required..."
                ></textarea>
            </div>
        `,

        primaryLabel: 'Return Task',
        primaryIcon: 'fa-solid fa-rotate-left',

        onPrimary: async () => {
            const feedback = (
                document.getElementById(
                    'nmtReturnFeedback'
                )?.value || ''
            ).trim();

            if (!feedback) {
                showToast(
                    'Feedback is required.',
                    'warning'
                );

                return false;
            }

            const task = await fetchTask(taskId);

            if (!task) return false;

            const success = await updateAssignment(
                taskId,
                assigneeId,
                {
                    status: 'needs_review',
                    state: 'needs_review'
                }
            );

            if (!success) return false;

            await addTrail(
                taskId,
                'RETURN',
                feedback
            );

            await notifyUser(
                assigneeId,
                task,
                `🔄 Changes Required: ${task.title} — ${feedback.substring(0, 60)}`
            );

            showToast(
                'Task returned for changes.',
                'success'
            );

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}

function openTransfer(
    taskId,
    previousAssigneeId
) {
    const options = (
        window.globalUsersCache || []
    )
        .filter(
            user =>
                user.id !== previousAssigneeId
        )
        .map(
            user => `
                <option value="${escapeAttribute(user.id)}">
                    ${escapeHtml(getProfileName(user))}
                </option>
            `
        )
        .join('');

    openOverlay({
        title: 'Transfer Assignee',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    Transfer to
                </label>

                <select
                    id="nmtTransferUser"
                    class="nmt-input"
                >
                    <option value="">
                        Select replacement
                    </option>

                    ${options}
                </select>
            </div>

            <div class="nmt-field">
                <label class="nmt-label">
                    Transfer reason
                </label>

                <textarea
                    id="nmtTransferReason"
                    class="nmt-input"
                    placeholder="Explain why this assignment is being transferred..."
                ></textarea>
            </div>

            <div
                style="
                    padding:11px;
                    border-radius:12px;
                    background:#fff7ed;
                    color:#9a3412;
                    font-size:10px;
                    line-height:1.5;
                "
            >
                The previous assignment will remain in the
                audit history with status “Transferred”.
            </div>
        `,

        primaryLabel: 'Transfer',
        primaryIcon:
            'fa-solid fa-arrow-right-arrow-left',

        onPrimary: async () => {
            const replacementId =
                document.getElementById(
                    'nmtTransferUser'
                )?.value;

            const reason = (
                document.getElementById(
                    'nmtTransferReason'
                )?.value || ''
            ).trim();

            if (!replacementId) {
                showToast(
                    'Select a replacement.',
                    'warning'
                );

                return false;
            }

            if (!reason) {
                showToast(
                    'Transfer reason is required.',
                    'warning'
                );

                return false;
            }

            const { data: existing } = await sb
                .from('task_assignees')
                .select('assignee_id')
                .eq('tenant_id', getTenantId())
                .eq('task_id', taskId)
                .eq('assignee_id', replacementId)
                .maybeSingle();

            if (existing) {
                showToast(
                    'This person is already assigned.',
                    'warning'
                );

                return false;
            }

            const task = await fetchTask(taskId);

            if (!task) return false;

            const previousAssignment =
                await sb
                    .from('task_assignees')
                    .select('status,state,acked')
                    .eq('tenant_id', getTenantId())
                    .eq('task_id', taskId)
                    .eq(
                        'assignee_id',
                        previousAssigneeId
                    )
                    .single();

            const { error: closeError } = await sb
                .from('task_assignees')
                .update({
                    status: 'transferred',
                    state: 'closed'
                })
                .eq('tenant_id', getTenantId())
                .eq('task_id', taskId)
                .eq(
                    'assignee_id',
                    previousAssigneeId
                );

            if (closeError) {
                showToast(
                    closeError.message,
                    'error'
                );

                return false;
            }

            const { error: insertError } = await sb
                .from('task_assignees')
                .insert({
                    task_id: taskId,
                    assignee_id: replacementId,
                    tenant_id: getTenantId(),
                    status: 'pending_ack',
                    state: 'pending',
                    acked: false
                });

            if (insertError) {
                if (previousAssignment.data) {
                    await sb
                        .from('task_assignees')
                        .update(
                            previousAssignment.data
                        )
                        .eq(
                            'tenant_id',
                            getTenantId()
                        )
                        .eq('task_id', taskId)
                        .eq(
                            'assignee_id',
                            previousAssigneeId
                        );
                }

                showToast(
                    insertError.message,
                    'error'
                );

                return false;
            }

            await addTrail(
                taskId,
                'TRANSFER',
                `${getUserName(previousAssigneeId)} → ${getUserName(replacementId)}: ${reason}`
            );

            await notifyUser(
                replacementId,
                task,
                `🔁 Task Transferred to you: ${task.title}`
            );

            await notifyUser(
                previousAssigneeId,
                task,
                `🔁 Your task assignment was transferred: ${task.title}`
            );

            showToast(
                'Assignment transferred.',
                'success'
            );

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}

function openDeadlineChange(taskId) {
    openOverlay({
        title: 'Change Deadline',

        body: `
            <div class="nmt-field">
                <label class="nmt-label">
                    New deadline
                </label>

                <input
                    id="nmtNewDeadline"
                    class="nmt-input"
                    type="date"
                >
            </div>

            <div class="nmt-field">
                <label class="nmt-label">
                    Reason
                </label>

                <textarea
                    id="nmtDeadlineReason"
                    class="nmt-input"
                    placeholder="Explain why the deadline is being changed..."
                ></textarea>
            </div>
        `,

        primaryLabel: 'Update Deadline',
        primaryIcon: 'fa-solid fa-calendar-check',

        onPrimary: async () => {
            const deadline =
                document.getElementById(
                    'nmtNewDeadline'
                )?.value;

            const reason = (
                document.getElementById(
                    'nmtDeadlineReason'
                )?.value || ''
            ).trim();

            if (!deadline) {
                showToast(
                    'Select the new deadline.',
                    'warning'
                );

                return false;
            }

            if (!reason) {
                showToast(
                    'Reason is required.',
                    'warning'
                );

                return false;
            }

            const task = await fetchTask(taskId);

            if (!task) return false;

            const { error } = await sb
                .from('tasks')
                .update({
                    deadline
                })
                .eq('tenant_id', getTenantId())
                .eq('id', taskId);

            if (error) {
                showToast(error.message, 'error');
                return false;
            }

            await addTrail(
                taskId,
                'DEADLINE',
                `Deadline changed to ${formatDate(deadline)}: ${reason}`
            );

            const assignments =
                await fetchTaskAssignments([taskId]);

            for (const assignment of assignments) {
                if (isClosedAssignment(assignment)) {
                    continue;
                }

                await notifyUser(
                    assignment.assignee_id,
                    task,
                    `📅 Deadline changed for task “${task.title}” to ${formatDate(deadline)}`
                );
            }

            showToast(
                'Deadline updated.',
                'success'
            );

            await refreshCurrentMobileTaskScreen();

            return true;
        }
    });
}


function openDeadlineExtensionRequest(
    taskId,
    assigneeId
) {
    openOverlay({
        title: 'Request Deadline Extension',
        body: `
            <div class="nmt-field">
                <label class="nmt-label">Requested deadline</label>
                <input id="nmtRequestedDeadline" class="nmt-input" type="date">
            </div>
            <div class="nmt-field">
                <label class="nmt-label">Reason</label>
                <textarea id="nmtExtensionReason" class="nmt-input"
                    placeholder="Explain why more time is required..."></textarea>
            </div>
        `,
        primaryLabel: 'Send Request',
        primaryIcon: 'fa-solid fa-calendar-plus',
        onPrimary: async () => {
            const requestedDate = document.getElementById('nmtRequestedDeadline')?.value;
            const reason = (document.getElementById('nmtExtensionReason')?.value || '').trim();

            if (!requestedDate) {
                showToast('Select the requested deadline.', 'warning');
                return false;
            }

            if (!reason) {
                showToast('A reason is required.', 'warning');
                return false;
            }

            const task = await fetchTask(taskId);
            if (!task) return false;
            const { error } = await sb.rpc('request_task_extension', {
                p_task_id: taskId,
                p_requested_deadline: requestedDate,
                p_reason: reason,
                p_tenant_id: getTenantId()
            });

            if (error) {
                showToast(`Extension request failed: ${error.message}`, 'error');
                return false;
            }


            showToast('Deadline-extension request sent.', 'success');
            await refreshCurrentMobileTaskScreen();
            return true;
        }
    });
}

function openCancelTask(taskId) {
    openOverlay({
        title: 'Cancel Task',
        body: `
            <div class="nmt-field">
                <label class="nmt-label">Cancellation reason</label>
                <textarea id="nmtCancelReason" class="nmt-input"
                    placeholder="Explain why this task is being cancelled..."></textarea>
            </div>
            <div style="padding:11px;border-radius:12px;background:#fef2f2;color:#991b1b;font-size:11px;line-height:1.55;">
                Cancellation keeps the task and its complete audit history. It does not delete records.
            </div>
        `,
        primaryLabel: 'Cancel Task',
        primaryIcon: 'fa-solid fa-ban',
        onPrimary: async () => {
            const reason = (document.getElementById('nmtCancelReason')?.value || '').trim();

            if (!reason) {
                showToast('Cancellation reason is required.', 'warning');
                return false;
            }

            const task = await fetchTask(taskId);
            if (!task) return false;

            if (task.assigned_by !== getCurrentUserId()) {
                showToast('Only the task creator can cancel this task.', 'error');
                return false;
            }

            const { error: taskError } = await sb
                .from('tasks')
                .update({ status: 'cancelled' })
                .eq('tenant_id', getTenantId())
                .eq('id', taskId)
                .eq('assigned_by', getCurrentUserId());

            if (taskError) {
                showToast(taskError.message, 'error');
                return false;
            }

            const { error: assignmentError } = await sb
                .from('task_assignees')
                .update({ status: 'cancelled', state: 'closed' })
                .eq('tenant_id', getTenantId())
                .eq('task_id', taskId)
                .not('status', 'in', '("accepted","transferred","cancelled")');

            if (assignmentError) {
                showToast(assignmentError.message, 'error');
                return false;
            }

            await addTrail(taskId, 'CANCEL', reason);
            showToast('Task cancelled. History has been preserved.', 'success');
            await refreshCurrentMobileTaskScreen();
            return true;
        }
    });
}

/* -------------------------------------------------------------------------- */
/* Original message and file opening                                          */
/* -------------------------------------------------------------------------- */

async function openOriginalMessage(task) {
    if (!task?.id) {
        showToast('Task information is unavailable.', 'warning');
        return;
    }

    if (typeof window.openTaskOriginalMessage === 'function') {
        await window.openTaskOriginalMessage(task.id);
        return;
    }

    showToast('Original-message navigation is unavailable.', 'warning');
}

async function openTaskFile(path) {
    if (!path) {
        showToast(
            'File path is unavailable.',
            'warning'
        );

        return;
    }

    if (typeof window.openSecureFile === 'function') {
        await window.openSecureFile(path);
        return;
    }

    const { data, error } = await sb
        .storage
        .from('task-proofs')
        .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
        showToast(
            error?.message ||
            'Could not open the file.',
            'error'
        );

        return;
    }

    window.open(
        data.signedUrl,
        '_blank',
        'noopener,noreferrer'
    );
}

/* -------------------------------------------------------------------------- */
/* Render task list                                                           */
/* -------------------------------------------------------------------------- */

function renderPrimaryCardAction(
    task,
    myAssignment,
    isCreator,
    submittedCount
) {
    if (isCreator) {
        return `
            <button
                type="button"
                class="nmt-button primary"
                data-nmt-action="manage"
                data-task="${escapeAttribute(task.id)}"
                data-title="${escapeAttribute(task.title)}"
            >
                <i class="fa-solid fa-list-check"></i>
                ${submittedCount ? `Manage · ${submittedCount} Review` : 'Manage Task'}
            </button>
        `;
    }

    return `
        <button
            type="button"
            class="nmt-button primary"
            data-nmt-action="open-detail"
            data-task="${escapeAttribute(task.id)}"
            data-title="${escapeAttribute(task.title)}"
        >
            <i class="fa-solid fa-eye"></i>
            Open Task
        </button>
    `;
}
function renderCardSecondaryActions() {
    return '';
}

async function renderMobileTasks() {
    if (
        !isMobileTaskDevice() ||
        !getTenantId() ||
        !getCurrentUserId()
    ) {
        return;
    }

    const stage =
        document.getElementById('mStage');

    if (!stage) return;

    currentMobileTaskScreen = 'tasks';
    currentMobileTaskParams = null;

    const { data: tasks, error } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('tenant_id', getTenantId())
        .order('created_at', {
            ascending: false
        })
        .limit(200);

    if (error) {
        stage.innerHTML = `
            <div class="mScr nmt-owned" data-screen="tasks">
                <div class="nmt-screen">
                    <div class="nmt-header">
                        <div class="nmt-header-title">
                            Tasks
                        </div>
                    </div>

                    <div class="nmt-empty">
                        Could not load tasks.
                    </div>
                </div>
            </div>
        `;

        return;
    }

    const taskIds = (tasks || []).map(
        task => task.id
    );

    const assignments =
        await fetchTaskAssignments(taskIds);

    const assignmentsByTask = {};

    for (const assignment of assignments) {
        if (!assignmentsByTask[assignment.task_id]) {
            assignmentsByTask[assignment.task_id] = [];
        }

        assignmentsByTask[assignment.task_id]
            .push(assignment);
    }

    let visibleTasks = (tasks || []).filter(
        task => {
            const taskAssignments = assignmentsByTask[task.id] || [];
            return (
                task.assigned_by === getCurrentUserId() ||
                taskAssignments.some(
                    assignment => assignment.assignee_id === getCurrentUserId()
                )
            );
        }
    );

    visibleTasks = visibleTasks.filter(task => {
        const taskAssignments = assignmentsByTask[task.id] || [];
        const summary = summariseAssignments(taskAssignments);
        const myAssignment = taskAssignments.find(
            assignment => assignment.assignee_id === getCurrentUserId()
        );
        const isCreator = task.assigned_by === getCurrentUserId();
        const isCompleted = summary.total > 0 && summary.completed === summary.total;

        switch (mobileTaskFilter) {
            case 'created_by_me':
                return isCreator;
            case 'assigned_to_me':
                return Boolean(myAssignment);
            case 'pending':
                return !isCompleted;
            case 'completed':
                return isCompleted;
            case 'overdue':
                return isOverdue(task.deadline) && !isCompleted;
            default:
                return true;
        }
    });

    visibleTasks.sort((a, b) => {
        if (mobileTaskSort === 'created_asc') {
            return new Date(a.created_at) - new Date(b.created_at);
        }
        if (mobileTaskSort === 'deadline_asc') {
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(a.deadline) - new Date(b.deadline);
        }
        if (mobileTaskSort === 'deadline_desc') {
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;
            return new Date(b.deadline) - new Date(a.deadline);
        }
        return new Date(b.created_at) - new Date(a.created_at);
    });

    const cards = visibleTasks.map((task, taskIndex) => {
        const taskAssignments =
            assignmentsByTask[task.id] || [];

        const summary =
            summariseAssignments(taskAssignments);

        const statusInfo =
            getStatusInformation(
                summary.overallStatus
            );

        const myAssignment =
            taskAssignments.find(
                assignment =>
                    assignment.assignee_id ===
                        getCurrentUserId() &&
                    !isClosedAssignment(assignment)
            );

        const isCreator =
            task.assigned_by === getCurrentUserId();

        const submittedCount =
            summary.counts.submitted || 0;

        const pendingCount =
            summary.counts.pending_ack || 0;

        const workingCount =
            (summary.counts.acknowledged || 0) +
            (summary.counts.in_progress || 0);

        const reviewCount =
            (summary.counts.submitted || 0) +
            (summary.counts.needs_review || 0);

        const allCompleted =
            summary.total > 0 &&
            summary.completed === summary.total;

        const priority =
            String(task.priority || 'normal')
                .toLowerCase();

        const priorityStyle =
            priority === 'high' ||
            priority === 'urgent'
                ? {
                    label: 'HIGH',
                    colour: '#b91c1c',
                    background: '#fef2f2'
                }
                : priority === 'low'
                    ? {
                        label: 'LOW',
                        colour: '#166534',
                        background: '#f0fdf4'
                    }
                    : {
                        label: 'NORMAL',
                        colour: '#1d4ed8',
                        background: '#eff6ff'
                    };

        const overdue =
            isOverdue(task.deadline) &&
            !allCompleted;

        return `
            <article
                class="nmt-card ${
                    allCompleted ? 'completed' : ''
                }"
            >
                <div
                    class="nmt-card-accent"
                    style="background:${statusInfo.border};"
                ></div>

                <div class="nmt-card-content">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;">
                        <span style="color:var(--accent,#4f46e5);font-size:11px;font-weight:900;letter-spacing:.06em;">
                            TASK #${taskIndex + 1}
                        </span>
                        <span style="color:var(--text-secondary,#64748b);font-size:10px;font-weight:700;">
                            ${escapeHtml(formatDateTime(task.created_at))}
                        </span>
                    </div>

                    <div class="nmt-title-row">
                        <div class="nmt-title-area">
                            <h3 class="nmt-task-title">
                                ${escapeHtml(task.title)}
                            </h3>

                            <div class="nmt-task-meta">
                                ${escapeHtml(
                                    getProfileName(task.creator)
                                )}
                                ·
                                ${summary.total}
                                ${
                                    summary.total === 1
                                        ? 'assignee'
                                        : 'assignees'
                                }
                            </div>
                        </div>

                        <span
                            class="nmt-priority"
                            style="
                                color:${priorityStyle.colour};
                                background:${priorityStyle.background};
                            "
                        >
                            ${priorityStyle.label}
                        </span>
                    </div>

                    <div class="nmt-status-row">
                        <span
                            class="nmt-status"
                            style="
                                color:${statusInfo.colour};
                                border-color:${statusInfo.border};
                                background:${statusInfo.background};
                            "
                        >
                            <i class="${statusInfo.icon}"></i>
                            ${escapeHtml(statusInfo.label)}
                        </span>

                        <span
                            class="nmt-deadline ${
                                overdue ? 'overdue' : ''
                            }"
                        >
                            <i class="fa-regular fa-calendar"></i>

                            ${escapeHtml(
                                formatDate(task.deadline)
                            )}

                            ${overdue ? ' · Overdue' : ''}
                        </span>
                    </div>

                    <div class="nmt-stat-grid">
                        <div class="nmt-stat">
                            <span class="nmt-stat-number">
                                ${pendingCount}
                            </span>

                            <span class="nmt-stat-label">
                                Awaiting
                            </span>
                        </div>

                        <div class="nmt-stat">
                            <span class="nmt-stat-number">
                                ${workingCount}
                            </span>

                            <span class="nmt-stat-label">
                                Working
                            </span>
                        </div>

                        <div class="nmt-stat">
                            <span class="nmt-stat-number">
                                ${reviewCount}
                            </span>

                            <span class="nmt-stat-label">
                                Review
                            </span>
                        </div>

                        <div class="nmt-stat">
                            <span class="nmt-stat-number">
                                ${summary.completed}
                            </span>

                            <span class="nmt-stat-label">
                                Completed
                            </span>
                        </div>
                    </div>

                    <div class="nmt-progress">
                        <div class="nmt-progress-label">
                            <span>
                                Engaged
                                ${summary.engagementPercentage}%
                            </span>

                            <span>
                                Completed
                                ${summary.completionPercentage}%
                            </span>
                        </div>

                        <div class="nmt-progress-track">
                            <div
                                class="nmt-progress-engaged"
                                style="width:${summary.engagementPercentage}%;"
                            ></div>

                            <div
                                class="nmt-progress-completed"
                                style="width:${summary.completionPercentage}%;"
                            ></div>
                        </div>
                    </div>

                    <div class="nmt-action-row nmt-single-action">
                        ${renderPrimaryCardAction(
                            task,
                            myAssignment,
                            isCreator,
                            submittedCount
                        )}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    stage.innerHTML = `
        <div class="mScr nmt-owned" data-screen="tasks">
            <div class="nmt-screen">
                <div class="nmt-header">
                    <div class="nmt-header-title">
                        Tasks <span style="font-size:10px;opacity:.65;font-weight:800;">${NILTASK_TASK_UI_VERSION}</span>
                    </div>

                    <button
                        type="button"
                        class="nmt-header-button"
                        data-nmt-action="refresh-tasks"
                        title="Refresh"
                    >
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                </div>

                <div class="nmt-task-filterbar">
                    <select class="nmt-filter-select" onchange="window.nmtSetTaskFilter(this.value)">
                        <option value="all" ${mobileTaskFilter === 'all' ? 'selected' : ''}>All Tasks</option>
                        <option value="created_by_me" ${mobileTaskFilter === 'created_by_me' ? 'selected' : ''}>Created by Me</option>
                        <option value="assigned_to_me" ${mobileTaskFilter === 'assigned_to_me' ? 'selected' : ''}>Assigned to Me</option>
                        <option value="pending" ${mobileTaskFilter === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="completed" ${mobileTaskFilter === 'completed' ? 'selected' : ''}>Completed</option>
                        <option value="overdue" ${mobileTaskFilter === 'overdue' ? 'selected' : ''}>Overdue</option>
                    </select>
                    <select class="nmt-filter-select" onchange="window.nmtSetTaskSort(this.value)">
                        <option value="created_desc" ${mobileTaskSort === 'created_desc' ? 'selected' : ''}>Newest First</option>
                        <option value="created_asc" ${mobileTaskSort === 'created_asc' ? 'selected' : ''}>Oldest First</option>
                        <option value="deadline_asc" ${mobileTaskSort === 'deadline_asc' ? 'selected' : ''}>Deadline: Soonest</option>
                        <option value="deadline_desc" ${mobileTaskSort === 'deadline_desc' ? 'selected' : ''}>Deadline: Latest</option>
                    </select>
                </div>

                <div class="nmt-list">
                    ${
                        cards ||
                        `
                            <div class="nmt-empty">
                                <i
                                    class="fa-solid fa-clipboard-list"
                                    style="
                                        display:block;
                                        margin-bottom:10px;
                                        font-size:30px;
                                    "
                                ></i>

                                No tasks found.
                            </div>
                        `
                    }
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/* Render task detail                                                         */
/* -------------------------------------------------------------------------- */

function renderCreatorAssignmentActions(
    task,
    assignment
) {
    const status =
        getEffectiveStatus(assignment);

    if (status === 'transferred') {
        return `
            <button
                type="button"
                class="nmt-mini-button nmt-mini-purple"
                data-nmt-action="view-timeline"
            >
                History
            </button>
        `;
    }

    if (status === 'accepted') {
        return `
            <button
                type="button"
                class="nmt-mini-button nmt-mini-purple"
                data-nmt-action="view-timeline"
            >
                Timeline
            </button>
        `;
    }

    if (status === 'submitted') {
        return `
            <button
                type="button"
                class="nmt-mini-button nmt-mini-green"
                data-nmt-action="approve"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(assignment.assignee_id)}"
            >
                Approve
            </button>

            <button
                type="button"
                class="nmt-mini-button nmt-mini-red"
                data-nmt-action="return"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(assignment.assignee_id)}"
            >
                Return
            </button>

            <button
                type="button"
                class="nmt-mini-button nmt-mini-purple"
                data-nmt-action="transfer"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(assignment.assignee_id)}"
            >
                Transfer
            </button>
        `;
    }

    return `
        <button
            type="button"
            class="nmt-mini-button nmt-mini-orange"
            data-nmt-action="remind-one"
            data-task="${escapeAttribute(task.id)}"
            data-assignee="${escapeAttribute(assignment.assignee_id)}"
        >
            Reminder
        </button>

        <button
            type="button"
            class="nmt-mini-button nmt-mini-purple"
            data-nmt-action="transfer"
            data-task="${escapeAttribute(task.id)}"
            data-assignee="${escapeAttribute(assignment.assignee_id)}"
        >
            Transfer
        </button>
    `;
}

function renderAssigneeMainActions(
    task,
    myAssignment
) {
    if (!myAssignment) return '';

    const status =
        getEffectiveStatus(myAssignment);

    if (status === 'pending_ack') {
        return `
            <button
                type="button"
                class="nmt-button primary"
                data-nmt-action="acknowledge"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(getCurrentUserId())}"
            >
                <i class="fa-solid fa-check"></i>
                Acknowledge Task
            </button>
            <button
                type="button"
                class="nmt-button secondary"
                data-nmt-action="request-extension"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(getCurrentUserId())}"
                style="margin-top:8px;width:100%;"
            >
                <i class="fa-solid fa-calendar-plus"></i>
                Request Deadline Extension
            </button>
        `;
    }

    if (status === 'acknowledged') {
        return `
            <button
                type="button"
                class="nmt-button primary"
                data-nmt-action="start"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(getCurrentUserId())}"
            >
                <i class="fa-solid fa-play"></i>
                Start Work
            </button>
            <button
                type="button"
                class="nmt-button secondary"
                data-nmt-action="request-extension"
                data-task="${escapeAttribute(task.id)}"
                data-assignee="${escapeAttribute(getCurrentUserId())}"
                style="margin-top:8px;width:100%;"
            >
                <i class="fa-solid fa-calendar-plus"></i>
                Request Deadline Extension
            </button>
        `;
    }

    if (
        status === 'in_progress' ||
        status === 'needs_review'
    ) {
        return `
            <div
                style="
                    display:grid;
                    grid-template-columns:repeat(2,minmax(0,1fr));
                    gap:8px;
                "
            >
                <button
                    type="button"
                    class="nmt-button secondary"
                    data-nmt-action="progress"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-comment-dots"></i>
                    Update
                </button>

                <button
                    type="button"
                    class="nmt-button secondary"
                    data-nmt-action="upload"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-paperclip"></i>
                    Upload
                </button>

                <button
                    type="button"
                    class="nmt-button secondary"
                    data-nmt-action="delegate"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-user-plus"></i>
                    Delegate
                </button>

                <button
                    type="button"
                    class="nmt-button secondary"
                    data-nmt-action="request-extension"
                    data-task="${escapeAttribute(task.id)}"
                    data-assignee="${escapeAttribute(getCurrentUserId())}"
                >
                    <i class="fa-solid fa-calendar-plus"></i>
                    Request Extension
                </button>

                <button
                    type="button"
                    class="nmt-button primary"
                    data-nmt-action="submit"
                    data-task="${escapeAttribute(task.id)}"
                    data-assignee="${escapeAttribute(getCurrentUserId())}"
                    data-proof="${task.require_proof ? '1' : '0'}"
                >
                    <i class="fa-solid fa-paper-plane"></i>
                    ${
                        status === 'needs_review'
                            ? 'Resubmit'
                            : 'Submit'
                    }
                </button>
            </div>
        `;
    }

    if (status === 'submitted') {
        return `
            <div class="nmt-empty" style="padding:10px;">
                Waiting for the task creator to review your submission.
            </div>
        `;
    }

    if (status === 'accepted') {
        return `
            <div class="nmt-empty" style="padding:10px;">
                🎉 This assignment is complete.
            </div>
        `;
    }

    return '';
}

async function renderMobileTaskDetail(params) {
    if (
        !isMobileTaskDevice() ||
        !params?.id
    ) {
        return;
    }

    const stage =
        document.getElementById('mStage');

    if (!stage) return;

    currentMobileTaskScreen = 'taskDetail';
    currentMobileTaskParams = {
        id: params.id,
        title: params.title || ''
    };

    const task = await fetchTask(params.id);

    if (!task) return;

    const assignments =
        await fetchTaskAssignments([task.id]);

    const trails =
        await fetchTaskTrails(task.id);

    const extensionRequests =
        await fetchTaskExtensionRequests(task.id);

    const pendingExtensionRequests = extensionRequests.filter(
        request => request.status === 'pending'
    );

    const summary =
        summariseAssignments(assignments);

    const statusInfo =
        getStatusInformation(
            summary.overallStatus
        );

    const isCreator =
        task.assigned_by === getCurrentUserId();

    const myAssignment =
        assignments.find(
            assignment =>
                assignment.assignee_id ===
                    getCurrentUserId() &&
                !isClosedAssignment(assignment)
        );

    const staffRows = assignments.map(
        assignment => {
            const status =
                getEffectiveStatus(assignment);

            const info =
                getStatusInformation(status);

            const name =
                getProfileName(
                    assignment.profiles
                );

            return `
                <div class="nmt-person">
                    <div class="nmt-avatar">
                        ${escapeHtml(
                            name.charAt(0).toUpperCase()
                        )}
                    </div>

                    <div class="nmt-person-info">
                        <div class="nmt-person-name">
                            ${escapeHtml(name)}
                        </div>

                        <div
                            class="nmt-person-state"
                            style="color:${info.colour};"
                        >
                            <i class="${info.icon}"></i>
                            ${escapeHtml(info.label)}
                        </div>
                    </div>

                    ${
                        isCreator
                            ? `
                                <div class="nmt-person-actions">
                                    ${renderCreatorAssignmentActions(
                                        task,
                                        assignment
                                    )}
                                </div>
                            `
                            : ''
                    }
                </div>
            `;
        }
    ).join('');

    const extensionRequestRows = pendingExtensionRequests.map(request => `
        <div class="nmt-person" style="align-items:flex-start;">
            <div class="nmt-avatar"><i class="fa-solid fa-calendar-plus"></i></div>
            <div class="nmt-person-info">
                <div class="nmt-person-name">${escapeHtml(getProfileName(request.profiles))}</div>
                <div class="nmt-person-state" style="font-size:12px;line-height:1.5;">
                    Requested: <b>${escapeHtml(formatDate(request.requested_deadline))}</b><br>
                    ${escapeHtml(request.reason || '')}
                </div>
            </div>
            <div class="nmt-person-actions">
                <button type="button" class="nmt-mini-button nmt-mini-green"
                    data-nmt-action="approve-extension" data-request="${escapeAttribute(request.id)}">Approve</button>
                <button type="button" class="nmt-mini-button nmt-mini-red"
                    data-nmt-action="reject-extension" data-request="${escapeAttribute(request.id)}">Decline</button>
            </div>
        </div>
    `).join('');

    const trailRows = trails.map(
        (trail, index) => {
            const action =
                trail.action || 'UPDATE';

            const comment =
                trail.comment || '';

            const isFile =
                action === 'FILE' &&
                comment.includes('|');

            const fileParts =
                isFile
                    ? comment.split('|')
                    : [];

            return `
                <div class="nmt-trail-row">
                    <div class="nmt-trail-number">
                        ${trails.length - index}
                    </div>

                    <div class="nmt-trail-body">
                        <div class="nmt-trail-meta">
                            ${escapeHtml(
                                getProfileName(
                                    trail.profiles
                                )
                            )}

                            <span class="nmt-trail-time">
                                ·
                                ${escapeHtml(
                                    formatDateTime(
                                        trail.created_at
                                    )
                                )}
                            </span>
                        </div>

                        <div class="nmt-trail-comment">
                            <strong>
                                ${escapeHtml(action)}
                            </strong>

                            ${
                                isFile
                                    ? `
                                        —
                                        <button
                                            type="button"
                                            style="
                                                border:0;
                                                padding:0;
                                                background:none;
                                                color:#2563eb;
                                                text-decoration:underline;
                                                font-size:10px;
                                            "
                                            data-nmt-action="open-file"
                                            data-path="${escapeAttribute(fileParts[1] || '')}"
                                        >
                                            ${escapeHtml(fileParts[0] || 'Attachment')}
                                        </button>
                                    `
                                    : comment
                                        ? `— ${escapeHtml(comment)}`
                                        : ''
                            }
                        </div>
                    </div>
                </div>
            `;
        }
    ).join('');

    const pendingCount =
        summary.active.filter(
            assignment =>
                getEffectiveStatus(assignment) !==
                'accepted'
        ).length;

    stage.innerHTML = `
        <div class="mScr nmt-owned" data-screen="taskDetail">
            <div class="nmt-screen">
                <div class="nmt-header">
                    <button
                        type="button"
                        class="nmt-header-button"
                        data-nmt-action="back"
                    >
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>

                    <div class="nmt-header-title">
                        Task Details
                    </div>

                </div>

                <div class="nmt-detail-content">
                    <div class="nmt-section">
                        <h2
                            style="
                                margin:0;
                                color:var(--text-primary,#111827);
                                font-size:17px;
                                line-height:1.4;
                                font-weight:900;
                            "
                        >
                            ${escapeHtml(task.title)}
                        </h2>

                        <div
                            style="
                                margin-top:8px;
                                color:var(--text-secondary,#64748b);
                                font-size:11px;
                                line-height:1.6;
                            "
                        >
                            Created by
                            <strong>
                                ${escapeHtml(
                                    getProfileName(task.creator)
                                )}
                            </strong>

                            <br>

                            Deadline:
                            <strong>
                                ${escapeHtml(
                                    formatDate(task.deadline)
                                )}
                            </strong>

                            ${
                                isOverdue(task.deadline) &&
                                summary.completed !==
                                    summary.total
                                    ? `
                                        <span
                                            style="
                                                color:#b91c1c;
                                                font-weight:900;
                                            "
                                        >
                                            · Overdue
                                        </span>
                                    `
                                    : ''
                            }
                        </div>

                        <div
                            class="nmt-status"
                            style="
                                margin-top:11px;
                                color:${statusInfo.colour};
                                border-color:${statusInfo.border};
                                background:${statusInfo.background};
                            "
                        >
                            <i class="${statusInfo.icon}"></i>
                            ${escapeHtml(statusInfo.label)}
                        </div>

                        <div class="nmt-progress">
                            <div class="nmt-progress-label">
                                <span>
                                    Engaged
                                    ${summary.engagementPercentage}%
                                </span>

                                <span>
                                    Completed
                                    ${summary.completionPercentage}%
                                </span>
                            </div>

                            <div class="nmt-progress-track">
                                <div
                                    class="nmt-progress-engaged"
                                    style="width:${summary.engagementPercentage}%;"
                                ></div>

                                <div
                                    class="nmt-progress-completed"
                                    style="width:${summary.completionPercentage}%;"
                                ></div>
                            </div>
                        </div>
                    </div>

                    ${
                        myAssignment
                            ? `
                                <div class="nmt-section">
                                    <div class="nmt-section-title">
                                        <i class="fa-solid fa-user-check"></i>
                                        My Actions
                                    </div>

                                    ${renderAssigneeMainActions(
                                        task,
                                        myAssignment
                                    )}
                                </div>
                            `
                            : ''
                    }

                    ${
                        isCreator
                            ? `
                                <div class="nmt-section">
                                    <div class="nmt-section-title">
                                        <i class="fa-solid fa-screwdriver-wrench"></i>
                                        Creator Controls
                                    </div>

                                    <div class="nmt-manage-grid">
                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="remind-all"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-solid fa-bell"></i>
                                            Remind Pending
                                            ${
                                                pendingCount
                                                    ? `(${pendingCount})`
                                                    : ''
                                            }
                                        </button>

                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="deadline"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-solid fa-calendar-days"></i>
                                            Change Deadline
                                        </button>

                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="original-message"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-regular fa-message"></i>
                                            Original Message
                                        </button>

                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="download-pdf"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-solid fa-file-pdf"></i>
                                            PDF Report
                                        </button>
                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="cancel-task"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-solid fa-ban"></i>
                                            Cancel Task
                                        </button>

                                    </div>
                                </div>
                            `
                            : ''
                    }

                    ${
                        isCreator && extensionRequestRows
                            ? `
                                <div class="nmt-section">
                                    <div class="nmt-section-title">
                                        <i class="fa-solid fa-calendar-plus"></i>
                                        Deadline Extension Requests
                                    </div>
                                    ${extensionRequestRows}
                                </div>
                            `
                            : ''
                    }

                    <div class="nmt-section">
                        <div class="nmt-section-title">
                            <i class="fa-solid fa-users"></i>
                            Staff Status
                        </div>

                        ${
                            staffRows ||
                            `
                                <div class="nmt-empty" style="padding:10px;">
                                    No assignees.
                                </div>
                            `
                        }
                    </div>

                    <div
                        id="nmtTimeline"
                        class="nmt-section"
                    >
                        <div class="nmt-section-title">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                            Timeline
                        </div>

                        ${
                            trailRows ||
                            `
                                <div class="nmt-empty" style="padding:10px;">
                                    No activity recorded.
                                </div>
                            `
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/* Creator management sheet                                                   */
/* -------------------------------------------------------------------------- */

async function openManageSheet(taskId) {
    const task = await fetchTask(taskId);

    if (!task) return;

    const assignments =
        await fetchTaskAssignments([taskId]);

    const pending = assignments.filter(
        assignment =>
            !isClosedAssignment(assignment) &&
            getEffectiveStatus(assignment) !== 'accepted'
    ).length;
    const isCreator = task.assigned_by === getCurrentUserId();
    const myAssignment = assignments.find(
        assignment =>
            assignment.assignee_id === getCurrentUserId() &&
            !isClosedAssignment(assignment)
    );

    if (!isCreator) {
        closeOverlay();
        await renderMobileTaskDetail({ id: task.id, title: task.title });
        return;
    }

    openOverlay({
        title: 'Manage Task',

        body: `
            <div class="nmt-manage-grid">
                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="remind-all"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-bell"></i>
                    Remind Pending
                    ${pending ? `(${pending})` : ''}
                </button>

                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="open-detail"
                    data-task="${escapeAttribute(task.id)}"
                    data-title="${escapeAttribute(task.title)}"
                >
                    <i class="fa-solid fa-users"></i>
                    Staff Status
                </button>

                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="deadline"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-calendar-days"></i>
                    Change Deadline
                </button>

                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="open-detail"
                    data-task="${escapeAttribute(task.id)}"
                    data-title="${escapeAttribute(task.title)}"
                >
                    <i class="fa-solid fa-arrow-right-arrow-left"></i>
                    Transfer Assignee
                </button>

                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="original-message"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-regular fa-message"></i>
                    Original Message
                </button>

                <button
                    type="button"
                    class="nmt-manage-option"
                    data-nmt-action="download-pdf"
                    data-task="${escapeAttribute(task.id)}"
                >
                    <i class="fa-solid fa-file-pdf"></i>
                    PDF Report
                </button>
                                        <button
                                            type="button"
                                            class="nmt-manage-option"
                                            data-nmt-action="cancel-task"
                                            data-task="${escapeAttribute(task.id)}"
                                        >
                                            <i class="fa-solid fa-ban"></i>
                                            Cancel Task
                                        </button>

            </div>
        `
    });
}

/* -------------------------------------------------------------------------- */
/* Event handling                                                             */
/* -------------------------------------------------------------------------- */

async function handleMobileTaskClick(event) {
    const button = event.target.closest(
        '[data-nmt-action]'
    );

    if (!button) return;

    const action = button.dataset.nmtAction;
    const taskId = button.dataset.task;
    const assigneeId = button.dataset.assignee;

    if (action === 'close-overlay') {
        closeOverlay();
        return;
    }

    if (action === 'back') {
        if (typeof window._back === 'function') {
            window._back();
        }

        return;
    }

    if (action === 'refresh-tasks') {
        await renderMobileTasks();
        return;
    }

    if (action === 'open-detail') {
        closeOverlay();

        // Render the owned task detail directly. Calling the legacy renderer first
        // caused a visible flash of the old task card in Android WebView.
        await renderMobileTaskDetail({
            id: taskId,
            title: button.dataset.title || ''
        });

        return;
    }

    if (action === 'manage') {
        await openManageSheet(taskId);
        return;
    }

    if (action === 'acknowledge') {
        await acknowledgeTask(taskId, assigneeId);
        return;
    }

    if (action === 'start') {
        await startTask(taskId, assigneeId);
        return;
    }

    if (action === 'submit') {
        await submitTask(
            taskId,
            assigneeId,
            button.dataset.proof === '1'
        );

        return;
    }

    if (action === 'progress') {
        openProgressUpdate(taskId);
        return;
    }

    if (action === 'upload') {
        openUpload(taskId);
        return;
    }

    if (action === 'delegate') {
        openDelegate(taskId);
        return;
    }

    if (action === 'remind-one') {
        await sendTaskReminder(
            taskId,
            assigneeId
        );

        return;
    }

    if (action === 'remind-all') {
        closeOverlay();
        await remindAllPending(taskId);
        return;
    }

    if (action === 'approve') {
        await approveTask(taskId, assigneeId);
        return;
    }

    if (action === 'return') {
        openReturnForChanges(
            taskId,
            assigneeId
        );

        return;
    }

    if (action === 'transfer') {
        openTransfer(
            taskId,
            assigneeId
        );

        return;
    }

    if (action === 'deadline') {
        openDeadlineChange(taskId);
        return;
    }

    if (action === 'request-extension') {
        openDeadlineExtensionRequest(taskId, assigneeId || getCurrentUserId());
        return;
    }

    if (action === 'cancel-task') {
        openCancelTask(taskId);
        return;
    }

    if (action === 'original-message') {
        const task = await fetchTask(taskId);

        if (task) {
            closeOverlay();
            openOriginalMessage(task);
        }

        return;
    }

    if (action === 'download-pdf') {
        closeOverlay();

        if (
            typeof window.downloadTaskPDF ===
            'function'
        ) {
            await window.downloadTaskPDF(taskId);
        } else {
            showToast(
                'PDF report function is unavailable.',
                'warning'
            );
        }

        return;
    }

    if (action === 'approve-extension') {
        await respondTaskExtension(button.dataset.request, true);
        return;
    }

    if (action === 'reject-extension') {
        await respondTaskExtension(button.dataset.request, false);
        return;
    }

    if (action === 'view-timeline') {
        document
            .getElementById('nmtTimeline')
            ?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

        return;
    }

    if (action === 'open-file') {
        await openTaskFile(button.dataset.path);
    }
}

/* -------------------------------------------------------------------------- */
/* Mobile navigation integration                                              */
/* -------------------------------------------------------------------------- */

function replaceMobileNavigation() {
    if (
        typeof window._navTo !== 'function' ||
        window._navTo.__nmtWrapped
    ) {
        return false;
    }

    originalMobileNavigate = window._navTo;

    const wrapped = async function(
        screen,
        params,
        replace = false
    ) {
        const ownsTaskScreen = isMobileTaskDevice()
            && (screen === 'tasks' || screen === 'taskDetail');
        const stage = document.getElementById('mStage');

        // Hide the stage before the legacy renderer paints. It remains hidden only
        // for the few milliseconds needed to install the owned task screen.
        if (ownsTaskScreen && stage) {
            stage.style.setProperty('visibility', 'hidden', 'important');
        }

        let result;
        try {
            result = await originalMobileNavigate(screen, params, replace);

            if (!isMobileTaskDevice()) return result;

            if (screen === 'tasks') {
                await renderMobileTasks();
            }

            if (screen === 'taskDetail') {
                await renderMobileTaskDetail(params || {});
            }

            return result;
        } finally {
            if (ownsTaskScreen && stage) {
                stage.style.removeProperty('visibility');
            }
        }
    };

    wrapped.__nmtWrapped = true;
    wrapped.__nmtOriginal =
        originalMobileNavigate;

    window._navTo = wrapped;

    return true;
}

function observeMobileTaskScreen() {
    const stage =
        document.getElementById('mStage');

    if (!stage || mobileTaskObserver) {
        return;
    }

    mobileTaskObserver = new MutationObserver(
        async () => {
            if (
                mobileTaskRenderLock ||
                !isMobileTaskDevice()
            ) {
                return;
            }

            const screen =
                stage
                    .querySelector('.mScr')
                    ?.dataset
                    ?.screen;

            if (
                screen !== 'tasks' &&
                screen !== 'taskDetail'
            ) {
                return;
            }

            if (
                stage.querySelector(
                    '.nmt-screen'
                )
            ) {
                return;
            }

            mobileTaskRenderLock = true;

            try {
                if (screen === 'tasks') {
                    await renderMobileTasks();
                }

                if (
                    screen === 'taskDetail' &&
                    currentMobileTaskParams?.id
                ) {
                    await renderMobileTaskDetail(
                        currentMobileTaskParams
                    );
                }
            } finally {
                mobileTaskRenderLock = false;
            }
        }
    );

    mobileTaskObserver.observe(
        stage,
        {
            childList: true,
            subtree: true
        }
    );
}

function initialiseMobileTaskModule() {
    installMobileTaskStyles();
    ensureOverlay();

    document.addEventListener(
        'click',
        handleMobileTaskClick
    );

    let attempts = 0;

    const timer = setInterval(() => {
        attempts += 1;

        const navigationReady =
            replaceMobileNavigation();

        const stage =
            document.getElementById('mStage');

        if (stage) {
            observeMobileTaskScreen();
        }

        if (
            (
                navigationReady ||
                window._navTo?.__nmtWrapped
            ) &&
            stage
        ) {
            clearInterval(timer);
        }

        if (attempts > 120) {
            clearInterval(timer);

            console.warn(
                '[mobile-tasks] mobile navigation was not detected'
            );
        }
    }, 250);
}

initialiseMobileTaskModule();
