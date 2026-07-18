import { sb } from './shared.js';
import logger from './utils/logger.js';

// v1.60.0 - Multi-assignee workflow, mixed progress and tenant-safe actions

// ─── RICH TEXT HELPERS ──────────────────────────────────────────────────────

window.taskFmtCmd = function(cmd, boxId) {
    const el = document.getElementById('update-txt-' + boxId);
    if (!el) return;

    el.focus();
    document.execCommand(cmd, false, null);
};

window.taskFmtList = function(listType, boxId) {
    const el = document.getElementById('update-txt-' + boxId);
    if (!el) return;

    el.focus();

    document.execCommand(
        listType === 'ul'
            ? 'insertUnorderedList'
            : 'insertOrderedList',
        false,
        null
    );
};

// ─── NOTIFICATION HELPERS ──────────────────────────────────────────────────

window.notifyUser = async function(
    userId,
    message,
    messageId = null,
    type = 'task',
    taskId = null
) {
    if (!userId || !message || !window.currentTenantId) return;

    try {
        const cleanMsg = window.stripHtml
            ? window.stripHtml(message)
            : message;

        const payload = {
            user_id: userId,
            type,
            message: cleanMsg.substring(0, 200),
            message_id: messageId || null,
            tenant_id: window.currentTenantId,
            is_read: false
        };

        if (taskId) {
            payload.task_id = taskId;
        }

        const { error } = await sb
            .from('notifications')
            .insert(payload);

        if (
            error &&
            !error.message?.includes('duplicate') &&
            !error.code?.includes('23505')
        ) {
            throw error;
        }
    } catch (error) {
        logger?.warn?.('Task notification failed', error);
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
        !roomId ||
        !senderId ||
        !window.currentTenantId
    ) {
        return;
    }

    try {
        const { data: members, error } = await sb
            .from('messages')
            .select('sender_id')
            .eq('room_id', roomId)
            .eq('tenant_id', window.currentTenantId)
            .neq('sender_id', senderId);

        if (error) throw error;

        const uniqueIds = [
            ...new Set(
                (members || []).map(member => member.sender_id)
            )
        ];

        for (const userId of uniqueIds) {
            await window.notifyUser(
                userId,
                message,
                messageId,
                type
            );
        }
    } catch (error) {
        logger?.warn?.('Group notification failed', error);
    }
};

// ─── TASK MODAL ─────────────────────────────────────────────────────────────

window.openTaskModal = async function(messageId, text) {
    if (window.guardCreateTask?.()) return;

    window.currentMessageId = messageId;

    const tempElement = document.createElement('div');
    tempElement.innerHTML = text;

    const plainText = (
        tempElement.textContent ||
        tempElement.innerText ||
        ''
    ).trim();

    window.currentMessageTextRaw =
        plainText.substring(0, 60) +
        (plainText.length > 60 ? '...' : '');

    document
        .querySelectorAll('.msg-menu-dropdown')
        .forEach(menu => menu.remove());

    const modal = document.getElementById('taskModal');

    modal?.classList.remove('hidden');
    modal?.classList.add('flex');

    const titleInput = document.getElementById('taskTitle');

    if (titleInput) {
        titleInput.value = plainText;
    }

    const users = (window.globalUsersCache || []).filter(
        user => user.id !== window.currentUser?.id
    );

    const list = document.getElementById(
        'assigneeCheckboxList'
    );

    if (list) {
        list.innerHTML = users.map(user => {
            const userName = window.toSentenceCase(
                user.full_name ||
                user.email?.split('@')[0] ||
                'Unknown'
            );

            return `
                <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 hover:bg-gray-100 rounded cursor-pointer transition-colors">
                    <input
                        type="checkbox"
                        value="${user.id}"
                        class="assignee-cb w-4 h-4 accent-[var(--accent)]"
                    >

                    <span class="assignee-name font-medium text-gray-700">
                        ${window.escapeHtml(userName)}
                    </span>
                </label>
            `;
        }).join('');
    }

    const searchInput = document.getElementById(
        'assigneeSearch'
    );

    if (searchInput) {
        searchInput.value = '';
    }
};

window.filterAssignees = function() {
    const input = document.getElementById(
        'assigneeSearch'
    );

    const term = (
        input?.value ||
        ''
    ).toLowerCase();

    document
        .querySelectorAll('.assignee-item')
        .forEach(element => {
            const name =
                element
                    .querySelector('.assignee-name')
                    ?.innerText
                    ?.toLowerCase() ||
                '';

            element.style.display =
                name.includes(term)
                    ? 'flex'
                    : 'none';
        });
};

window.closeTaskModal = function() {
    const modal = document.getElementById('taskModal');

    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
};

// ─── PDF AUDIT REPORT ──────────────────────────────────────────────────────

