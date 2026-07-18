import { sb } from './shared.js';
import logger from './utils/logger.js';

// v1.61.0
// Responsive Task Cards + Mobile Bottom Sheet + Desktop Action Drawer
// Multi-tenant: every database operation is scoped using currentTenantId.

// ─────────────────────────────────────────────────────────────────────────────
// COMMON HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CLOSED_TASK_STATUSES = new Set([
    'transferred',
    'cancelled'
]);

function tenantId() {
    return window.currentTenantId || null;
}

function currentUserId() {
    return window.currentUser?.id || null;
}

function escapeHtml(value = '') {
    return window.escapeHtml
        ? window.escapeHtml(String(value))
        : String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
}

function sentenceCase(value = '') {
    return window.toSentenceCase
        ? window.toSentenceCase(value)
        : value;
}

function showToast(
    message,
    icon = 'fa-solid fa-circle-info',
    className = 'text-blue-500'
) {
    if (window.showCenterToast) {
        window.showCenterToast(
            message,
            icon,
            className
        );
    } else {
        alert(message);
    }
}

function getDisplayName(profile) {
    const raw =
        profile?.full_name ||
        profile?.email?.split('@')[0] ||
        'Unknown';

    return sentenceCase(raw);
}

function isMobileTaskUI() {
    return window.matchMedia(
        '(max-width: 768px)'
    ).matches;
}

function getEffectiveAssigneeStatus(assignee) {
    if (!assignee) return 'pending_ack';

    /*
     * We avoid adding a new database status value.
     *
     * Acknowledged is represented as:
     * status = pending_ack
     * state = acknowledged
     * acked = true
     */
    if (
        assignee.status === 'pending_ack' &&
        (
            assignee.state === 'acknowledged' ||
            assignee.acked === true
        )
    ) {
        return 'acknowledged';
    }

    return assignee.status || 'pending_ack';
}

function isClosedAssignee(assignee) {
    return CLOSED_TASK_STATUSES.has(
        getEffectiveAssigneeStatus(assignee)
    );
}

function getStatusLabel(status) {
    const labels = {
        pending_ack: 'Awaiting Acknowledgement',
        acknowledged: 'Acknowledged',
        in_progress: 'In Progress',
        submitted: 'Waiting for Review',
        needs_review: 'Changes Required',
        accepted: 'Completed',
        transferred: 'Transferred',
        cancelled: 'Cancelled',
        mixed: 'Mixed Progress',
        empty: 'No Active Assignees'
    };

    return labels[status] || 'Unknown';
}

function getStatusIcon(status) {
    const icons = {
        pending_ack: 'fa-regular fa-clock',
        acknowledged: 'fa-solid fa-check',
        in_progress: 'fa-solid fa-spinner',
        submitted: 'fa-solid fa-paper-plane',
        needs_review: 'fa-solid fa-rotate-left',
        accepted: 'fa-solid fa-circle-check',
        transferred: 'fa-solid fa-arrow-right-arrow-left',
        cancelled: 'fa-solid fa-ban',
        mixed: 'fa-solid fa-users',
        empty: 'fa-solid fa-user-slash'
    };

    return icons[status] || 'fa-solid fa-circle';
}

function getStatusColour(status) {
    const colours = {
        pending_ack: {
            background: '#fff7ed',
            text: '#c2410c',
            border: '#fb923c'
        },
        acknowledged: {
            background: '#eff6ff',
            text: '#1d4ed8',
            border: '#60a5fa'
        },
        in_progress: {
            background: '#eef2ff',
            text: '#4338ca',
            border: '#818cf8'
        },
        submitted: {
            background: '#fdf4ff',
            text: '#a21caf',
            border: '#d946ef'
        },
        needs_review: {
            background: '#fef2f2',
            text: '#b91c1c',
            border: '#ef4444'
        },
        accepted: {
            background: '#f0fdf4',
            text: '#166534',
            border: '#22c55e'
        },
        transferred: {
            background: '#f8fafc',
            text: '#64748b',
            border: '#94a3b8'
        },
        cancelled: {
            background: '#f8fafc',
            text: '#475569',
            border: '#64748b'
        },
        mixed: {
            background: '#faf5ff',
            text: '#7e22ce',
            border: '#a855f7'
        },
        empty: {
            background: '#f8fafc',
            text: '#64748b',
            border: '#cbd5e1'
        }
    };

    return colours[status] || colours.empty;
}

function getTaskStatusSummary(assignees = []) {
    const active = assignees.filter(
        assignee => !isClosedAssignee(assignee)
    );

    const counts = {};

    for (const assignee of active) {
        const status =
            getEffectiveAssigneeStatus(assignee);

        counts[status] =
            (counts[status] || 0) + 1;
    }

    const total = active.length;

    const engaged = active.filter(
        assignee =>
            getEffectiveAssigneeStatus(assignee) !==
            'pending_ack'
    ).length;

    const completed = active.filter(
        assignee =>
            getEffectiveAssigneeStatus(assignee) ===
            'accepted'
    ).length;

    const uniqueStatuses = Object.keys(counts);

    let state = 'empty';

    if (total > 0) {
        state =
            uniqueStatuses.length === 1
                ? uniqueStatuses[0]
                : 'mixed';
    }

    return {
        active,
        counts,
        total,
        engaged,
        completed,
        engagementPercentage:
            total > 0
                ? Math.round(
                    (engaged / total) * 100
                )
                : 0,
        completionPercentage:
            total > 0
                ? Math.round(
                    (completed / total) * 100
                )
                : 0,
        state
    };
}

function formatTaskDeadline(deadline) {
    if (!deadline) {
        return {
            text: 'No deadline',
            overdue: false
        };
    }

    const displayDate = window.getISTDate
        ? window.getISTDate(deadline)
        : new Date(deadline).toLocaleDateString(
            'en-IN'
        );

    const dueDate = new Date(deadline);

    dueDate.setHours(
        23,
        59,
        59,
        999
    );

    return {
        text: displayDate,
        overdue: dueDate < new Date()
    };
}

function getPriorityData(priority = '') {
    const normalised =
        String(priority).toLowerCase();

    if (
        normalised === 'high' ||
        normalised === 'urgent'
    ) {
        return {
            label: 'HIGH',
            background: '#fef2f2',
            text: '#b91c1c'
        };
    }

    if (
        normalised === 'low'
    ) {
        return {
            label: 'LOW',
            background: '#f0fdf4',
            text: '#166534'
        };
    }

    return {
        label: 'NORMAL',
        background: '#eff6ff',
        text: '#1d4ed8'
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK UI STYLE
// ─────────────────────────────────────────────────────────────────────────────

function installTaskUIStyles() {
    if (
        document.getElementById(
            'niltask-task-ui-v2-styles'
        )
    ) {
        return;
    }

    const style =
        document.createElement('style');

    style.id = 'niltask-task-ui-v2-styles';

    style.textContent = `
        .nt-task-card {
            background: var(--bg-body, #ffffff);
            border: 2px solid var(--border-color, #dbe2ea);
            border-radius: 20px;
            margin: 0 0 24px;
            overflow: hidden;
            box-shadow:
                0 2px 4px rgba(15, 23, 42, .04),
                0 10px 30px rgba(15, 23, 42, .06);
            transition:
                transform .2s ease,
                box-shadow .2s ease;
        }

        .nt-task-card:hover {
            transform: translateY(-1px);
            box-shadow:
                0 3px 6px rgba(15, 23, 42, .05),
                0 14px 34px rgba(15, 23, 42, .09);
        }

        .nt-task-card-completed {
            opacity: .72;
        }

        .nt-task-accent {
            height: 5px;
            width: 100%;
        }

        .nt-task-body {
            padding: 16px;
        }

        .nt-task-header {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            justify-content: space-between;
        }

        .nt-task-title-wrap {
            min-width: 0;
            flex: 1;
        }

        .nt-task-title {
            margin: 0;
            color: var(--text-primary, #111827);
            font-size: 15px;
            line-height: 1.35;
            font-weight: 800;
            overflow-wrap: anywhere;
        }

        .nt-task-subtitle {
            margin-top: 5px;
            color: var(--text-secondary, #64748b);
            font-size: 11px;
            line-height: 1.45;
        }

        .nt-task-priority {
            flex-shrink: 0;
            border-radius: 999px;
            font-size: 9px;
            line-height: 1;
            font-weight: 900;
            letter-spacing: .08em;
            padding: 7px 9px;
        }

        .nt-task-status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 13px;
        }

        .nt-task-status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid;
            border-radius: 999px;
            padding: 7px 10px;
            font-size: 10px;
            font-weight: 800;
        }

        .nt-task-due {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 10px;
            color: var(--text-secondary, #64748b);
            font-weight: 700;
        }

        .nt-task-due-overdue {
            color: #b91c1c;
        }

        .nt-task-stat-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin-top: 14px;
        }

        .nt-task-stat {
            min-width: 0;
            border-radius: 13px;
            padding: 10px 7px;
            text-align: center;
            background: var(--bg-sidebar, #f8fafc);
            border: 1px solid var(--border-color, #eef2f7);
        }

        .nt-task-stat-value {
            display: block;
            color: var(--text-primary, #111827);
            font-size: 15px;
            line-height: 1;
            font-weight: 900;
        }

        .nt-task-stat-label {
            display: block;
            margin-top: 5px;
            color: var(--text-secondary, #64748b);
            font-size: 8px;
            line-height: 1.25;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .04em;
        }

        .nt-task-progress-wrap {
            margin-top: 14px;
        }

        .nt-task-progress-labels {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            color: var(--text-secondary, #64748b);
            font-size: 9px;
            font-weight: 700;
        }

        .nt-task-progress-track {
            position: relative;
            height: 7px;
            margin-top: 7px;
            border-radius: 999px;
            overflow: hidden;
            background: #e5e7eb;
        }

        .nt-task-progress-engaged,
        .nt-task-progress-complete {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            border-radius: inherit;
            transition: width .3s ease;
        }

        .nt-task-progress-engaged {
            background: #c4b5fd;
        }

        .nt-task-progress-complete {
            background: #22c55e;
        }

        .nt-task-action-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 15px;
        }

        .nt-task-button {
            appearance: none;
            border: 0;
            border-radius: 12px;
            min-height: 40px;
            padding: 9px 13px;
            cursor: pointer;
            font-size: 11px;
            line-height: 1.1;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            transition:
                transform .15s ease,
                opacity .15s ease,
                background .15s ease;
        }

        .nt-task-button:active {
            transform: scale(.98);
        }

        .nt-task-button-primary {
            flex: 1;
            color: #ffffff;
            background: var(--accent, #4f46e5);
        }

        .nt-task-button-secondary {
            color: var(--text-primary, #334155);
            background: var(--bg-sidebar, #f1f5f9);
            border: 1px solid var(--border-color, #e2e8f0);
        }

        .nt-task-button-icon {
            width: 40px;
            padding: 0;
        }

        .nt-task-expanded {
            display: none;
            border-top: 1px solid var(--border-color, #e5e7eb);
            padding: 15px 16px 17px;
            background: var(--bg-sidebar, #fafafa);
        }

        .nt-task-expanded.nt-open {
            display: block;
        }

        .nt-task-section {
            border-radius: 14px;
            background: var(--bg-body, #ffffff);
            border: 1px solid var(--border-color, #e5e7eb);
            padding: 12px;
            margin-bottom: 10px;
        }

        .nt-task-section:last-child {
            margin-bottom: 0;
        }

        .nt-task-section-title {
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 10px;
            color: var(--text-primary, #111827);
            font-size: 11px;
            font-weight: 900;
        }

        .nt-task-person-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .nt-task-person {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
        }

        .nt-task-avatar {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #ffffff;
            background: #6366f1;
            font-size: 10px;
            font-weight: 900;
        }

        .nt-task-person-name {
            min-width: 0;
            flex: 1;
            color: var(--text-primary, #111827);
            font-size: 11px;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .nt-task-person-status {
            flex-shrink: 0;
            border-radius: 999px;
            padding: 5px 7px;
            font-size: 8px;
            font-weight: 800;
        }

        .nt-task-trail {
            max-height: 280px;
            overflow-y: auto;
        }

        .nt-task-empty {
            padding: 28px 16px;
            color: var(--text-secondary, #64748b);
            text-align: center;
            font-size: 12px;
        }

        #ntTaskActionLayer {
            position: fixed;
            inset: 0;
            z-index: 12000;
            display: none;
        }

        #ntTaskActionLayer.nt-open {
            display: block;
        }

        .nt-action-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(15, 23, 42, .48);
            backdrop-filter: blur(3px);
        }

        .nt-action-panel {
            position: absolute;
            display: flex;
            flex-direction: column;
            background: var(--bg-body, #ffffff);
            box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
        }

        .nt-action-panel-header {
            display: flex;
            gap: 10px;
            align-items: center;
            justify-content: space-between;
            padding: 17px 18px;
            border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .nt-action-panel-title {
            color: var(--text-primary, #111827);
            font-size: 15px;
            font-weight: 900;
        }

        .nt-action-panel-close {
            border: 0;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            cursor: pointer;
            color: var(--text-primary, #334155);
            background: var(--bg-sidebar, #f1f5f9);
        }

        .nt-action-panel-body {
            flex: 1;
            overflow-y: auto;
            padding: 18px;
        }

        .nt-action-label {
            display: block;
            margin: 0 0 7px;
            color: var(--text-primary, #334155);
            font-size: 10px;
            font-weight: 800;
        }

        .nt-action-input {
            width: 100%;
            min-height: 43px;
            box-sizing: border-box;
            border-radius: 12px;
            border: 1px solid var(--border-color, #cbd5e1);
            padding: 10px 11px;
            color: var(--text-primary, #111827);
            background: var(--bg-body, #ffffff);
            outline: none;
            font-family: inherit;
            font-size: 12px;
        }

        textarea.nt-action-input {
            min-height: 110px;
            resize: vertical;
        }

        .nt-action-field {
            margin-bottom: 14px;
        }

        .nt-action-footer {
            display: flex;
            gap: 9px;
            padding: 14px 18px;
            border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .nt-action-footer .nt-task-button {
            flex: 1;
        }

        @media (max-width: 768px) {
            .nt-task-body {
                padding: 14px;
            }

            .nt-task-title {
                font-size: 14px;
            }

            .nt-task-stat-grid {
                grid-template-columns: repeat(3, minmax(0, 1fr));
            }

            .nt-action-panel {
                left: 0;
                right: 0;
                bottom: 0;
                max-height: 88vh;
                border-radius: 24px 24px 0 0;
                animation: ntTaskSheetIn .22s ease-out;
            }

            .nt-action-panel::before {
                content: '';
                display: block;
                width: 42px;
                height: 4px;
                margin: 9px auto -2px;
                border-radius: 999px;
                background: #cbd5e1;
            }

            @keyframes ntTaskSheetIn {
                from {
                    transform: translateY(100%);
                }

                to {
                    transform: translateY(0);
                }
            }
        }

        @media (min-width: 769px) {
            .nt-action-panel {
                top: 0;
                right: 0;
                bottom: 0;
                width: min(430px, 92vw);
                animation: ntTaskDrawerIn .2s ease-out;
            }

            @keyframes ntTaskDrawerIn {
                from {
                    transform: translateX(100%);
                }

                to {
                    transform: translateX(0);
                }
            }
        }
    `;

    document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// RICH TEXT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

window.taskFmtCmd = function(command, boxId) {
    const element =
        document.getElementById(
            'update-txt-' + boxId
        );

    if (!element) return;

    element.focus();
    document.execCommand(
        command,
        false,
        null
    );
};

window.taskFmtList = function(
    listType,
    boxId
) {
    const element =
        document.getElementById(
            'update-txt-' + boxId
        );

    if (!element) return;

    element.focus();

    document.execCommand(
        listType === 'ul'
            ? 'insertUnorderedList'
            : 'insertOrderedList',
        false,
        null
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

window.notifyUser = async function(
    userId,
    message,
    messageId = null,
    type = 'task',
    taskId = null
) {
    if (
        !tenantId() ||
        !userId ||
        !message
    ) {
        return;
    }

    try {
        const cleanMessage =
            window.stripHtml
                ? window.stripHtml(message)
                : message;

        const payload = {
            user_id: userId,
            tenant_id: tenantId(),
            message:
                cleanMessage.substring(0, 200),
            message_id: messageId || null,
            task_id: taskId || null,
            type,
            is_read: false
        };

        const { error } = await sb
            .from('notifications')
            .insert(payload);

        if (
            error &&
            error.code !== '23505'
        ) {
            throw error;
        }
    } catch (error) {
        logger?.warn?.(
            'Task notification failed',
            error
        );
    }
};

window.notifyGroupMembers = async function(
    roomId,
    senderId,
    message,
    messageId,
    type = 'message'
) {
    if (
        !tenantId() ||
        !roomId ||
        !senderId
    ) {
        return;
    }

    try {
        const { data, error } = await sb
            .from('messages')
            .select('sender_id')
            .eq('tenant_id', tenantId())
            .eq('room_id', roomId)
            .neq('sender_id', senderId);

        if (error) throw error;

        const memberIds = [
            ...new Set(
                (data || []).map(
                    item => item.sender_id
                )
            )
        ];

        for (const memberId of memberIds) {
            await window.notifyUser(
                memberId,
                message,
                messageId,
                type
            );
        }
    } catch (error) {
        logger?.warn?.(
            'Group task notification failed',
            error
        );
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TASK MODAL
// ─────────────────────────────────────────────────────────────────────────────

window.openTaskModal = async function(
    messageId,
    messageText
) {
    if (window.guardCreateTask?.()) {
        return;
    }

    window.currentMessageId = messageId;

    const temporaryElement =
        document.createElement('div');

    temporaryElement.innerHTML =
        messageText || '';

    const plainText = (
        temporaryElement.textContent ||
        temporaryElement.innerText ||
        ''
    ).trim();

    window.currentMessageTextRaw =
        plainText.substring(0, 60) +
        (
            plainText.length > 60
                ? '...'
                : ''
        );

    document
        .querySelectorAll('.msg-menu-dropdown')
        .forEach(element => element.remove());

    const modal =
        document.getElementById('taskModal');

    modal?.classList.remove('hidden');
    modal?.classList.add('flex');

    const titleInput =
        document.getElementById('taskTitle');

    if (titleInput) {
        titleInput.value = plainText;
    }

    const userList =
        document.getElementById(
            'assigneeCheckboxList'
        );

    const users = (
        window.globalUsersCache || []
    ).filter(
        user => user.id !== currentUserId()
    );

    if (userList) {
        userList.innerHTML = users
            .map(user => {
                const name =
                    getDisplayName(user);

                return `
                    <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 hover:bg-gray-100 rounded cursor-pointer transition-colors">
                        <input
                            type="checkbox"
                            value="${escapeHtml(user.id)}"
                            class="assignee-cb w-4 h-4 accent-[var(--accent)]"
                        >

                        <span class="assignee-name font-medium text-gray-700">
                            ${escapeHtml(name)}
                        </span>
                    </label>
                `;
            })
            .join('');
    }

    const searchInput =
        document.getElementById(
            'assigneeSearch'
        );

    if (searchInput) {
        searchInput.value = '';
    }
};

window.filterAssignees = function() {
    const searchTerm = (
        document.getElementById(
            'assigneeSearch'
        )?.value ||
        ''
    ).toLowerCase();

    document
        .querySelectorAll('.assignee-item')
        .forEach(element => {
            const name = (
                element.querySelector(
                    '.assignee-name'
                )?.innerText ||
                ''
            ).toLowerCase();

            element.style.display =
                name.includes(searchTerm)
                    ? 'flex'
                    : 'none';
        });
};

window.closeTaskModal = function() {
    const modal =
        document.getElementById('taskModal');

    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
};

window.saveTaskMultiAssignee =
async function() {
    if (!tenantId()) {
        showToast(
            'Organisation could not be identified.',
            'fa-solid fa-ban',
            'text-red-500'
        );

        return;
    }

    if (
        window.canCreateTask &&
        !window.canCreateTask()
    ) {
        showToast(
            'You do not have permission to create tasks.',
            'fa-solid fa-ban',
            'text-red-500'
        );

        return;
    }

    const title = (
        document.getElementById(
            'taskTitle'
        )?.value ||
        ''
    ).trim();

    const assigneeIds = Array.from(
        document.querySelectorAll(
            '.assignee-cb:checked'
        )
    ).map(
        checkbox => checkbox.value
    );

    if (
        !title ||
        assigneeIds.length === 0
    ) {
        showToast(
            'Enter a title and select assignees.',
            'fa-solid fa-triangle-exclamation',
            'text-red-500'
        );

        return;
    }

    const deadline =
        document.getElementById(
            'taskDeadline'
        )?.value ||
        null;

    const priority =
        document.getElementById(
            'taskPriority'
        )?.value ||
        'normal';

    const requireProof =
        Boolean(
            document.getElementById(
                'taskRequireProof'
            )?.checked
        );

    logger?.logAction?.(
        'createTask',
        {
            title,
            tenantId: tenantId(),
            assigneeCount:
                assigneeIds.length
        }
    );

    const { data: task, error } =
        await sb
            .from('tasks')
            .insert({
                original_message_id:
                    window.currentMessageId ||
                    null,
                title,
                assigned_by:
                    currentUserId(),
                tenant_id:
                    tenantId(),
                deadline,
                priority,
                require_proof:
                    requireProof,
                status: 'pending'
            })
            .select()
            .single();

    if (error || !task) {
        showToast(
            error?.message ||
            'Failed to create task.',
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    const assignmentRows =
        assigneeIds.map(
            assigneeId => ({
                task_id: task.id,
                assignee_id:
                    assigneeId,
                tenant_id:
                    tenantId(),
                status:
                    'pending_ack',
                state:
                    'pending',
                acked:
                    false
            })
        );

    const {
        error: assignmentError
    } = await sb
        .from('task_assignees')
        .insert(assignmentRows);

    if (assignmentError) {
        showToast(
            assignmentError.message,
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    await sb
        .from('task_trails')
        .insert({
            task_id: task.id,
            user_id: currentUserId(),
            tenant_id: tenantId(),
            action: 'CREATE',
            comment: 'Task Created'
        });

    for (const assigneeId of assigneeIds) {
        await window.notifyUser(
            assigneeId,
            `📋 New Task Assigned: ${title}`,
            task.original_message_id,
            'task',
            task.id
        );
    }

    window.closeTaskModal();

    showToast(
        'Task created successfully.',
        'fa-solid fa-check',
        'text-green-500'
    );

    await window.loadTasksForPanel();
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION LAYER
// ─────────────────────────────────────────────────────────────────────────────

function ensureTaskActionLayer() {
    installTaskUIStyles();

    let layer =
        document.getElementById(
            'ntTaskActionLayer'
        );

    if (layer) return layer;

    layer = document.createElement('div');

    layer.id = 'ntTaskActionLayer';

    layer.innerHTML = `
        <div
            class="nt-action-backdrop"
            onclick="window.closeTaskActionLayer()"
        ></div>

        <section
            class="nt-action-panel"
            role="dialog"
            aria-modal="true"
        >
            <div class="nt-action-panel-header">
                <div
                    id="ntTaskActionTitle"
                    class="nt-action-panel-title"
                >
                    Task Action
                </div>

                <button
                    class="nt-action-panel-close"
                    onclick="window.closeTaskActionLayer()"
                    aria-label="Close"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <div
                id="ntTaskActionBody"
                class="nt-action-panel-body"
            ></div>

            <div
                id="ntTaskActionFooter"
                class="nt-action-footer"
            ></div>
        </section>
    `;

    document.body.appendChild(layer);

    return layer;
}

window.closeTaskActionLayer = function() {
    const layer =
        document.getElementById(
            'ntTaskActionLayer'
        );

    layer?.classList.remove('nt-open');

    document.body.style.overflow = '';
};

function openTaskActionLayer({
    title,
    body,
    primaryLabel,
    primaryIcon = 'fa-solid fa-check',
    onPrimary
}) {
    const layer =
        ensureTaskActionLayer();

    document.getElementById(
        'ntTaskActionTitle'
    ).textContent = title;

    document.getElementById(
        'ntTaskActionBody'
    ).innerHTML = body;

    const footer =
        document.getElementById(
            'ntTaskActionFooter'
        );

    footer.innerHTML = `
        <button
            type="button"
            class="nt-task-button nt-task-button-secondary"
            onclick="window.closeTaskActionLayer()"
        >
            Cancel
        </button>

        <button
            type="button"
            id="ntTaskActionPrimary"
            class="nt-task-button nt-task-button-primary"
        >
            <i class="${primaryIcon}"></i>
            ${escapeHtml(primaryLabel)}
        </button>
    `;

    const primaryButton =
        document.getElementById(
            'ntTaskActionPrimary'
        );

    primaryButton.onclick =
        async function() {
            primaryButton.disabled = true;
            primaryButton.style.opacity = '.65';

            try {
                const success =
                    await onPrimary();

                if (success !== false) {
                    window.closeTaskActionLayer();
                }
            } finally {
                primaryButton.disabled = false;
                primaryButton.style.opacity = '';
            }
        };

    layer.classList.add('nt-open');

    document.body.style.overflow = 'hidden';
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function getTenantTask(taskId) {
    const { data, error } = await sb
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('tenant_id', tenantId())
        .single();

    if (error || !data) {
        showToast(
            'Task was not found in this organisation.',
            'fa-solid fa-lock',
            'text-red-500'
        );

        return null;
    }

    return data;
}

async function updateTenantAssignment(
    taskId,
    assigneeId,
    payload
) {
    const { data, error } = await sb
        .from('task_assignees')
        .update(payload)
        .eq('tenant_id', tenantId())
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
            'Could not update task assignment.',
            'fa-solid fa-lock',
            'text-red-500'
        );

        return false;
    }

    return true;
}

async function addTaskTrail(
    taskId,
    action,
    comment = ''
) {
    const { error } = await sb
        .from('task_trails')
        .insert({
            task_id: taskId,
            user_id: currentUserId(),
            tenant_id: tenantId(),
            action,
            comment
        });

    if (error) {
        logger?.warn?.(
            'Task trail insert failed',
            error
        );
    }
}

window.taskAction = async function(
    taskId,
    assigneeId,
    action,
    requireProof = false
) {
    if (
        !tenantId() ||
        !taskId ||
        !assigneeId
    ) {
        return;
    }

    const task =
        await getTenantTask(taskId);

    if (!task) return;

    const creatorId =
        task.assigned_by;

    if (action === 'ack') {
        const success =
            await updateTenantAssignment(
                taskId,
                assigneeId,
                {
                    status:
                        'pending_ack',
                    state:
                        'acknowledged',
                    acked:
                        true
                }
            );

        if (!success) return;

        await addTaskTrail(
            taskId,
            'ACKNOWLEDGE',
            'Acknowledged the task'
        );

        await window.notifyUser(
            creatorId,
            `✅ Task Acknowledged: ${task.title}`,
            task.original_message_id,
            'task',
            taskId
        );

        showToast(
            'Task acknowledged.',
            'fa-solid fa-check',
            'text-green-500'
        );
    }

    else if (action === 'start') {
        const success =
            await updateTenantAssignment(
                taskId,
                assigneeId,
                {
                    status:
                        'in_progress',
                    state:
                        'in_progress',
                    acked:
                        true
                }
            );

        if (!success) return;

        await addTaskTrail(
            taskId,
            'START',
            'Started work'
        );

        await window.notifyUser(
            creatorId,
            `▶️ Work Started: ${task.title}`,
            task.original_message_id,
            'task',
            taskId
        );

        showToast(
            'Work started.',
            'fa-solid fa-play',
            'text-blue-500'
        );
    }

    else if (action === 'submit') {
        if (requireProof) {
            const {
                data: proofRows
            } = await sb
                .from('task_trails')
                .select('id')
                .eq('tenant_id', tenantId())
                .eq('task_id', taskId)
                .eq('user_id', currentUserId())
                .eq('action', 'FILE')
                .limit(1);

            if (
                !proofRows ||
                proofRows.length === 0
            ) {
                showToast(
                    'Upload proof before submitting.',
                    'fa-solid fa-paperclip',
                    'text-red-500'
                );

                return;
            }
        }

        const success =
            await updateTenantAssignment(
                taskId,
                assigneeId,
                {
                    status:
                        'submitted',
                    state:
                        'submitted'
                }
            );

        if (!success) return;

        await addTaskTrail(
            taskId,
            'SUBMIT',
            'Submitted for Review'
        );

        await window.notifyUser(
            creatorId,
            `📬 Task Submitted for Review: ${task.title}`,
            task.original_message_id,
            'task',
            taskId
        );

        showToast(
            'Submitted for review.',
            'fa-solid fa-paper-plane',
            'text-green-500'
        );
    }

    else if (action === 'accept') {
        const success =
            await updateTenantAssignment(
                taskId,
                assigneeId,
                {
                    status:
                        'accepted',
                    state:
                        'accepted'
                }
            );

        if (!success) return;

        await addTaskTrail(
            taskId,
            'ACCEPT',
            'Completion accepted'
        );

        await window.notifyUser(
            assigneeId,
            `🎉 Task Accepted: ${task.title}`,
            task.original_message_id,
            'task',
            taskId
        );

        showToast(
            'Completion accepted.',
            'fa-solid fa-check',
            'text-green-500'
        );
    }

    await window.loadTasksForPanel();
};

window.openTaskUpdateAction = function(
    taskId,
    assigneeId
) {
    openTaskActionLayer({
        title: 'Progress Update',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">
                    What progress has been made?
                </label>

                <textarea
                    id="ntTaskUpdateText"
                    class="nt-action-input"
                    placeholder="Write a clear progress update..."
                ></textarea>
            </div>
        `,
        primaryLabel: 'Post Update',
        primaryIcon:
            'fa-solid fa-paper-plane',
        onPrimary: async () => {
            const comment = (
                document.getElementById(
                    'ntTaskUpdateText'
                )?.value ||
                ''
            ).trim();

            if (!comment) {
                showToast(
                    'Progress update cannot be empty.',
                    'fa-solid fa-triangle-exclamation',
                    'text-red-500'
                );

                return false;
            }

            const task =
                await getTenantTask(taskId);

            if (!task) return false;

            await addTaskTrail(
                taskId,
                'UPDATE',
                comment
            );

            await window.notifyUser(
                task.assigned_by,
                `💬 Task Update: ${task.title} — ${comment.substring(0, 60)}`,
                task.original_message_id,
                'task',
                taskId
            );

            showToast(
                'Progress update posted.',
                'fa-solid fa-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();

            return true;
        }
    });
};

window.openTaskUploadAction = function(
    taskId,
    assigneeId
) {
    openTaskActionLayer({
        title: 'Upload Proof',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">
                    Select file
                </label>

                <input
                    id="ntTaskUploadFile"
                    class="nt-action-input"
                    type="file"
                >
            </div>

            <div
                style="
                    color:var(--text-secondary,#64748b);
                    font-size:10px;
                    line-height:1.6;
                "
            >
                The file will be stored in a tenant-specific
                and task-specific storage path.
            </div>
        `,
        primaryLabel: 'Upload',
        primaryIcon:
            'fa-solid fa-upload',
        onPrimary: async () => {
            const file =
                document.getElementById(
                    'ntTaskUploadFile'
                )?.files?.[0];

            if (!file) {
                showToast(
                    'Select a file.',
                    'fa-solid fa-paperclip',
                    'text-red-500'
                );

                return false;
            }

            const safeName =
                file.name.replace(
                    /[^a-zA-Z0-9.\-_]/g,
                    '_'
                );

            const filePath =
                `tasks/${tenantId()}/${taskId}/${Date.now()}_${safeName}`;

            const { error } = await sb
                .storage
                .from('task-proofs')
                .upload(
                    filePath,
                    file
                );

            if (error) {
                showToast(
                    error.message,
                    'fa-solid fa-times',
                    'text-red-500'
                );

                return false;
            }

            await addTaskTrail(
                taskId,
                'FILE',
                `${file.name}|${filePath}`
            );

            const task =
                await getTenantTask(taskId);

            if (task) {
                await window.notifyUser(
                    task.assigned_by,
                    `📎 File uploaded on task: ${task.title}`,
                    task.original_message_id,
                    'task',
                    taskId
                );
            }

            showToast(
                'File uploaded successfully.',
                'fa-solid fa-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();

            return true;
        }
    });
};

window.openTaskDelegateAction =
function(
    taskId,
    assigneeId
) {
    const options = (
        window.globalUsersCache || []
    )
        .filter(user =>
            user.id !== currentUserId()
        )
        .map(user => `
            <option value="${escapeHtml(user.id)}">
                ${escapeHtml(getDisplayName(user))}
            </option>
        `)
        .join('');

    openTaskActionLayer({
        title: 'Delegate Task',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">
                    Delegate to
                </label>

                <select
                    id="ntTaskDelegateUser"
                    class="nt-action-input"
                >
                    <option value="">
                        Select staff member
                    </option>

                    ${options}
                </select>
            </div>

            <div class="nt-action-field">
                <label class="nt-action-label">
                    Comment
                </label>

                <textarea
                    id="ntTaskDelegateComment"
                    class="nt-action-input"
                    placeholder="Explain what the delegate should do..."
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
                You remain accountable. The selected person
                receives a separate pending assignment.
            </div>
        `,
        primaryLabel: 'Delegate',
        primaryIcon:
            'fa-solid fa-user-plus',
        onPrimary: async () => {
            const newAssigneeId =
                document.getElementById(
                    'ntTaskDelegateUser'
                )?.value;

            const comment = (
                document.getElementById(
                    'ntTaskDelegateComment'
                )?.value ||
                ''
            ).trim();

            if (!newAssigneeId) {
                showToast(
                    'Select a staff member.',
                    'fa-solid fa-user',
                    'text-red-500'
                );

                return false;
            }

            const {
                data: existing
            } = await sb
                .from('task_assignees')
                .select('assignee_id')
                .eq('tenant_id', tenantId())
                .eq('task_id', taskId)
                .eq(
                    'assignee_id',
                    newAssigneeId
                )
                .maybeSingle();

            if (existing) {
                showToast(
                    'This person is already assigned.',
                    'fa-solid fa-user-check',
                    'text-orange-500'
                );

                return false;
            }

            const { error } = await sb
                .from('task_assignees')
                .insert({
                    task_id: taskId,
                    assignee_id:
                        newAssigneeId,
                    tenant_id:
                        tenantId(),
                    status:
                        'pending_ack',
                    state:
                        'pending',
                    acked:
                        false
                });

            if (error) {
                showToast(
                    error.message,
                    'fa-solid fa-times',
                    'text-red-500'
                );

                return false;
            }

            await addTaskTrail(
                taskId,
                'DELEGATE',
                comment ||
                `Delegated to ${newAssigneeId}`
            );

            const task =
                await getTenantTask(taskId);

            if (task) {
                await window.notifyUser(
                    newAssigneeId,
                    `👤 Task Delegated to you: ${task.title}`,
                    task.original_message_id,
                    'task',
                    taskId
                );

                await window.notifyUser(
                    task.assigned_by,
                    `↗️ Task Delegated: ${task.title}`,
                    task.original_message_id,
                    'task',
                    taskId
                );
            }

            showToast(
                'Task delegated.',
                'fa-solid fa-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();

            return true;
        }
    });
};

window.openTaskReturnAction =
function(
    taskId,
    assigneeId
) {
    openTaskActionLayer({
        title: 'Return for Changes',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">
                    Feedback
                </label>

                <textarea
                    id="ntTaskReturnFeedback"
                    class="nt-action-input"
                    placeholder="Clearly explain the required changes..."
                ></textarea>
            </div>
        `,
        primaryLabel:
            'Return Task',
        primaryIcon:
            'fa-solid fa-rotate-left',
        onPrimary: async () => {
            const feedback = (
                document.getElementById(
                    'ntTaskReturnFeedback'
                )?.value ||
                ''
            ).trim();

            if (!feedback) {
                showToast(
                    'Feedback is required.',
                    'fa-solid fa-comment',
                    'text-red-500'
                );

                return false;
            }

            const success =
                await updateTenantAssignment(
                    taskId,
                    assigneeId,
                    {
                        status:
                            'needs_review',
                        state:
                            'needs_review'
                    }
                );

            if (!success) return false;

            await addTaskTrail(
                taskId,
                'RETURN',
                feedback
            );

            const task =
                await getTenantTask(taskId);

            if (task) {
                await window.notifyUser(
                    assigneeId,
                    `🔄 Changes Required: ${task.title} — ${feedback.substring(0, 60)}`,
                    task.original_message_id,
                    'task',
                    taskId
                );
            }

            showToast(
                'Task returned for changes.',
                'fa-solid fa-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();

            return true;
        }
    });
};

window.openTaskTransferAction =
function(
    taskId,
    assigneeId
) {
    const options = (
        window.globalUsersCache || []
    )
        .filter(user =>
            user.id !== assigneeId
        )
        .map(user => `
            <option value="${escapeHtml(user.id)}">
                ${escapeHtml(getDisplayName(user))}
            </option>
        `)
        .join('');

    openTaskActionLayer({
        title: 'Transfer Task',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">
                    Transfer to
                </label>

                <select
                    id="ntTaskTransferUser"
                    class="nt-action-input"
                >
                    <option value="">
                        Select replacement
                    </option>

                    ${options}
                </select>
            </div>

            <div class="nt-action-field">
                <label class="nt-action-label">
                    Reason
                </label>

                <textarea
                    id="ntTaskTransferReason"
                    class="nt-action-input"
                    placeholder="Explain why the assignment is being transferred..."
                ></textarea>
            </div>
        `,
        primaryLabel:
            'Transfer',
        primaryIcon:
            'fa-solid fa-arrow-right-arrow-left',
        onPrimary: async () => {
            const replacementId =
                document.getElementById(
                    'ntTaskTransferUser'
                )?.value;

            const reason = (
                document.getElementById(
                    'ntTaskTransferReason'
                )?.value ||
                ''
            ).trim();

            if (!replacementId) {
                showToast(
                    'Select a replacement.',
                    'fa-solid fa-user',
                    'text-red-500'
                );

                return false;
            }

            if (!reason) {
                showToast(
                    'Transfer reason is required.',
                    'fa-solid fa-comment',
                    'text-red-500'
                );

                return false;
            }

            const {
                data: existing
            } = await sb
                .from('task_assignees')
                .select('assignee_id')
                .eq('tenant_id', tenantId())
                .eq('task_id', taskId)
                .eq(
                    'assignee_id',
                    replacementId
                )
                .maybeSingle();

            if (existing) {
                showToast(
                    'Replacement is already assigned.',
                    'fa-solid fa-user-check',
                    'text-orange-500'
                );

                return false;
            }

            const {
                error: closeError
            } = await sb
                .from('task_assignees')
                .update({
                    status:
                        'transferred',
                    state:
                        'closed'
                })
                .eq('tenant_id', tenantId())
                .eq('task_id', taskId)
                .eq('assignee_id', assigneeId);

            if (closeError) {
                showToast(
                    closeError.message,
                    'fa-solid fa-times',
                    'text-red-500'
                );

                return false;
            }

            const {
                error: insertError
            } = await sb
                .from('task_assignees')
                .insert({
                    task_id: taskId,
                    assignee_id:
                        replacementId,
                    tenant_id:
                        tenantId(),
                    status:
                        'pending_ack',
                    state:
                        'pending',
                    acked:
                        false
                });

            if (insertError) {
                showToast(
                    insertError.message,
                    'fa-solid fa-times',
                    'text-red-500'
                );

                return false;
            }

            await addTaskTrail(
                taskId,
                'TRANSFER',
                reason
            );

            const task =
                await getTenantTask(taskId);

            if (task) {
                await window.notifyUser(
                    replacementId,
                    `🔁 Task Transferred to you: ${task.title}`,
                    task.original_message_id,
                    'task',
                    taskId
                );

                await window.notifyUser(
                    assigneeId,
                    `🔁 Your task was transferred: ${task.title}`,
                    task.original_message_id,
                    'task',
                    taskId
                );
            }

            showToast(
                'Task transferred.',
                'fa-solid fa-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();

            return true;
        }
    });
};


window.sendTaskReminder = async function(taskId, assigneeId) {
    const { error } = await sb.rpc('send_task_reminder', {
        p_task_id: taskId,
        p_assignee_id: assigneeId,
        p_tenant_id: tenantId(),
        p_sender_id: currentUserId()
    });

    if (error) {
        showToast(
            `Reminder failed: ${error.message}`,
            'fa-solid fa-circle-xmark',
            'text-red-500'
        );
        return false;
    }

    showToast(
        `Reminder sent to ${getDisplayName(
            (window.globalUsersCache || []).find(user => user.id === assigneeId)
        )}.`,
        'fa-solid fa-bell',
        'text-green-500'
    );

    await window.loadTasksForPanel();
    return true;
};

window.remindAllTaskPending = async function(taskId) {
    const { data: assignments, error } = await sb
        .from('task_assignees')
        .select('assignee_id,status,state,acked')
        .eq('tenant_id', tenantId())
        .eq('task_id', taskId);

    if (error) {
        showToast(error.message, 'fa-solid fa-times', 'text-red-500');
        return;
    }

    const pending = (assignments || []).filter(assignment => {
        const status = getEffectiveAssigneeStatus(assignment);
        return !CLOSED_TASK_STATUSES.has(status) && status !== 'accepted';
    });

    if (!pending.length) {
        showToast('No pending assignees.', 'fa-solid fa-circle-info', 'text-blue-500');
        return;
    }

    let sent = 0;
    for (const assignment of pending) {
        if (await window.sendTaskReminder(taskId, assignment.assignee_id)) {
            sent += 1;
        }
    }

    showToast(
        `Reminder sent to ${sent} assignee(s).`,
        'fa-solid fa-bell',
        'text-green-500'
    );
};

window.openTaskExtensionRequest = function(taskId, assigneeId) {
    openTaskActionLayer({
        title: 'Request Deadline Extension',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">Requested deadline</label>
                <input id="ntRequestedDeadline" class="nt-action-input" type="date">
            </div>
            <div class="nt-action-field">
                <label class="nt-action-label">Reason</label>
                <textarea id="ntExtensionReason" class="nt-action-input"
                    placeholder="Explain why more time is required..."></textarea>
            </div>
        `,
        primaryLabel: 'Send Request',
        primaryIcon: 'fa-solid fa-calendar-plus',
        onPrimary: async () => {
            const requestedDate =
                document.getElementById('ntRequestedDeadline')?.value;
            const reason =
                (document.getElementById('ntExtensionReason')?.value || '').trim();

            if (!requestedDate || !reason) {
                showToast(
                    'Requested date and reason are required.',
                    'fa-solid fa-triangle-exclamation',
                    'text-orange-500'
                );
                return false;
            }

            await addTaskTrail(
                taskId,
                'EXTENSION_REQUEST',
                `${getDisplayName(window.currentUser)} requested ${
                    new Date(requestedDate).toLocaleDateString('en-IN')
                } — ${reason}`
            );

            showToast(
                'Deadline-extension request sent.',
                'fa-solid fa-calendar-plus',
                'text-green-500'
            );

            await window.loadTasksForPanel();
            return true;
        }
    });
};

window.openTaskDeadlineAction = function(taskId) {
    openTaskActionLayer({
        title: 'Change Deadline',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">New deadline</label>
                <input id="ntNewDeadline" class="nt-action-input" type="date">
            </div>
            <div class="nt-action-field">
                <label class="nt-action-label">Reason</label>
                <textarea id="ntDeadlineReason" class="nt-action-input"
                    placeholder="Explain why the deadline is changing..."></textarea>
            </div>
        `,
        primaryLabel: 'Update Deadline',
        primaryIcon: 'fa-solid fa-calendar-check',
        onPrimary: async () => {
            const deadline = document.getElementById('ntNewDeadline')?.value;
            const reason =
                (document.getElementById('ntDeadlineReason')?.value || '').trim();

            if (!deadline || !reason) {
                showToast(
                    'New deadline and reason are required.',
                    'fa-solid fa-triangle-exclamation',
                    'text-orange-500'
                );
                return false;
            }

            const { error } = await sb
                .from('tasks')
                .update({ deadline })
                .eq('tenant_id', tenantId())
                .eq('id', taskId)
                .eq('assigned_by', currentUserId());

            if (error) {
                showToast(error.message, 'fa-solid fa-times', 'text-red-500');
                return false;
            }

            await addTaskTrail(
                taskId,
                'DEADLINE',
                `Deadline changed to ${
                    new Date(deadline).toLocaleDateString('en-IN')
                } — ${reason}`
            );

            showToast(
                'Deadline updated.',
                'fa-solid fa-calendar-check',
                'text-green-500'
            );

            await window.loadTasksForPanel();
            return true;
        }
    });
};

window.openTaskCancelAction = function(taskId) {
    openTaskActionLayer({
        title: 'Cancel Task',
        body: `
            <div class="nt-action-field">
                <label class="nt-action-label">Cancellation reason</label>
                <textarea id="ntCancelReason" class="nt-action-input"
                    placeholder="Explain why this task is being cancelled..."></textarea>
            </div>
            <div style="padding:12px;border-radius:12px;background:#fef2f2;color:#991b1b;font-size:11px;line-height:1.55;">
                Cancellation keeps the task and complete audit history.
            </div>
        `,
        primaryLabel: 'Cancel Task',
        primaryIcon: 'fa-solid fa-ban',
        onPrimary: async () => {
            const reason =
                (document.getElementById('ntCancelReason')?.value || '').trim();

            if (!reason) {
                showToast(
                    'Cancellation reason is required.',
                    'fa-solid fa-triangle-exclamation',
                    'text-orange-500'
                );
                return false;
            }

            const task = await getTenantTask(taskId);
            if (!task) return false;

            if (task.assigned_by !== currentUserId()) {
                showToast(
                    'Only the task creator can cancel this task.',
                    'fa-solid fa-lock',
                    'text-red-500'
                );
                return false;
            }

            const { error: taskError } = await sb
                .from('tasks')
                .update({ status: 'cancelled' })
                .eq('tenant_id', tenantId())
                .eq('id', taskId)
                .eq('assigned_by', currentUserId());

            if (taskError) {
                showToast(taskError.message, 'fa-solid fa-times', 'text-red-500');
                return false;
            }

            const { error: assignmentError } = await sb
                .from('task_assignees')
                .update({ status: 'cancelled', state: 'closed' })
                .eq('tenant_id', tenantId())
                .eq('task_id', taskId)
                .not('status', 'in', '("accepted","transferred","cancelled")');

            if (assignmentError) {
                showToast(
                    assignmentError.message,
                    'fa-solid fa-times',
                    'text-red-500'
                );
                return false;
            }

            await addTaskTrail(taskId, 'CANCEL', reason);

            showToast(
                'Task cancelled. History has been preserved.',
                'fa-solid fa-ban',
                'text-green-500'
            );

            await window.loadTasksForPanel();
            return true;
        }
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK CARD INTERACTIONS
// ─────────────────────────────────────────────────────────────────────────────

window.toggleTaskDetails =
function(taskId) {
    const details =
        document.getElementById(
            `nt-task-details-${taskId}`
        );

    const icon =
        document.getElementById(
            `nt-task-details-icon-${taskId}`
        );

    if (!details) return;

    const isOpen =
        details.classList.toggle('nt-open');

    if (icon) {
        icon.className =
            isOpen
                ? 'fa-solid fa-chevron-up'
                : 'fa-solid fa-chevron-down';
    }
};

window.openTaskOriginalMessage = async function(taskId) {
    if (!taskId || !tenantId()) return;

    const { data: task, error: taskError } = await sb
        .from('tasks')
        .select('id,original_message_id,tenant_id')
        .eq('tenant_id', tenantId())
        .eq('id', taskId)
        .single();

    if (taskError || !task?.original_message_id) {
        showToast(
            'No original message is linked to this task.',
            'fa-solid fa-message',
            'text-orange-500'
        );
        return;
    }

    const { data: message, error: messageError } = await sb
        .from('messages')
        .select('id,room_id,sender_id,text,tenant_id')
        .eq('tenant_id', tenantId())
        .eq('id', task.original_message_id)
        .maybeSingle();

    if (messageError || !message) {
        showToast(
            'The original message is unavailable or was deleted.',
            'fa-solid fa-message',
            'text-orange-500'
        );
        return;
    }

    const roomId = message.room_id;

    if (
        (window.innerWidth <= 768 || window.IS_NATIVE) &&
        typeof window._navTo === 'function'
    ) {
        const isDirectMessage = String(roomId).startsWith('dm_');

        if (isDirectMessage) {
            const otherId = String(roomId)
                .replace('dm_', '')
                .split('_')
                .find(id => id !== currentUserId());

            const otherUser = (window.globalUsersCache || [])
                .find(user => user.id === otherId);

            await window._navTo('dm', {
                room: roomId,
                uid: otherId || '',
                name: otherUser?.full_name || otherUser?.email || 'Direct Message',
                scrollTo: message.id
            });
        } else {
            const group = typeof window._findGroup === 'function'
                ? window._findGroup(roomId)
                : null;

            await window._navTo('groupChat', {
                room: roomId,
                name: group?.name || roomId,
                color: group?.col || group?.color || 'var(--accent)',
                scrollTo: message.id
            });
        }

        setTimeout(() => {
            const row = document.getElementById(`row-${message.id}`)
                || document.getElementById(`msg-${message.id}`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 700);
        return;
    }

    if (typeof window.openRoomById === 'function') {
        await window.openRoomById(roomId, message.id);
        return;
    }

    if (typeof window.openChatRoom === 'function') {
        await window.openChatRoom(roomId);
        setTimeout(() => {
            const row = document.getElementById(`msg-${message.id}`)
                || document.getElementById(`row-${message.id}`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 700);
        return;
    }

    window.location.hash =
        `room=${encodeURIComponent(roomId)}&message=${encodeURIComponent(message.id)}`;

    setTimeout(() => {
        const row = document.getElementById(`msg-${message.id}`)
            || document.getElementById(`row-${message.id}`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.classList.add('message-highlight');
        setTimeout(() => row?.classList.remove('message-highlight'), 3000);
    }, 700);
};

// Backward-compatible alias.
window.openOriginalTaskMessage = async function(taskOrMessageId) {
    const directTask = document.querySelector(
        `[data-task-id="${CSS.escape(String(taskOrMessageId || ''))}"]`
    );

    if (directTask) {
        await window.openTaskOriginalMessage(taskOrMessageId);
        return;
    }

    const { data: task } = await sb
        .from('tasks')
        .select('id')
        .eq('tenant_id', tenantId())
        .eq('original_message_id', taskOrMessageId)
        .maybeSingle();

    if (task?.id) {
        await window.openTaskOriginalMessage(task.id);
        return;
    }

    showToast(
        'The linked task or original message could not be resolved.',
        'fa-solid fa-message',
        'text-orange-500'
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF REPORT
// ─────────────────────────────────────────────────────────────────────────────

window.downloadTaskPDF =
async function(taskId) {
    if (!tenantId()) return;

    showToast(
        'Generating PDF report...',
        'fa-solid fa-spinner fa-spin',
        'text-blue-500'
    );

    const { data: task, error } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId())
        .eq('id', taskId)
        .single();

    if (error || !task) {
        showToast(
            'Task not found.',
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    const { data: trails } = await sb
        .from('task_trails')
        .select(`
            *,
            profiles(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId())
        .eq('task_id', taskId)
        .order('created_at', {
            ascending: true
        });

    const wrapper =
        document.createElement('div');

    wrapper.style.cssText = `
        padding:30px;
        font-family:Inter,sans-serif;
        color:#111827;
        background:#ffffff;
    `;

    const rows = (trails || [])
        .map(trail => {
            const user =
                getDisplayName(
                    trail.profiles
                );

            const time =
                window.getISTTime
                    ? window.getISTTime(
                        trail.created_at
                    )
                    : '';

            const date =
                window.getISTDate
                    ? window.getISTDate(
                        trail.created_at
                    )
                    : '';

            let comment =
                trail.comment || '';

            if (
                trail.action === 'FILE' &&
                comment.includes('|')
            ) {
                comment =
                    comment.split('|')[0];
            }

            return `
                <tr>
                    <td style="padding:9px;border:1px solid #d1d5db;">
                        ${escapeHtml(date)}
                        <br>
                        ${escapeHtml(time)}
                    </td>

                    <td style="padding:9px;border:1px solid #d1d5db;">
                        ${escapeHtml(user)}
                    </td>

                    <td style="padding:9px;border:1px solid #d1d5db;">
                        <b>${escapeHtml(trail.action || '')}</b>
                        ${
                            comment
                                ? ` — ${escapeHtml(comment)}`
                                : ''
                        }
                    </td>
                </tr>
            `;
        })
        .join('');

    wrapper.innerHTML = `
        <h2 style="color:#312e81;margin:0 0 16px;">
            Noted For Action — Task Report
        </h2>

        <h3>
            ${escapeHtml(task.title)}
        </h3>

        <p>
            <b>Created by:</b>
            ${escapeHtml(
                getDisplayName(
                    task.creator
                )
            )}
        </p>

        <p>
            <b>Tenant:</b>
            ${escapeHtml(tenantId())}
        </p>

        <p>
            <b>Deadline:</b>
            ${
                task.deadline
                    ? escapeHtml(
                        formatTaskDeadline(
                            task.deadline
                        ).text
                    )
                    : 'None'
            }
        </p>

        <table
            style="
                width:100%;
                border-collapse:collapse;
                margin-top:18px;
                font-size:11px;
            "
        >
            <thead>
                <tr style="background:#f1f5f9;">
                    <th style="padding:9px;border:1px solid #d1d5db;text-align:left;">
                        Date
                    </th>

                    <th style="padding:9px;border:1px solid #d1d5db;text-align:left;">
                        User
                    </th>

                    <th style="padding:9px;border:1px solid #d1d5db;text-align:left;">
                        Action
                    </th>
                </tr>
            </thead>

            <tbody>
                ${rows}
            </tbody>
        </table>
    `;

    if (!window.html2pdf) {
        await new Promise(
            (resolve, reject) => {
                const script =
                    document.createElement(
                        'script'
                    );

                script.src =
                    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

                script.onload = resolve;
                script.onerror = reject;

                document.head.appendChild(
                    script
                );
            }
        );
    }

    await window.html2pdf()
        .from(wrapper)
        .set({
            margin: 10,
            filename:
                `Task_Audit_${taskId}.pdf`,
            html2canvas: {
                scale: 2,
                useCORS: true
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            }
        })
        .save();

    showToast(
        'PDF downloaded.',
        'fa-solid fa-file-pdf',
        'text-green-500'
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function renderAssigneeStatusPill(status) {
    const colour =
        getStatusColour(status);

    return `
        <span
            class="nt-task-person-status"
            style="
                color:${colour.text};
                background:${colour.background};
            "
        >
            ${escapeHtml(getStatusLabel(status))}
        </span>
    `;
}

function renderAssigneeList(
    assignees
) {
    if (!assignees.length) {
        return `
            <div
                style="
                    color:var(--text-secondary,#64748b);
                    font-size:11px;
                "
            >
                No assignees.
            </div>
        `;
    }

    return `
        <div class="nt-task-person-list">
            ${assignees
                .map(assignee => {
                    const name =
                        getDisplayName(
                            assignee.profiles
                        );

                    const initial =
                        name
                            .charAt(0)
                            .toUpperCase();

                    const status =
                        getEffectiveAssigneeStatus(
                            assignee
                        );

                    return `
                        <div class="nt-task-person">
                            <div class="nt-task-avatar">
                                ${escapeHtml(initial)}
                            </div>

                            <div class="nt-task-person-name">
                                ${escapeHtml(name)}
                            </div>

                            ${renderAssigneeStatusPill(status)}
                        </div>
                    `;
                })
                .join('')}
        </div>
    `;
}

function renderTaskTrail(trails) {
    if (window.renderProfessionalTrail) {
        return window.renderProfessionalTrail(
            trails
        );
    }

    if (!trails.length) {
        return `
            <div
                style="
                    color:var(--text-secondary,#64748b);
                    font-size:11px;
                "
            >
                No activity yet.
            </div>
        `;
    }

    return trails
        .map((trail, index) => {
            const user =
                getDisplayName(
                    trail.profiles
                );

            const time =
                window.getISTTime
                    ? window.getISTTime(
                        trail.created_at
                    )
                    : '';

            let content = '';

            if (trail.action === 'FILE') {
                const parts = (
                    trail.comment || ''
                ).split('|');

                const fileName =
                    parts[0] ||
                    'Attachment';

                const filePath =
                    parts[1] ||
                    '';

                content = `
                    <button
                        type="button"
                        onclick="window.openSecureFile('${escapeHtml(filePath)}')"
                        style="
                            border:0;
                            padding:0;
                            color:#2563eb;
                            background:none;
                            cursor:pointer;
                            font-size:11px;
                            text-decoration:underline;
                        "
                    >
                        ${escapeHtml(fileName)}
                    </button>
                `;
            } else {
                content = `
                    <b>
                        ${escapeHtml(trail.action || '')}
                    </b>

                    ${
                        trail.comment
                            ? ` — ${escapeHtml(trail.comment)}`
                            : ''
                    }
                `;
            }

            return `
                <div
                    style="
                        display:flex;
                        gap:9px;
                        margin-bottom:11px;
                    "
                >
                    <div
                        style="
                            width:25px;
                            height:25px;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            flex-shrink:0;
                            background:#eef2ff;
                            color:#4338ca;
                            font-size:9px;
                            font-weight:900;
                        "
                    >
                        ${escapeHtml(
                            String(
                                trails.length -
                                index
                            )
                        )}
                    </div>

                    <div style="min-width:0;">
                        <div
                            style="
                                color:var(--text-primary,#111827);
                                font-size:10px;
                                font-weight:800;
                            "
                        >
                            ${escapeHtml(user)}
                            <span
                                style="
                                    color:var(--text-secondary,#94a3b8);
                                    font-weight:600;
                                "
                            >
                                · ${escapeHtml(time)}
                            </span>
                        </div>

                        <div
                            style="
                                margin-top:3px;
                                color:var(--text-secondary,#475569);
                                font-size:10px;
                                line-height:1.45;
                            "
                        >
                            ${content}
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderPrimaryAction({
    task,
    myAssignment,
    isCreator,
    submittedAssignments
}) {
    if (myAssignment) {
        const status =
            getEffectiveAssigneeStatus(
                myAssignment
            );

        if (status === 'pending_ack') {
            return `
                <button
                    class="nt-task-button nt-task-button-primary"
                    onclick="window.taskAction('${task.id}','${currentUserId()}','ack')"
                >
                    <i class="fa-solid fa-check"></i>
                    Acknowledge
                </button>
            `;
        }

        if (status === 'acknowledged') {
            return `
                <button
                    class="nt-task-button nt-task-button-primary"
                    onclick="window.taskAction('${task.id}','${currentUserId()}','start')"
                >
                    <i class="fa-solid fa-play"></i>
                    Start Work
                </button>
            `;
        }

        if (
            status === 'in_progress' ||
            status === 'needs_review'
        ) {
            return `
                <button
                    class="nt-task-button nt-task-button-primary"
                    onclick="window.taskAction('${task.id}','${currentUserId()}','submit',${Boolean(task.require_proof)})"
                >
                    <i class="fa-solid fa-paper-plane"></i>
                    ${
                        status === 'needs_review'
                            ? 'Resubmit'
                            : 'Submit for Review'
                    }
                </button>
            `;
        }

        if (status === 'submitted') {
            return `
                <button
                    class="nt-task-button nt-task-button-secondary"
                    disabled
                    style="flex:1;opacity:.72;cursor:default;"
                >
                    <i class="fa-regular fa-clock"></i>
                    Waiting for Review
                </button>
            `;
        }

        if (status === 'accepted') {
            return `
                <button
                    class="nt-task-button nt-task-button-secondary"
                    onclick="window.toggleTaskDetails('${task.id}')"
                    style="flex:1;"
                >
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    View Timeline
                </button>
            `;
        }
    }

    if (
        isCreator &&
        submittedAssignments.length > 0
    ) {
        return `
            <button
                class="nt-task-button nt-task-button-primary"
                onclick="window.toggleTaskDetails('${task.id}')"
            >
                <i class="fa-solid fa-clipboard-check"></i>
                Review ${submittedAssignments.length}
            </button>
        `;
    }

    return `
        <button
            class="nt-task-button nt-task-button-secondary"
            onclick="window.toggleTaskDetails('${task.id}')"
            style="flex:1;"
        >
            <i class="fa-solid fa-eye"></i>
            View Task
        </button>
    `;
}

function renderSecondaryActionMenu(
    task,
    myAssignment
) {
    if (!myAssignment) return '';

    const status = getEffectiveAssigneeStatus(myAssignment);

    if (
        status === 'accepted' ||
        status === 'submitted' ||
        status === 'transferred' ||
        status === 'cancelled'
    ) {
        return '';
    }

    const workingActions =
        status === 'in_progress' ||
        status === 'needs_review'
            ? `
                <button
                    type="button"
                    class="nt-task-button nt-task-button-secondary nt-task-button-icon"
                    onclick="window.openTaskUpdateAction('${task.id}','${currentUserId()}')"
                    title="Progress Update"
                >
                    <i class="fa-solid fa-comment-dots"></i>
                </button>

                <button
                    type="button"
                    class="nt-task-button nt-task-button-secondary nt-task-button-icon"
                    onclick="window.openTaskUploadAction('${task.id}','${currentUserId()}')"
                    title="Upload Proof"
                >
                    <i class="fa-solid fa-paperclip"></i>
                </button>

                <button
                    type="button"
                    class="nt-task-button nt-task-button-secondary nt-task-button-icon"
                    onclick="window.openTaskDelegateAction('${task.id}','${currentUserId()}')"
                    title="Delegate"
                >
                    <i class="fa-solid fa-user-plus"></i>
                </button>
            `
            : '';

    return `
        ${workingActions}

        <button
            type="button"
            class="nt-task-button nt-task-button-secondary nt-task-button-icon"
            onclick="window.openTaskExtensionRequest('${task.id}','${currentUserId()}')"
            title="Request Deadline Extension"
        >
            <i class="fa-solid fa-calendar-plus"></i>
        </button>
    `;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD AND RENDER TASK PANEL
// ─────────────────────────────────────────────────────────────────────────────

window.loadTasksForPanel =
async function() {
    installTaskUIStyles();

    if (!tenantId()) return;

    const container =
        document.getElementById(
            'tasksPanel'
        );

    if (!container) return;

    if (
        window.canSeeTaskHub &&
        !window.canSeeTaskHub()
    ) {
        container.innerHTML = `
            <div class="nt-task-empty">
                <i
                    class="fa-solid fa-lock"
                    style="
                        display:block;
                        margin-bottom:9px;
                        font-size:25px;
                    "
                ></i>

                Tasks are not enabled on your plan.
            </div>
        `;

        return;
    }

    const {
        data: tasks,
        error: tasksError
    } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId())
        .order('created_at', {
            ascending: false
        })
        .limit(200);

    if (tasksError) {
        logger?.error?.(
            'Task load failed',
            tasksError
        );

        container.innerHTML = `
            <div class="nt-task-empty">
                Could not load tasks.
            </div>
        `;

        return;
    }

    if (!tasks?.length) {
        container.innerHTML = `
            <div class="nt-task-empty">
                <i
                    class="fa-solid fa-clipboard-list"
                    style="
                        display:block;
                        margin-bottom:9px;
                        font-size:27px;
                    "
                ></i>

                No tasks found.
            </div>
        `;

        return;
    }

    const taskIds =
        tasks.map(task => task.id);

    const {
        data: assignees,
        error: assigneeError
    } = await sb
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
        .eq('tenant_id', tenantId())
        .in('task_id', taskIds);

    if (assigneeError) {
        logger?.error?.(
            'Task assignee load failed',
            assigneeError
        );

        return;
    }

    const {
        data: trails,
        error: trailsError
    } = await sb
        .from('task_trails')
        .select(`
            *,
            profiles(
                full_name,
                email
            )
        `)
        .eq('tenant_id', tenantId())
        .in('task_id', taskIds)
        .order('created_at', {
            ascending: false
        });

    if (trailsError) {
        logger?.warn?.(
            'Task trail load failed',
            trailsError
        );
    }

    const assigneesByTask = {};
    const trailsByTask = {};

    for (const assignee of assignees || []) {
        if (
            !assigneesByTask[
                assignee.task_id
            ]
        ) {
            assigneesByTask[
                assignee.task_id
            ] = [];
        }

        assigneesByTask[
            assignee.task_id
        ].push(assignee);
    }

    for (const trail of trails || []) {
        if (
            !trailsByTask[
                trail.task_id
            ]
        ) {
            trailsByTask[
                trail.task_id
            ] = [];
        }

        trailsByTask[
            trail.task_id
        ].push(trail);
    }

    let visibleTasks =
        tasks.filter(task => {
            const assignments =
                assigneesByTask[
                    task.id
                ] ||
                [];

            return (
                task.assigned_by ===
                    currentUserId() ||
                assignments.some(
                    assignment =>
                        assignment.assignee_id ===
                        currentUserId()
                )
            );
        });

    const filterValue =
        document.getElementById(
            'taskFilter'
        )?.value ||
        'all';

    const sortValue =
        document.getElementById(
            'taskSort'
        )?.value ||
        'deadline_asc';

    const startDate =
        document.getElementById(
            'filterStartDate'
        )?.value ||
        null;

    const endDate =
        document.getElementById(
            'filterEndDate'
        )?.value ||
        null;

    const today =
        new Date().toLocaleDateString(
            'en-CA',
            {
                timeZone:
                    'Asia/Kolkata'
            }
        );

    visibleTasks =
        visibleTasks.filter(task => {
            const assignments =
                assigneesByTask[
                    task.id
                ] ||
                [];

            const summary =
                getTaskStatusSummary(
                    assignments
                );

            const myAssignment =
                assignments.find(
                    assignment =>
                        assignment.assignee_id ===
                        currentUserId()
                );

            const isCreator =
                task.assigned_by ===
                currentUserId();

            const createdDate =
                new Date(
                    task.created_at
                ).toLocaleDateString(
                    'en-CA',
                    {
                        timeZone:
                            'Asia/Kolkata'
                    }
                );

            switch (filterValue) {
                case 'today':
                    return createdDate === today;

                case 'completed':
                    return (
                        summary.total > 0 &&
                        summary.completed ===
                        summary.total
                    );

                case 'pending':
                    return !(
                        summary.total > 0 &&
                        summary.completed ===
                        summary.total
                    );

                case 'allotted_by_me':
                    return isCreator;

                case 'allotted_to_me':
                    return Boolean(
                        myAssignment &&
                        !isCreator
                    );

                case 'delegated':
                    return assignments.some(
                        assignment =>
                            assignment
                                .assignee_id ===
                                currentUserId() &&
                            assignment.status ===
                                'delegated'
                    );

                case 'transferred':
                    return assignments.some(
                        assignment =>
                            assignment
                                .assignee_id ===
                                currentUserId() &&
                            assignment.status ===
                                'transferred'
                    );

                case 'date_range':
                    if (
                        startDate &&
                        endDate
                    ) {
                        return (
                            createdDate >=
                                startDate &&
                            createdDate <=
                                endDate
                        );
                    }

                    return true;

                default:
                    return true;
            }
        });

    visibleTasks.sort(
        (taskA, taskB) => {
            if (
                sortValue ===
                'created_desc'
            ) {
                return (
                    new Date(
                        taskB.created_at
                    ) -
                    new Date(
                        taskA.created_at
                    )
                );
            }

            if (
                sortValue ===
                'created_asc'
            ) {
                return (
                    new Date(
                        taskA.created_at
                    ) -
                    new Date(
                        taskB.created_at
                    )
                );
            }

            const deadlineA =
                taskA.deadline
                    ? new Date(
                        taskA.deadline
                    )
                    : null;

            const deadlineB =
                taskB.deadline
                    ? new Date(
                        taskB.deadline
                    )
                    : null;

            if (
                !deadlineA &&
                !deadlineB
            ) {
                return 0;
            }

            if (!deadlineA) return 1;
            if (!deadlineB) return -1;

            if (
                sortValue ===
                'deadline_desc'
            ) {
                return (
                    deadlineB -
                    deadlineA
                );
            }

            return (
                deadlineA -
                deadlineB
            );
        }
    );

    if (!visibleTasks.length) {
        container.innerHTML = `
            <div class="nt-task-empty">
                No matching tasks.
            </div>
        `;

        return;
    }

    container.innerHTML =
        visibleTasks
            .map((task, taskIndex) => {
                const assignments =
                    assigneesByTask[
                        task.id
                    ] ||
                    [];

                const taskTrails =
                    trailsByTask[
                        task.id
                    ] ||
                    [];

                const summary =
                    getTaskStatusSummary(
                        assignments
                    );

                const state =
                    summary.state;

                const statusColour =
                    getStatusColour(state);

                const priority =
                    getPriorityData(
                        task.priority
                    );

                const deadline =
                    formatTaskDeadline(
                        task.deadline
                    );

                const isCompleted =
                    summary.total > 0 &&
                    summary.completed ===
                    summary.total;

                const isCreator =
                    task.assigned_by ===
                    currentUserId();

                const myAssignment =
                    assignments.find(
                        assignment =>
                            assignment
                                .assignee_id ===
                                currentUserId() &&
                            !isClosedAssignee(
                                assignment
                            )
                    );

                const submittedAssignments =
                    assignments.filter(
                        assignment =>
                            getEffectiveAssigneeStatus(
                                assignment
                            ) ===
                            'submitted'
                    );

                const primaryAction =
                    renderPrimaryAction({
                        task,
                        myAssignment,
                        isCreator,
                        submittedAssignments
                    });

                const secondaryActions =
                    renderSecondaryActionMenu(
                        task,
                        myAssignment
                    );

                const creatorName =
                    getDisplayName(
                        task.creator
                    );

                const pendingCount =
                    summary.counts
                        .pending_ack ||
                    0;

                const workingCount =
                    (
                        summary.counts
                            .acknowledged ||
                        0
                    ) +
                    (
                        summary.counts
                            .in_progress ||
                        0
                    );

                const reviewCount =
                    (
                        summary.counts
                            .submitted ||
                        0
                    ) +
                    (
                        summary.counts
                            .needs_review ||
                        0
                    );

                const creatorManagementHtml =
                    isCreator
                        ? `
                            <div class="nt-task-section">
                                <div class="nt-task-section-title">
                                    <i class="fa-solid fa-screwdriver-wrench"></i>
                                    Creator Controls
                                </div>

                                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                    <button
                                        class="nt-task-button nt-task-button-secondary"
                                        onclick="window.remindAllTaskPending('${task.id}')"
                                    >
                                        <i class="fa-solid fa-bell"></i>
                                        Remind Pending
                                    </button>

                                    <button
                                        class="nt-task-button nt-task-button-secondary"
                                        onclick="window.openTaskDeadlineAction('${task.id}')"
                                    >
                                        <i class="fa-solid fa-calendar-days"></i>
                                        Change Deadline
                                    </button>

                                    <button
                                        class="nt-task-button nt-task-button-secondary"
                                        onclick="window.openTaskOriginalMessage('${task.id}')"
                                    >
                                        <i class="fa-regular fa-message"></i>
                                        Original Message
                                    </button>

                                    <button
                                        class="nt-task-button nt-task-button-secondary"
                                        onclick="window.downloadTaskPDF('${task.id}')"
                                    >
                                        <i class="fa-solid fa-file-pdf"></i>
                                        PDF Report
                                    </button>

                                    <button
                                        class="nt-task-button nt-task-button-secondary"
                                        style="color:#b91c1c;background:#fef2f2;border-color:#fecaca;"
                                        onclick="window.openTaskCancelAction('${task.id}')"
                                    >
                                        <i class="fa-solid fa-ban"></i>
                                        Cancel Task
                                    </button>
                                </div>
                            </div>
                        `
                        : '';

                const creatorReviewHtml =
                    isCreator &&
                    submittedAssignments.length
                        ? `
                            <div class="nt-task-section">
                                <div class="nt-task-section-title">
                                    <i class="fa-solid fa-clipboard-check"></i>
                                    Waiting for Your Review
                                </div>

                                ${submittedAssignments
                                    .map(
                                        assignment => {
                                            const name =
                                                getDisplayName(
                                                    assignment.profiles
                                                );

                                            return `
                                                <div
                                                    style="
                                                        padding:10px 0;
                                                        border-bottom:1px solid var(--border-color,#e5e7eb);
                                                    "
                                                >
                                                    <div
                                                        style="
                                                            margin-bottom:8px;
                                                            color:var(--text-primary,#111827);
                                                            font-size:11px;
                                                            font-weight:800;
                                                        "
                                                    >
                                                        ${escapeHtml(name)}
                                                    </div>

                                                    <div
                                                        style="
                                                            display:flex;
                                                            flex-wrap:wrap;
                                                            gap:7px;
                                                        "
                                                    >
                                                        <button
                                                            class="nt-task-button nt-task-button-primary"
                                                            style="flex:initial;background:#16a34a;"
                                                            onclick="window.taskAction('${task.id}','${assignment.assignee_id}','accept')"
                                                        >
                                                            <i class="fa-solid fa-check"></i>
                                                            Approve
                                                        </button>

                                                        <button
                                                            class="nt-task-button nt-task-button-secondary"
                                                            onclick="window.openTaskReturnAction('${task.id}','${assignment.assignee_id}')"
                                                        >
                                                            <i class="fa-solid fa-rotate-left"></i>
                                                            Return
                                                        </button>

                                                        <button
                                                            class="nt-task-button nt-task-button-secondary"
                                                            onclick="window.openTaskTransferAction('${task.id}','${assignment.assignee_id}')"
                                                        >
                                                            <i class="fa-solid fa-arrow-right-arrow-left"></i>
                                                            Transfer
                                                        </button>
                                                    </div>
                                                </div>
                                            `;
                                        }
                                    )
                                    .join('')}
                            </div>
                        `
                        : '';

                return `
                    <article
                        class="
                            nt-task-card
                            ${
                                isCompleted
                                    ? 'nt-task-card-completed'
                                    : ''
                            }
                        "
                        data-task-id="${escapeHtml(task.id)}"
                    >
                        <div
                            class="nt-task-accent"
                            style="background:${statusColour.border};"
                        ></div>

                        <div class="nt-task-body">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;">
                                <span style="color:var(--accent,#4f46e5);font-size:11px;font-weight:900;letter-spacing:.06em;">
                                    TASK #${taskIndex + 1}
                                </span>
                                <span style="color:var(--text-secondary,#64748b);font-size:10px;font-weight:700;">
                                    ${escapeHtml(new Date(task.created_at).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short' }))}
                                </span>
                            </div>

                            <div class="nt-task-header">
                                <div class="nt-task-title-wrap">
                                    <h3 class="nt-task-title">
                                        ${escapeHtml(task.title)}
                                    </h3>

                                    <div class="nt-task-subtitle">
                                        ${escapeHtml(creatorName)}
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
                                    class="nt-task-priority"
                                    style="
                                        color:${priority.text};
                                        background:${priority.background};
                                    "
                                >
                                    ${priority.label}
                                </span>
                            </div>

                            <div class="nt-task-status-row">
                                <span
                                    class="nt-task-status-badge"
                                    style="
                                        color:${statusColour.text};
                                        background:${statusColour.background};
                                        border-color:${statusColour.border};
                                    "
                                >
                                    <i class="${getStatusIcon(state)}"></i>
                                    ${escapeHtml(getStatusLabel(state))}
                                </span>

                                <span
                                    class="
                                        nt-task-due
                                        ${
                                            deadline.overdue &&
                                            !isCompleted
                                                ? 'nt-task-due-overdue'
                                                : ''
                                        }
                                    "
                                >
                                    <i class="fa-regular fa-calendar"></i>

                                    ${escapeHtml(deadline.text)}

                                    ${
                                        deadline.overdue &&
                                        !isCompleted
                                            ? ' · Overdue'
                                            : ''
                                    }
                                </span>
                            </div>

                            <div class="nt-task-stat-grid">
                                <div class="nt-task-stat">
                                    <span class="nt-task-stat-value">
                                        ${pendingCount}
                                    </span>

                                    <span class="nt-task-stat-label">
                                        Awaiting
                                    </span>
                                </div>

                                <div class="nt-task-stat">
                                    <span class="nt-task-stat-value">
                                        ${workingCount}
                                    </span>

                                    <span class="nt-task-stat-label">
                                        Working
                                    </span>
                                </div>

                                <div class="nt-task-stat">
                                    <span class="nt-task-stat-value">
                                        ${summary.completed}
                                    </span>

                                    <span class="nt-task-stat-label">
                                        Completed
                                    </span>
                                </div>
                            </div>

                            <div class="nt-task-progress-wrap">
                                <div class="nt-task-progress-labels">
                                    <span>
                                        Engaged
                                        ${summary.engagementPercentage}%
                                    </span>

                                    <span>
                                        Completed
                                        ${summary.completionPercentage}%
                                    </span>
                                </div>

                                <div class="nt-task-progress-track">
                                    <div
                                        class="nt-task-progress-engaged"
                                        style="width:${summary.engagementPercentage}%;"
                                    ></div>

                                    <div
                                        class="nt-task-progress-complete"
                                        style="width:${summary.completionPercentage}%;"
                                    ></div>
                                </div>
                            </div>

                            <div class="nt-task-action-row">
                                ${primaryAction}

                                ${secondaryActions}

                                <button
                                    type="button"
                                    class="nt-task-button nt-task-button-secondary nt-task-button-icon"
                                    onclick="window.toggleTaskDetails('${task.id}')"
                                    title="Task Details"
                                >
                                    <i
                                        id="nt-task-details-icon-${task.id}"
                                        class="fa-solid fa-chevron-down"
                                    ></i>
                                </button>
                            </div>
                        </div>

                        <div
                            id="nt-task-details-${task.id}"
                            class="nt-task-expanded"
                        >
                            <div class="nt-task-section">
                                <div class="nt-task-section-title">
                                    <i class="fa-solid fa-users"></i>
                                    Staff Status
                                </div>

                                ${renderAssigneeList(assignments)}
                            </div>

                            ${creatorManagementHtml}

                            ${creatorReviewHtml}

                            <div class="nt-task-section">
                                <div class="nt-task-section-title">
                                    <i class="fa-solid fa-clock-rotate-left"></i>
                                    Timeline
                                </div>

                                <div class="nt-task-trail">
                                    ${renderTaskTrail(taskTrails)}
                                </div>
                            </div>

                            <div
                                style="
                                    display:flex;
                                    gap:8px;
                                    flex-wrap:wrap;
                                "
                            >
                                <button
                                    class="nt-task-button nt-task-button-secondary"
                                    onclick="window.openTaskOriginalMessage('${task.id}')"
                                >
                                    <i class="fa-regular fa-message"></i>
                                    Original Message
                                </button>

                                <button
                                    class="nt-task-button nt-task-button-secondary"
                                    onclick="window.downloadTaskPDF('${task.id}')"
                                >
                                    <i class="fa-solid fa-file-pdf"></i>
                                    PDF Report
                                </button>

                                ${
                                    isCreator &&
                                    reviewCount === 0 &&
                                    pendingCount > 0
                                        ? `
                                            <span
                                                style="
                                                    display:inline-flex;
                                                    align-items:center;
                                                    color:#c2410c;
                                                    font-size:10px;
                                                    font-weight:800;
                                                "
                                            >
                                                ${pendingCount}
                                                awaiting acknowledgement
                                            </span>
                                        `
                                        : ''
                                }
                            </div>
                        </div>
                    </article>
                `;
            })
            .join('');
};

// Initialise styles immediately.
installTaskUIStyles();