window.downloadTaskPDF = async function(taskId) {
    if (!taskId || !window.currentTenantId) return;

    window.showCenterToast(
        'Generating PDF Report...',
        'fa-solid fa-spinner fa-spin',
        'text-blue-500'
    );

    const { data: task, error: taskError } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('id', taskId)
        .eq('tenant_id', window.currentTenantId)
        .single();

    if (taskError || !task) {
        window.showCenterToast(
            'Task not found in this organisation.',
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    const { data: trailList, error: trailError } = await sb
        .from('task_trails')
        .select(`
            *,
            profiles(
                full_name,
                email
            )
        `)
        .eq('task_id', taskId)
        .eq('tenant_id', window.currentTenantId)
        .order('created_at', {
            ascending: true
        });

    if (trailError) {
        window.showCenterToast(
            'Could not load the task audit trail.',
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    let ipAddress = 'Unavailable';

    try {
        const response = await fetch(
            'https://api.ipify.org?format=json'
        );

        const result = await response.json();

        ipAddress = result.ip || 'Unavailable';
    } catch (error) {
        // IP address is optional.
    }

    const downloadedAt = new Date().toLocaleString(
        'en-IN',
        {
            timeZone: 'Asia/Kolkata'
        }
    );

    const downloadedBy =
        window.currentUser?.user_metadata?.full_name ||
        window.currentUser?.email?.split('@')[0] ||
        'User';

    const wrapper = document.createElement('div');

    wrapper.style.cssText = `
        padding:30px;
        font-family:Inter,sans-serif;
        color:#111b21;
        background:#ffffff;
        position:relative;
        overflow:hidden;
    `;

    const trailRows = (trailList || []).map(trail => {
        const trailUser = window.toSentenceCase(
            (
                trail.profiles?.full_name ||
                trail.profiles?.email ||
                'System'
            ).split('@')[0]
        );

        const trailTime = window.getISTTime(
            trail.created_at
        );

        const trailDate = window.getISTDate(
            trail.created_at
        );

        let trailComment = trail.comment || '';

        if (
            trail.action === 'FILE' &&
            trailComment.includes('|')
        ) {
            trailComment = trailComment.split('|')[0];
        }

        return `
            <tr>
                <td style="padding:10px;border:1px solid #ccc;white-space:nowrap;">
                    ${trailDate}<br>
                    ${trailTime}
                </td>

                <td style="padding:10px;border:1px solid #ccc;font-weight:bold;">
                    ${window.escapeHtml(trailUser)}
                </td>

                <td style="padding:10px;border:1px solid #ccc;">
                    ${window.escapeHtml(trailComment)}
                </td>
            </tr>
        `;
    }).join('');

    wrapper.innerHTML = `
        <div
            style="
                position:absolute;
                inset:0;
                z-index:0;
                pointer-events:none;
                display:flex;
                align-items:center;
                justify-content:center;
                opacity:0.06;
                transform:rotate(-35deg);
                font-size:120px;
                font-weight:bold;
                white-space:nowrap;
            "
        >
            NOTED FOR ACTION
        </div>

        <div
            style="
                position:absolute;
                bottom:10px;
                right:15px;
                font-size:10px;
                color:#999;
                text-align:right;
            "
        >
            DOWNLOADED BY:
            ${window.escapeHtml(downloadedBy).toUpperCase()}
            <br>

            IP:
            ${window.escapeHtml(ipAddress)}
            <br>

            ${window.escapeHtml(downloadedAt)}
        </div>

        <div style="position:relative;z-index:1;">
            <h2
                style="
                    color:#800000;
                    border-bottom:2px solid #800000;
                    padding-bottom:10px;
                    margin-bottom:20px;
                "
            >
                Noted For Action — Audit Report
            </h2>

            <h3 style="margin-bottom:15px;">
                Task:
                ${window.escapeHtml(task.title)}
            </h3>

            <p style="margin-bottom:5px;">
                <b>Created By:</b>
                ${window.escapeHtml(
                    task.creator?.full_name ||
                    task.creator?.email ||
                    'Unknown'
                )}
            </p>

            <p style="margin-bottom:5px;">
                <b>Deadline:</b>
                ${
                    task.deadline
                        ? window.getISTDate(task.deadline)
                        : 'None'
                }
            </p>

            <p style="margin-bottom:5px;">
                <b>Priority:</b>
                ${window.escapeHtml(task.priority || 'Normal')}
            </p>

            <p style="margin-bottom:20px;">
                <b>Organisation:</b>
                ${window.escapeHtml(window.currentTenantId)}
            </p>

            <h4 style="margin-bottom:10px;color:#444;">
                Complete Audit Trail
            </h4>

            <table
                style="
                    width:100%;
                    border-collapse:collapse;
                    font-size:12px;
                "
            >
                <tr style="background-color:#f0f2f5;">
                    <th style="padding:10px;border:1px solid #ccc;text-align:left;">
                        Timestamp (IST)
                    </th>

                    <th style="padding:10px;border:1px solid #ccc;text-align:left;">
                        User
                    </th>

                    <th style="padding:10px;border:1px solid #ccc;text-align:left;">
                        Action / Comment
                    </th>
                </tr>

                ${trailRows}
            </table>
        </div>
    `;

    if (!window.html2pdf) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');

            script.src =
                'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

            script.onload = resolve;
            script.onerror = reject;

            document.head.appendChild(script);
        });
    }

    await html2pdf()
        .from(wrapper)
        .set({
            margin: 10,
            filename: `Task_Audit_${taskId}.pdf`,
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

    window.showCenterToast(
        'PDF Downloaded!',
        'fa-solid fa-file-pdf',
        'text-green-500'
    );
};

// ─── CREATE TASK ────────────────────────────────────────────────────────────

window.saveTaskMultiAssignee = async function() {
    if (!window.currentTenantId) {
        return window.showCenterToast(
            'Organisation could not be identified.',
            'fa-solid fa-ban',
            'text-red-500'
        );
    }

    if (
        window.canCreateTask &&
        !window.canCreateTask()
    ) {
        window.showCenterToast(
            'You do not have permission to create tasks.',
            'fa-solid fa-ban',
            'text-red-500'
        );

        return;
    }

    const title = (
        document.getElementById('taskTitle')?.value ||
        ''
    ).trim();

    const assigneeIds = Array.from(
        document.querySelectorAll(
            '.assignee-cb:checked'
        )
    ).map(checkbox => checkbox.value);

    if (!title || assigneeIds.length === 0) {
        return window.showCenterToast(
            'Need Title and Assignee',
            'fa-solid fa-times',
            'text-red-500'
        );
    }

    logger.logAction('createTask', {
        title,
        tenantId: window.currentTenantId,
        assigneeCount: assigneeIds.length
    });

    const { data: task, error: taskError } = await sb
        .from('tasks')
        .insert({
            original_message_id: window.currentMessageId,
            title,
            assigned_by: window.currentUser.id,
            tenant_id: window.currentTenantId,
            deadline:
                document.getElementById('taskDeadline')
                    ?.value ||
                null,
            priority:
                document.getElementById('taskPriority')
                    ?.value ||
                'normal',
            require_proof:
                document.getElementById(
                    'taskRequireProof'
                )?.checked ||
                false,
            status: 'pending'
        })
        .select()
        .single();

    if (taskError || !task) {
        return window.showCenterToast(
            'Failed to create task.',
            'fa-solid fa-times',
            'text-red-500'
        );
    }

    const assignmentRows = assigneeIds.map(
        assigneeId => ({
            task_id: task.id,
            assignee_id: assigneeId,
            tenant_id: window.currentTenantId,
            status: 'pending_ack',
            state: 'pending',
            acked: false
        })
    );

    const { error: assigneeError } = await sb
        .from('task_assignees')
        .insert(assignmentRows);

    if (assigneeError) {
        window.showCenterToast(
            `Task created, but assigning staff failed: ${assigneeError.message}`,
            'fa-solid fa-times',
            'text-red-500'
        );

        return;
    }

    await sb
        .from('task_trails')
        .insert({
            task_id: task.id,
            user_id: window.currentUser.id,
            tenant_id: window.currentTenantId,
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

    window.showCenterToast(
        'Task Created Successfully'
    );

    window.closeTaskModal();
    window.loadTasksForPanel();
};

// ─── STATUS HELPERS ─────────────────────────────────────────────────────────

const TASK_CLOSED_STATUSES = new Set([
    'transferred',
    'cancelled'
]);

function getEffectiveAssigneeStatus(assignee) {
    if (
        assignee?.state === 'acknowledged' &&
        assignee?.status === 'pending_ack'
    ) {
        return 'acknowledged';
    }

    return assignee?.status || 'pending_ack';
}

function getTaskStatusSummary(assignees = []) {
    const activeAssignees = assignees.filter(
        assignee =>
            !TASK_CLOSED_STATUSES.has(
                getEffectiveAssigneeStatus(assignee)
            )
    );

    const counts = activeAssignees.reduce(
        (result, assignee) => {
            const status =
                getEffectiveAssigneeStatus(assignee);

            result[status] =
                (result[status] || 0) + 1;

            return result;
        },
        {}
    );

    const total = activeAssignees.length;

    const engaged = activeAssignees.filter(
        assignee =>
            getEffectiveAssigneeStatus(assignee) !==
            'pending_ack'
    ).length;

    const completed = activeAssignees.filter(
        assignee =>
            getEffectiveAssigneeStatus(assignee) ===
            'accepted'
    ).length;

    const uniqueStatuses = Object.keys(counts);

    return {
        counts,
        total,
        engaged,
        completed,
        engagementPct:
            total > 0
                ? Math.round(
                    (engaged / total) * 100
                )
                : 0,
        completionPct:
            total > 0
                ? Math.round(
                    (completed / total) * 100
                )
                : 0,
        state:
            total === 0
                ? 'empty'
                : uniqueStatuses.length === 1
                    ? uniqueStatuses[0]
                    : 'mixed'
    };
}

function getTaskStateLabel(state) {
    const labels = {
        empty: 'No Active Assignees',
        mixed: 'Mixed Progress',
        pending_ack: 'Needs Acknowledgement',
        acknowledged: 'Acknowledged',
        in_progress: 'In Progress',
        submitted: 'Pending Review',
        needs_review: 'Changes Needed',
        accepted: 'Completed',
        transferred: 'Transferred',
        cancelled: 'Cancelled'
    };

    return labels[state] || 'Unknown';
}

// ─── TASK ACTIONS ───────────────────────────────────────────────────────────

window.taskAction = async function(
    taskId,
    assigneeId,
    action,
    requireProof = false
) {
    if (
        !taskId ||
        !assigneeId ||
        !window.currentTenantId
    ) {
        return;
    }

    let actionText = '';
    let newStatus = '';
    let comment = '';

    const acknowledgementButton =
        document.getElementById(
            `ack-btn-${taskId}-${assigneeId}`
        );

    if (action === 'ack' && acknowledgementButton) {
        acknowledgementButton.disabled = true;

        acknowledgementButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Acknowledging...
        `;
    }

    const { data: taskData, error: taskError } = await sb
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('tenant_id', window.currentTenantId)
        .single();

    if (taskError || !taskData) {
        window.showCenterToast(
            'Task was not found in this organisation.',
            'fa-solid fa-lock',
            'text-red-500'
        );

        return;
    }

    const creatorId = taskData.assigned_by;

    if (action === 'ack') {
        newStatus = 'acknowledged';
        actionText = 'ACKNOWLEDGE';
        comment = 'Acknowledged the task';

        await window.notifyUser(
            creatorId,
            `✅ Task Acknowledged: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );
    }

    else if (action === 'start') {
        newStatus = 'in_progress';
        actionText = 'START';
        comment = 'Started work';

        await window.notifyUser(
            creatorId,
            `▶️ Work Started: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );
    }

    else if (action === 'update') {
        const input = document.getElementById(
            `update-txt-${taskId}-${assigneeId}`
        );

        comment = input
            ? (
                input.contentEditable === 'true'
                    ? (
                        input.innerText ||
                        input.textContent ||
                        ''
                    ).trim()
                    : (
                        input.value ||
                        ''
                    ).trim()
            )
            : '';

        if (
            !comment ||
            comment === '<br>' ||
            comment === '<div><br></div>'
        ) {
            return window.showCenterToast(
                'Update cannot be empty.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        const plainComment = window.stripHtml
            ? window.stripHtml(comment)
            : comment;

        actionText = 'UPDATE';

        await window.notifyUser(
            creatorId,
            `💬 Task Update: ${taskData.title} — ${plainComment.substring(0, 60)}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        if (input) {
            if (input.contentEditable === 'true') {
                input.innerHTML = '';
            } else {
                input.value = '';
            }
        }

        document
            .getElementById(
                `comment-box-${taskId}-${assigneeId}`
            )
            ?.classList.add('hidden');
    }

    else if (action === 'upload') {
        const fileInput = document.getElementById(
            `upload-box-${taskId}-${assigneeId}`
        );

        if (!fileInput?.files?.length) {
            return window.showCenterToast(
                'Select a file.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        const file = fileInput.files[0];

        const safeName = file.name.replace(
            /[^a-zA-Z0-9.\-_]/g,
            '_'
        );

        const filePath =
            `tasks/${window.currentTenantId}/${taskId}/${Date.now()}_${safeName}`;

        const progressContainer =
            document.getElementById(
                `upload-progress-container-${taskId}-${assigneeId}`
            );

        const progressBar =
            document.getElementById(
                `upload-progress-bar-${taskId}-${assigneeId}`
            );

        if (progressContainer && progressBar) {
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '30%';
        }

        const { error: uploadError } = await sb
            .storage
            .from('task-proofs')
            .upload(
                filePath,
                file
            );

        if (uploadError) {
            progressContainer?.classList.add('hidden');

            return window.showCenterToast(
                `Upload Failed: ${uploadError.message}`,
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        if (progressBar) {
            progressBar.style.width = '100%';
        }

        actionText = 'FILE';
        comment = `${file.name}|${filePath}`;

        await window.notifyUser(
            creatorId,
            `📎 File uploaded on task: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        fileInput.value = '';

        if (progressContainer && progressBar) {
            setTimeout(() => {
                progressContainer.classList.add(
                    'hidden'
                );

                progressBar.style.width = '0%';
            }, 500);
        }
    }

    else if (action === 'submit') {
        if (requireProof) {
            const { data: proofTrails } = await sb
                .from('task_trails')
                .select('id')
                .eq('task_id', taskId)
                .eq('tenant_id', window.currentTenantId)
                .eq('user_id', window.currentUser.id)
                .eq('action', 'FILE')
                .limit(1);

            if (
                !proofTrails ||
                proofTrails.length === 0
            ) {
                return window.showCenterToast(
                    'Proof required — please attach a file.',
                    'fa-solid fa-exclamation-triangle',
                    'text-red-500'
                );
            }
        }

        newStatus = 'submitted';
        actionText = 'SUBMIT';
        comment = 'Submitted for Review';

        await window.notifyUser(
            creatorId,
            `📬 Task Submitted for Review: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );
    }

    else if (action === 'accept') {
        newStatus = 'accepted';
        actionText = 'ACCEPT';
        comment = 'Accepted completion';

        await window.notifyUser(
            assigneeId,
            `🎉 Task Accepted: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );
    }

    else if (action === 'review_again') {
        const feedbackInput =
            document.getElementById(
                `review-txt-${taskId}-${assigneeId}`
            );

        comment = (
            feedbackInput?.value ||
            ''
        ).trim();

        if (!comment) {
            return window.showCenterToast(
                'Feedback is mandatory for rework.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        newStatus = 'needs_review';
        actionText = 'RETURN';

        await window.notifyUser(
            assigneeId,
            `🔄 Task Needs Changes: ${taskData.title} — ${comment.substring(0, 60)}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        document
            .getElementById(
                `review-box-${taskId}-${assigneeId}`
            )
            ?.classList.add('hidden');
    }

    else if (action === 'delegate') {
        const newAssignee = document
            .getElementById(
                `delegate-sel-${taskId}-${assigneeId}`
            )
            ?.value;

        if (!newAssignee) {
            return window.showCenterToast(
                'Select user to delegate.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        const { data: existingAssignment } = await sb
            .from('task_assignees')
            .select('assignee_id')
            .eq('task_id', taskId)
            .eq('assignee_id', newAssignee)
            .eq('tenant_id', window.currentTenantId)
            .maybeSingle();

        if (existingAssignment) {
            return window.showCenterToast(
                'This user is already assigned to the task.',
                'fa-solid fa-exclamation-triangle',
                'text-orange-500'
            );
        }

        actionText = 'DELEGATE';
        comment = `Delegated to user ${newAssignee}`;

        const { error: delegateError } = await sb
            .from('task_assignees')
            .insert({
                task_id: taskId,
                assignee_id: newAssignee,
                tenant_id: window.currentTenantId,
                status: 'pending_ack',
                state: 'pending',
                acked: false
            });

        if (delegateError) {
            return window.showCenterToast(
                `Could not delegate task: ${delegateError.message}`,
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        await window.notifyUser(
            newAssignee,
            `👤 Task Delegated to you: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        await window.notifyUser(
            creatorId,
            `↗️ Task Delegated: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        document
            .getElementById(
                `delegate-box-${taskId}-${assigneeId}`
            )
            ?.classList.add('hidden');
    }

    else if (action === 'transfer') {
        const newAssignee = document
            .getElementById(
                `transfer-sel-${taskId}-${assigneeId}`
            )
            ?.value;

        const reasonInput = document
            .getElementById(
                `transfer-txt-${taskId}-${assigneeId}`
            );

        comment = (
            reasonInput?.value ||
            ''
        ).trim();

        if (!newAssignee) {
            return window.showCenterToast(
                'Select user to transfer.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        if (!comment) {
            return window.showCenterToast(
                'Reason is mandatory for transfer.',
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        const confirmed = confirm(
            `Transfer this task to the selected user?\n\nReason: ${comment}\n\nThe previous assignment will remain in the audit history.`
        );

        if (!confirmed) return;

        const { data: existingAssignment } = await sb
            .from('task_assignees')
            .select('assignee_id')
            .eq('task_id', taskId)
            .eq('assignee_id', newAssignee)
            .eq('tenant_id', window.currentTenantId)
            .maybeSingle();

        if (existingAssignment) {
            return window.showCenterToast(
                'The selected user is already assigned.',
                'fa-solid fa-exclamation-triangle',
                'text-orange-500'
            );
        }

        actionText = 'TRANSFER';

        const { error: closeError } = await sb
            .from('task_assignees')
            .update({
                status: 'transferred',
                state: 'closed'
            })
            .eq('task_id', taskId)
            .eq('assignee_id', assigneeId)
            .eq('tenant_id', window.currentTenantId);

        if (closeError) {
            return window.showCenterToast(
                `Could not close previous assignment: ${closeError.message}`,
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        const { error: transferError } = await sb
            .from('task_assignees')
            .insert({
                task_id: taskId,
                assignee_id: newAssignee,
                tenant_id: window.currentTenantId,
                status: 'pending_ack',
                state: 'pending',
                acked: false
            });

        if (transferError) {
            await sb
                .from('task_assignees')
                .update({
                    status: 'submitted',
                    state: 'submitted'
                })
                .eq('task_id', taskId)
                .eq('assignee_id', assigneeId)
                .eq('tenant_id', window.currentTenantId);

            return window.showCenterToast(
                `Could not transfer task: ${transferError.message}`,
                'fa-solid fa-times',
                'text-red-500'
            );
        }

        await window.notifyUser(
            newAssignee,
            `🔁 Task Transferred to you: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );

        await window.notifyUser(
            assigneeId,
            `🔁 Your task was transferred: ${taskData.title}`,
            taskData.original_message_id,
            'task',
            taskId
        );
    }

    if (newStatus) {
        const updatePayload =
            action === 'ack'
                ? {
                    status: 'pending_ack',
                    state: 'acknowledged',
                    acked: true
                }
                : {
                    status: newStatus,
                    state: newStatus
                };

        const { data: updatedRows, error: updateError } =
            await sb
                .from('task_assignees')
                .update(updatePayload)
                .eq('task_id', taskId)
                .eq('assignee_id', assigneeId)
                .eq('tenant_id', window.currentTenantId)
                .select();

        if (
            updateError ||
            !updatedRows ||
            updatedRows.length === 0
        ) {
            window.showCenterToast(
                'Could not update task. Please try again.',
                'fa-solid fa-lock',
                'text-red-500'
            );

            if (
                action === 'ack' &&
                acknowledgementButton
            ) {
                acknowledgementButton.disabled = false;
                acknowledgementButton.innerHTML =
                    'Acknowledge Task';
            }

            return;
        }
    }

    if (actionText) {
        await sb
            .from('task_trails')
            .insert({
                task_id: taskId,
                user_id: window.currentUser.id,
                tenant_id: window.currentTenantId,
                action: actionText,
                comment
            });
    }

    window.loadTasksForPanel();
};

// ─── LOAD AND RENDER TASKS ─────────────────────────────────────────────────

window.loadTasksForPanel = async function() {
    if (!window.currentTenantId) return;

    if (
        window.canSeeTaskHub &&
        !window.canSeeTaskHub()
    ) {
        const panel = document.getElementById(
            'tasksPanel'
        );

        if (panel) {
            panel.innerHTML = `
                <p class="text-sm text-center mt-8 opacity-40">
                    <i class="fa-solid fa-lock text-2xl block mb-2"></i>
                    Tasks not enabled on your plan.
                </p>
            `;
        }

        return;
    }

    const { data: tasks, error: tasksError } = await sb
        .from('tasks')
        .select(`
            *,
            creator:profiles!assigned_by(
                full_name,
                email
            )
        `)
        .eq('tenant_id', window.currentTenantId)
        .order('created_at', {
            ascending: false
        })
        .limit(200);

    if (tasksError) {
        logger?.error?.(
            'Could not load tasks',
            tasksError
        );

        return;
    }

    const taskIds = (tasks || []).map(
        task => task.id
    );

    const container = document.getElementById(
        'tasksPanel'
    );

    if (!container) return;

    if (taskIds.length === 0) {
        container.innerHTML = `
            <p class="text-sm opacity-50 text-center mt-6">
                <i class="fa-solid fa-inbox text-3xl mb-2 block"></i>
                No tasks active.
            </p>
        `;

        return;
    }

    const { data: assignees, error: assigneeError } =
        await sb
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
            .eq('tenant_id', window.currentTenantId)
            .in('task_id', taskIds);

    if (assigneeError) {
        logger?.error?.(
            'Could not load task assignees',
            assigneeError
        );

        return;
    }

    const { data: trails, error: trailError } =
        await sb
            .from('task_trails')
            .select(`
                *,
                profiles(
                    full_name,
                    email
                )
            `)
            .eq('tenant_id', window.currentTenantId)
            .in('task_id', taskIds)
            .order('created_at', {
                ascending: false
            });

    if (trailError) {
        logger?.error?.(
            'Could not load task trails',
            trailError
        );
    }

    const assigneesMap = {};

    for (const assignee of assignees || []) {
        if (!assigneesMap[assignee.task_id]) {
            assigneesMap[assignee.task_id] = [];
        }

        assigneesMap[assignee.task_id].push({
            assignee_id: assignee.assignee_id,
            status: assignee.status,
            state: assignee.state,
            acked: assignee.acked,
            profiles: assignee.profiles
        });
    }

    const trailsMap = {};

    for (const trail of trails || []) {
        if (!trailsMap[trail.task_id]) {
            trailsMap[trail.task_id] = [];
        }

        trailsMap[trail.task_id].push(trail);
    }

    const filterValue =
        document.getElementById('taskFilter')
            ?.value ||
        'all';

    const sortValue =
        document.getElementById('taskSort')
            ?.value ||
        'deadline_asc';

    const startDate =
        document.getElementById('filterStartDate')
            ?.value ||
        null;

    const endDate =
        document.getElementById('filterEndDate')
            ?.value ||
        null;

    const todayString = new Date()
        .toLocaleDateString(
            'en-CA',
            {
                timeZone: 'Asia/Kolkata'
            }
        );

    let filteredTasks = (tasks || []).filter(task => {
        const taskAssignees =
            assigneesMap[task.id] ||
            [];

        return (
            task.assigned_by ===
                window.currentUser.id ||
            taskAssignees.some(
                assignee =>
                    assignee.assignee_id ===
                    window.currentUser.id
            )
        );
    });

    if (filterValue !== 'all') {
        filteredTasks = filteredTasks.filter(task => {
            const taskAssignees =
                assigneesMap[task.id] ||
                [];

            const myAssignment =
                taskAssignees.find(
                    assignee =>
                        assignee.assignee_id ===
                        window.currentUser.id
                );

            const isCreator =
                task.assigned_by ===
                window.currentUser.id;

            const activeAssignees =
                taskAssignees.filter(
                    assignee =>
                        !TASK_CLOSED_STATUSES.has(
                            getEffectiveAssigneeStatus(
                                assignee
                            )
                        )
                );

            const allAccepted =
                activeAssignees.length > 0 &&
                activeAssignees.every(
                    assignee =>
                        getEffectiveAssigneeStatus(
                            assignee
                        ) === 'accepted'
                );

            const createdDate =
                new Date(task.created_at)
                    .toLocaleDateString(
                        'en-CA',
                        {
                            timeZone: 'Asia/Kolkata'
                        }
                    );

            switch (filterValue) {
                case 'today':
                    return createdDate === todayString;

                case 'completed':
                    return allAccepted;

                case 'pending':
                    return !allAccepted;

                case 'allotted_by_me':
                    return isCreator;

                case 'allotted_to_me':
                    return Boolean(
                        myAssignment &&
                        !isCreator
                    );

                case 'delegated':
                    return taskAssignees.some(
                        assignee =>
                            assignee.assignee_id ===
                                window.currentUser.id &&
                            assignee.status ===
                                'delegated'
                    );

                case 'transferred':
                    return taskAssignees.some(
                        assignee =>
                            assignee.assignee_id ===
                                window.currentUser.id &&
                            assignee.status ===
                                'transferred'
                    );

                case 'date_range':
                    if (startDate && endDate) {
                        return (
                            createdDate >= startDate &&
                            createdDate <= endDate
                        );
                    }

                    return true;

                default:
                    return true;
            }
        });
    }

    filteredTasks.sort((taskA, taskB) => {
        const noDeadline = task =>
            !task.deadline;

        if (sortValue === 'deadline_asc') {
            if (
                noDeadline(taskA) &&
                noDeadline(taskB)
            ) {
                return 0;
            }

            if (noDeadline(taskA)) return 1;
            if (noDeadline(taskB)) return -1;

            return (
                new Date(taskA.deadline) -
                new Date(taskB.deadline)
            );
        }

        if (sortValue === 'deadline_desc') {
            if (
                noDeadline(taskA) &&
                noDeadline(taskB)
            ) {
                return 0;
            }

            if (noDeadline(taskA)) return 1;
            if (noDeadline(taskB)) return -1;

            return (
                new Date(taskB.deadline) -
                new Date(taskA.deadline)
            );
        }

        if (sortValue === 'created_desc') {
            return (
                new Date(taskB.created_at) -
                new Date(taskA.created_at)
            );
        }

        if (sortValue === 'created_asc') {
            return (
                new Date(taskA.created_at) -
                new Date(taskB.created_at)
            );
        }

        return 0;
    });

    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <p class="text-sm opacity-50 text-center mt-6">
                <i class="fa-solid fa-inbox text-3xl mb-2 block"></i>
                No matching tasks.
            </p>
        `;

        return;
    }

    container.innerHTML = filteredTasks.map(task => {
        const taskAssignees =
            assigneesMap[task.id] ||
            [];

        const taskTrails =
            trailsMap[task.id] ||
            [];

        const activeAssignees =
            taskAssignees.filter(
                assignee =>
                    !TASK_CLOSED_STATUSES.has(
                        getEffectiveAssigneeStatus(
                            assignee
                        )
                    )
            );

        const allAccepted =
            activeAssignees.length > 0 &&
            activeAssignees.every(
                assignee =>
                    getEffectiveAssigneeStatus(
                        assignee
                    ) === 'accepted'
            );

        const statusSummary =
            getTaskStatusSummary(taskAssignees);

        const globalState =
            statusSummary.state;

        let badgeClass = 'badge-pending';

        let badgeText =
            `⏳ ${getTaskStateLabel(globalState)}`;

        let borderColor = '#ea580c';

        if (globalState === 'acknowledged') {
            badgeClass = 'badge-progress';
            badgeText = '✅ Acknowledged';
            borderColor = '#2563eb';
        }

        if (globalState === 'in_progress') {
            badgeClass = 'badge-progress';
            badgeText = '⚙️ In Progress';
        }

        if (globalState === 'submitted') {
            badgeClass = 'badge-review';
            badgeText = '📬 Pending Review';
        }

        if (globalState === 'needs_review') {
            badgeClass = 'badge-changes';
            badgeText = '🔄 Changes Needed';
            borderColor = '#dc2626';
        }

        if (globalState === 'accepted') {
            badgeClass = 'badge-done';
            badgeText = '🎉 Completed';
            borderColor = '#166534';
        }

        if (globalState === 'mixed') {
            badgeClass = 'badge-progress';
            badgeText = '👥 Mixed Progress';
            borderColor = '#7c3aed';
        }

        let deadlineHtml = task.deadline
            ? window.getISTDate(task.deadline)
            : 'None';

        if (task.deadline) {
            const deadlineDate =
                new Date(task.deadline);

            deadlineDate.setHours(
                23,
                59,
                59,
                999
            );

            if (
                deadlineDate < new Date() &&
                globalState !== 'accepted'
            ) {
                deadlineHtml = `
                    <span class="text-red-600 font-bold bg-red-50 px-1 rounded">
                        ${deadlineHtml}
                        ⚠️ Overdue
                    </span>
                `;

                borderColor = '#800000';
            }
        }

        const assigneeNames = taskAssignees.map(
            assignee => {
                const effectiveStatus =
                    getEffectiveAssigneeStatus(
                        assignee
                    );

                let suffix = '';
                let textClass = 'text-gray-800';

                if (effectiveStatus === 'acknowledged') {
                    suffix = ' (Acknowledged)';
                }

                if (effectiveStatus === 'in_progress') {
                    suffix = ' (Working)';
                }

                if (effectiveStatus === 'submitted') {
                    suffix = ' (Submitted)';
                }

                if (effectiveStatus === 'needs_review') {
                    suffix = ' (Changes Needed)';
                }

                if (effectiveStatus === 'accepted') {
                    suffix = ' (Completed)';
                    textClass =
                        'text-[#166534] font-bold';
                }

                if (effectiveStatus === 'transferred') {
                    suffix = ' (Transferred)';
                    textClass =
                        'text-gray-400 line-through';
                }

                const name = window.toSentenceCase(
                    (
                        assignee.profiles?.full_name ||
                        assignee.profiles?.email ||
                        'Unknown'
                    ).split('@')[0]
                );

                return `
                    <span class="${textClass}">
                        ${window.escapeHtml(name)}
                        ${suffix}
                    </span>
                `;
            }
        ).join(', ');

        const counts = statusSummary.counts;

        const summaryHtml = `
            <div class="rounded-xl p-3 mb-3 border border-gray-100 bg-gray-50">
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                    <div>
                        ⏳ Awaiting:
                        <b>${counts.pending_ack || 0}</b>
                    </div>

                    <div>
                        ✅ Acknowledged:
                        <b>${counts.acknowledged || 0}</b>
                    </div>

                    <div>
                        ⚙️ Working:
                        <b>${counts.in_progress || 0}</b>
                    </div>

                    <div>
                        📬 Submitted:
                        <b>${counts.submitted || 0}</b>
                    </div>

                    <div>
                        🔄 Rework:
                        <b>${counts.needs_review || 0}</b>
                    </div>

                    <div>
                        🎉 Completed:
                        <b>${counts.accepted || 0}</b>
                    </div>
                </div>

                <div class="mt-2 text-[10px] text-gray-600">
                    Engaged
                    <b>${statusSummary.engagementPct}%</b>
                    ·
                    Completed
                    <b>${statusSummary.completionPct}%</b>
                </div>
            </div>
        `;

        const reviewerName =
            window.escapeHtml(
                window.toSentenceCase(
                    (
                        task.creator?.full_name ||
                        task.creator?.email ||
                        'Unknown'
                    ).split('@')[0]
                )
            );

        const isCreator =
            task.assigned_by ===
            window.currentUser.id;

        const delegateOptions =
            (window.globalUsersCache || [])
                .filter(user =>
                    user.id !==
                        window.currentUser.id &&
                    user.id !==
                        task.assigned_by
                )
                .map(user => {
                    const name =
                        window.toSentenceCase(
                            user.full_name ||
                            user.email?.split('@')[0] ||
                            'Unknown'
                        );

                    return `
                        <option value="${user.id}">
                            ${window.escapeHtml(name)}
                        </option>
                    `;
                })
                .join('');

        const transferOptions =
            (window.globalUsersCache || [])
                .filter(user =>
                    user.id !==
                    window.currentUser.id
                )
                .map(user => {
                    const name =
                        window.toSentenceCase(
                            user.full_name ||
                            user.email?.split('@')[0] ||
                            'Unknown'
                        );

                    return `
                        <option value="${user.id}">
                            ${window.escapeHtml(name)}
                        </option>
                    `;
                })
                .join('');

        let actionsHtml = '';

        const myAssignment =
            taskAssignees.find(
                assignee =>
                    assignee.assignee_id ===
                    window.currentUser.id &&
                    !TASK_CLOSED_STATUSES.has(
                        getEffectiveAssigneeStatus(
                            assignee
                        )
                    )
            );

        if (myAssignment && !allAccepted) {
            const myStatus =
                getEffectiveAssigneeStatus(
                    myAssignment
                );

            const currentUserId =
                window.currentUser.id;

            if (myStatus === 'pending_ack') {
                actionsHtml += `
                    <button
                        id="ack-btn-${task.id}-${currentUserId}"
                        onclick="window.taskAction('${task.id}', '${currentUserId}', 'ack')"
                        class="btn-primary w-full bg-yellow-500 hover:bg-yellow-600 transition-colors px-4 py-2 rounded-lg text-white font-bold"
                    >
                        <i class="fa-solid fa-check-circle"></i>
                        Acknowledge Task
                    </button>
                `;
            }

            else if (myStatus === 'acknowledged') {
                actionsHtml += `
                    <button
                        onclick="window.taskAction('${task.id}', '${currentUserId}', 'start')"
                        class="btn-primary w-full bg-blue-600 hover:bg-blue-700 transition-colors px-4 py-2 rounded-lg text-white font-bold"
                    >
                        <i class="fa-solid fa-play"></i>
                        Start Work
                    </button>
                `;
            }

            else if (
                myStatus === 'in_progress' ||
                myStatus === 'needs_review'
            ) {
                actionsHtml += `
                    <div class="flex flex-wrap gap-2 mb-2">
                        <button
                            onclick="document.getElementById('comment-box-${task.id}-${currentUserId}').classList.toggle('hidden')"
                            class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-bold transition-colors"
                        >
                            <i class="fa-solid fa-comment"></i>
                            Progress Update
                        </button>

                        <button
                            onclick="document.getElementById('upload-box-${task.id}-${currentUserId}').click()"
                            class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
                        >
                            <i class="fa-solid fa-upload"></i>
                            Upload
                        </button>

                        <button
                            onclick="document.getElementById('delegate-box-${task.id}-${currentUserId}').classList.toggle('hidden')"
                            class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-bold transition-colors"
                        >
                            <i class="fa-solid fa-person-arrow-down-to-line"></i>
                            Delegate
                        </button>

                        <button
                            onclick="window.taskAction('${task.id}', '${currentUserId}', 'submit', ${Boolean(task.require_proof)})"
                            class="btn-primary ${
                                myStatus === 'needs_review'
                                    ? 'bg-orange-600'
                                    : 'bg-blue-600'
                            } text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        >
                            <i class="fa-solid fa-paper-plane"></i>
                            Submit for Review
                        </button>
                    </div>

                    <div
                        id="comment-box-${task.id}-${currentUserId}"
                        class="hidden flex-col gap-2 mt-2"
                    >
                        <div
                            class="border rounded-xl overflow-hidden"
                            style="border-color:var(--border-color);"
                        >
                            <div
                                class="flex gap-1 px-2 pt-2 pb-1 border-b flex-wrap"
                                style="border-color:var(--border-color);background:var(--bg-body);"
                            >
                                <button
                                    type="button"
                                    onclick="window.taskFmtCmd('bold','${task.id}-${currentUserId}')"
                                    class="w-6 h-6 rounded text-xs font-black hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Bold"
                                >
                                    <b>B</b>
                                </button>

                                <button
                                    type="button"
                                    onclick="window.taskFmtCmd('italic','${task.id}-${currentUserId}')"
                                    class="w-6 h-6 rounded text-xs font-black hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Italic"
                                >
                                    <i>I</i>
                                </button>

                                <button
                                    type="button"
                                    onclick="window.taskFmtCmd('underline','${task.id}-${currentUserId}')"
                                    class="w-6 h-6 rounded text-xs hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Underline"
                                >
                                    <u>U</u>
                                </button>

                                <span class="w-px bg-gray-200 mx-1 self-stretch"></span>

                                <button
                                    type="button"
                                    onclick="window.taskFmtList('ul','${task.id}-${currentUserId}')"
                                    class="w-6 h-6 rounded text-xs hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Bullet list"
                                >
                                    <i class="fa-solid fa-list-ul"></i>
                                </button>

                                <button
                                    type="button"
                                    onclick="window.taskFmtList('ol','${task.id}-${currentUserId}')"
                                    class="w-6 h-6 rounded text-xs hover:bg-gray-100 flex items-center justify-center transition-colors"
                                    title="Numbered list"
                                >
                                    <i class="fa-solid fa-list-ol"></i>
                                </button>
                            </div>

                            <div
                                id="update-txt-${task.id}-${currentUserId}"
                                contenteditable="true"
                                data-placeholder="Type update..."
                                style="min-height:48px;padding:8px 10px;font-size:12px;outline:none;color:var(--text-primary);background:var(--bg-body);"
                                onkeydown="if(event.key==='Enter'&&event.ctrlKey){window.taskAction('${task.id}','${currentUserId}','update');}"
                            ></div>
                        </div>

                        <div class="flex gap-2 justify-end">
                            <button
                                onclick="document.getElementById('comment-box-${task.id}-${currentUserId}').classList.add('hidden')"
                                class="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>

                            <button
                                onclick="window.taskAction('${task.id}', '${currentUserId}', 'update')"
                                class="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                                style="background:var(--accent);"
                            >
                                Post Update
                            </button>
                        </div>

                        <p
                            class="text-[9px]"
                            style="color:var(--text-secondary);"
                        >
                            Ctrl+Enter to post
                        </p>
                    </div>

                    <input
                        type="file"
                        id="upload-box-${task.id}-${currentUserId}"
                        class="hidden"
                        onchange="window.taskAction('${task.id}', '${currentUserId}', 'upload')"
                    >

                    <div
                        id="upload-progress-container-${task.id}-${currentUserId}"
                        class="hidden w-full mt-2 bg-white p-2 rounded border border-gray-200"
                    >
                        <div class="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                                id="upload-progress-bar-${task.id}-${currentUserId}"
                                class="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style="width:0%;"
                            ></div>
                        </div>

                        <p class="text-[9px] text-gray-500 mt-1 text-center font-bold">
                            Uploading Secure File...
                        </p>
                    </div>

                    <div
                        id="delegate-box-${task.id}-${currentUserId}"
                        class="hidden flex gap-2 mt-2"
                    >
                        <select
                            id="delegate-sel-${task.id}-${currentUserId}"
                            class="ui-input flex-1 text-xs px-2 py-1 rounded"
                        >
                            <option value="">
                                Select user
                            </option>

                            ${delegateOptions}
                        </select>

                        <button
                            onclick="window.taskAction('${task.id}', '${currentUserId}', 'delegate')"
                            class="btn-primary"
                        >
                            Confirm
                        </button>
                    </div>
                `;
            }
        }

        if (isCreator && !allAccepted) {
            const submittedAssignments =
                taskAssignees.filter(
                    assignee =>
                        getEffectiveAssigneeStatus(
                            assignee
                        ) === 'submitted'
                );

            for (
                const submittedAssignment
                of submittedAssignments
            ) {
                const submittedName =
                    window.toSentenceCase(
                        (
                            submittedAssignment
                                .profiles
                                ?.full_name ||
                            submittedAssignment
                                .profiles
                                ?.email ||
                            'Unknown'
                        ).split('@')[0]
                    );

                actionsHtml += `
                    <div class="bg-orange-50 p-2 rounded border border-orange-100 mt-2">
                        <div class="text-xs font-bold text-orange-800 mb-2">
                            Review required for:
                            ${window.escapeHtml(submittedName)}
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                onclick="window.taskAction('${task.id}', '${submittedAssignment.assignee_id}', 'accept')"
                                class="btn-primary bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                                <i class="fa-solid fa-circle-check"></i>
                                Accept
                            </button>

                            <button
                                onclick="document.getElementById('review-box-${task.id}-${submittedAssignment.assignee_id}').classList.toggle('hidden')"
                                class="btn-primary bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                                <i class="fa-solid fa-rotate-left"></i>
                                Return for Changes
                            </button>

                            <button
                                onclick="document.getElementById('transfer-box-${task.id}-${submittedAssignment.assignee_id}').classList.toggle('hidden')"
                                class="btn-outline bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                                <i class="fa-solid fa-arrow-right-arrow-left"></i>
                                Transfer
                            </button>
                        </div>

                        <div
                            id="review-box-${task.id}-${submittedAssignment.assignee_id}"
                            class="hidden flex gap-2 mt-2"
                        >
                            <input
                                type="text"
                                id="review-txt-${task.id}-${submittedAssignment.assignee_id}"
                                placeholder="Mandatory feedback..."
                                class="ui-input flex-1 text-xs px-2 py-1 rounded border border-red-300"
                            >

                            <button
                                onclick="window.taskAction('${task.id}', '${submittedAssignment.assignee_id}', 'review_again')"
                                class="btn-primary bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                                Return
                            </button>
                        </div>

                        <div
                            id="transfer-box-${task.id}-${submittedAssignment.assignee_id}"
                            class="hidden flex flex-col gap-2 mt-2"
                        >
                            <select
                                id="transfer-sel-${task.id}-${submittedAssignment.assignee_id}"
                                class="ui-input flex-1 text-xs px-2 py-1.5 rounded"
                            >
                                <option value="">
                                    Select replacement
                                </option>

                                ${transferOptions}
                            </select>

                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    id="transfer-txt-${task.id}-${submittedAssignment.assignee_id}"
                                    placeholder="Mandatory reason..."
                                    class="ui-input flex-1 text-xs px-2 py-1 rounded border border-orange-300"
                                >

                                <button
                                    onclick="window.taskAction('${task.id}', '${submittedAssignment.assignee_id}', 'transfer')"
                                    class="btn-primary bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        const trailHtml =
            window.renderProfessionalTrail
                ? window.renderProfessionalTrail(
                    taskTrails
                )
                : taskTrails.map(
                    (trail, index) => {
                        const trailUser =
                            '#' +
                            (
                                taskTrails.length -
                                index
                            ) +
                            ' · ' +
                            window.toSentenceCase(
                                (
                                    trail.profiles
                                        ?.full_name ||
                                    trail.profiles
                                        ?.email ||
                                    'System'
                                ).split('@')[0]
                            );

                        const trailTime =
                            window.getISTTime(
                                trail.created_at
                            );

                        let content = '';

                        if (trail.action === 'FILE') {
                            let fileName =
                                trail.comment ||
                                '';

                            let filePath =
                                trail.comment ||
                                '';

                            if (
                                trail.comment &&
                                trail.comment.includes('|')
                            ) {
                                const parts =
                                    trail.comment.split('|');

                                fileName =
                                    parts[0];

                                filePath =
                                    parts[1];
                            }

                            content = `
                                <span
                                    style="cursor:pointer;text-decoration:underline;color:blue;"
                                    onclick="window.openSecureFile('${window.escapeHtml(filePath)}')"
                                >
                                    ${window.escapeHtml(fileName)}
                                </span>
                            `;
                        } else {
                            content =
                                `${window.escapeHtml(trail.action || '')}` +
                                (
                                    trail.comment
                                        ? ` — ${window.escapeHtml(trail.comment)}`
                                        : ''
                                );
                        }

                        return `
                            <div class="text-[12px] leading-snug border-l-2 border-indigo-200 pl-2 ml-1 mb-2.5">
                                <span class="text-gray-400 text-[10px]">
                                    [${trailTime}]
                                </span>

                                <span class="font-bold text-gray-800">
                                    ${window.escapeHtml(trailUser)}
                                </span>

                                <div class="mt-0.5">
                                    ${content}
                                </div>
                            </div>
                        `;
                    }
                ).join('');

        const cardOpacity =
            globalState === 'accepted'
                ? '0.6'
                : '1';

        return `
            <div
                class="jira-card bg-white rounded-2xl shadow-sm border border-gray-200 mb-4 overflow-hidden relative"
                data-task-id="${task.id}"
                style="
                    border-left-width:6px;
                    border-left-style:solid;
                    border-left-color:${borderColor};
                    opacity:${cardOpacity};
                    transition:opacity 0.3s;
                "
            >
                <div class="p-4">
                    <div class="flex justify-between items-start mb-3">
                        <div class="font-bold text-gray-800 text-[16px] flex items-start gap-2">
                            <i class="fa-solid fa-thumbtack text-gray-400 mt-1"></i>
                            ${window.escapeHtml(task.title)}
                        </div>

                        <button
                            onclick="window.downloadTaskPDF('${task.id}')"
                            title="Download PDF Audit Report"
                            class="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-gray-100"
                        >
                            <i class="fa-solid fa-file-pdf text-lg"></i>
                        </button>
                    </div>

                    <div class="text-[12px] text-gray-700 space-y-1.5 mb-4">
                        <div>
                            👥
                            <span class="font-semibold text-gray-900">
                                Assignees:
                            </span>

                            ${assigneeNames || 'None'}
                        </div>

                        <div>
                            👑
                            <span class="font-semibold text-gray-900">
                                Created by:
                            </span>

                            ${reviewerName}
                        </div>

                        <div>
                            📅
                            <span class="font-semibold text-gray-900">
                                Deadline:
                            </span>

                            ${deadlineHtml}
                        </div>

                        <div>
                            ⚡
                            <span class="font-semibold text-gray-900">
                                Priority:
                            </span>

                            ${window.escapeHtml(task.priority || 'Normal')}
                        </div>

                        <div class="mt-2 flex items-center gap-2">
                            🏷️

                            <span class="font-semibold text-gray-900">
                                Status:
                            </span>

                            <span class="badge ${badgeClass}">
                                ${badgeText}
                            </span>
                        </div>
                    </div>

                    ${summaryHtml}

                    ${
                        actionsHtml
                            ? `
                                <div class="border-t border-gray-100 pt-3 pb-1">
                                    ${actionsHtml}
                                </div>
                            `
                            : ''
                    }

                    <div class="mt-2 pt-3 border-t border-gray-100">
                        <button
                            onclick="window.toggleTrail('${task.id}')"
                            class="text-[12px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors w-full text-left"
                        >
                            <i class="fa-solid fa-history"></i>

                            Audit Trail
                            (${taskTrails.length})

                            <i
                                class="fa-solid fa-chevron-down ml-auto"
                                style="transition:transform 0.3s;"
                            ></i>
                        </button>

                        <div
                            id="trail-${task.id}"
                            class="task-trail-box mt-3 space-y-1 max-h-96 overflow-y-auto"
                            style="display:none;"
                        >
                            ${trailHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};
