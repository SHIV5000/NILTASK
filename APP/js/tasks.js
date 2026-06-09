import { sb } from './config.js';
import { currentUser } from './state.js';
import { escapeHtml } from './utils.js';
import { showToast } from './notifications.js';
import { loadBookmarks } from './bookmarks.js'; // optional

let currentMessageId = null;

export async function ensureProfile() {
    // called from auth after login
    if (!currentUser) return;
    const { data: existing } = await sb
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();
    if (!existing) {
        await sb.from('profiles').insert({
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.email.split('@')[0],
            role: 'teacher'
        });
    }
}

export async function openTaskModal(messageId, messageText) {
    currentMessageId = messageId;
    const modal = document.getElementById('taskModal');
    document.getElementById('taskTitle').value = messageText.substring(0, 100);
    document.getElementById('taskDeadline').value = '';
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskRequireProof').checked = false;
    const { data: users, error } = await sb.from('profiles').select('id, email, full_name');
    if (!error && users) {
        const select = document.getElementById('taskAssignees');
        select.innerHTML = users.map(u => `<option value="${u.id}">${u.full_name || u.email}</option>`).join('');
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeTaskModal() {
    const modal = document.getElementById('taskModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentMessageId = null;
}

export async function saveTaskMultiAssignee() {
    if (!currentMessageId) return;
    const title = document.getElementById('taskTitle').value;
    const assigneeIds = Array.from(document.getElementById('taskAssignees').selectedOptions).map(opt => opt.value);
    const deadline = document.getElementById('taskDeadline').value;
    const priority = document.getElementById('taskPriority').value;
    const requireProof = document.getElementById('taskRequireProof').checked;
    if (!title || assigneeIds.length === 0) {
        alert('Please provide title and at least one assignee');
        return;
    }
    const { data: task, error: taskError } = await sb.from('tasks').insert({
        original_message_id: currentMessageId,
        title: title,
        assigned_by: currentUser.id,
        deadline: deadline || null,
        priority: priority,
        require_proof: requireProof,
        status: 'pending'
    }).select().single();
    if (taskError) {
        alert('Failed to create task: ' + taskError.message);
        return;
    }
    const assigneeInserts = assigneeIds.map(assigneeId => ({
        task_id: task.id,
        assignee_id: assigneeId,
        status: 'pending_ack'
    }));
    const { error: assigneeError } = await sb.from('task_assignees').insert(assigneeInserts);
    if (assigneeError) {
        alert('Failed to assign users: ' + assigneeError.message);
        await sb.from('tasks').delete().eq('id', task.id);
        return;
    }
    alert('Task created with ' + assigneeIds.length + ' assignee(s)!');
    closeTaskModal();
    loadTasks(); // defined below
}

export async function addTaskTrail(taskId, action, comment, fileUrl = null) {
    await sb.from('task_trails').insert({
        task_id: taskId,
        user_id: currentUser.id,
        action: action,
        comment: comment,
        file_url: fileUrl
    });
}

export async function loadTaskTrail(taskId) {
    const { data: trails, error } = await sb
        .from('task_trails')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
    if (error || !trails || trails.length === 0) return;
    const trailContainer = document.getElementById(`trail-${taskId}`);
    if (trailContainer) {
        trailContainer.innerHTML = trails.map(t => {
            let line = `${new Date(t.created_at).toLocaleString()} - ${t.action}: ${t.comment || ''}`;
            if (t.file_url) line += ` <a href="${t.file_url}" target="_blank" class="text-blue-500">[file]</a>`;
            return `<div>${escapeHtml(line)}</div>`;
        }).join('');
        trailContainer.classList.remove('hidden');
    }
}

export async function performAssigneeAction(taskId, assigneeId, action) {
    let newStatus = '';
    let comment = '';
    switch (action) {
        case 'ack': newStatus = 'in_progress'; comment = 'acknowledged task'; break;
        case 'submit': newStatus = 'submitted'; comment = 'submitted for review'; break;
        case 'accept': newStatus = 'accepted'; comment = 'accepted by creator'; break;
        case 'review_again': newStatus = 'needs_review'; comment = 'needs rework (creator)'; break;
        default: return;
    }
    const { error } = await sb.from('task_assignees').update({ status: newStatus }).eq('task_id', taskId).eq('assignee_id', assigneeId);
    if (error) {
        alert('Action failed: ' + error.message);
        return;
    }
    await addTaskTrail(taskId, comment, `User ${assigneeId} - ${comment}`);
    loadTasks();
}

export async function loadTasks() {
    const { data: tasks, error: tasksError } = await sb
        .from('tasks')
        .select(`*, creator:profiles!assigned_by(full_name, email)`)
        .order('created_at', { ascending: false });
    if (tasksError) {
        console.error(tasksError);
        document.getElementById('tasksList').innerHTML = '<div class="text-red-500">Error loading tasks</div>';
        return;
    }
    if (!tasks || tasks.length === 0) {
        renderTasks([]);
        return;
    }
    const taskIds = tasks.map(t => t.id);
    const { data: assignees, error: assigneesError } = await sb
        .from('task_assignees')
        .select(`task_id, assignee_id, status, profiles!assignee_id(full_name, email)`)
        .in('task_id', taskIds);
    const assigneesMap = {};
    if (assignees) {
        assignees.forEach(ass => {
            if (!assigneesMap[ass.task_id]) assigneesMap[ass.task_id] = [];
            assigneesMap[ass.task_id].push({
                assignee_id: ass.assignee_id,
                status: ass.status,
                profiles: ass.profiles
            });
        });
    }
    const filteredTasks = tasks.filter(task => {
        const isCreator = task.assigned_by === currentUser.id;
        const isAssignee = assigneesMap[task.id]?.some(a => a.assignee_id === currentUser.id);
        return isCreator || isAssignee;
    });
    const tasksWithAssignees = filteredTasks.map(task => ({
        ...task,
        assignees: assigneesMap[task.id] || []
    }));
    renderTasks(tasksWithAssignees);
}

function renderTasks(tasks) {
    const container = document.getElementById('tasksList');
    if (!container) return;
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-center p-4">No tasks yet</div>';
        return;
    }
    container.innerHTML = tasks.map(task => {
        const isCreator = task.assigned_by === currentUser.id;
        const assignees = task.assignees || [];
        const allAccepted = assignees.length > 0 && assignees.every(a => a.status === 'accepted');
        const borderClass = allAccepted ? 'border-green-500 border-2' : 'border';
        const assigneeHtml = assignees.map(ass => {
            const assigneeName = ass.profiles?.full_name || ass.profiles?.email || 'Unknown';
            const status = ass.status;
            const statusColors = {
                pending_ack: 'bg-yellow-100 text-yellow-800',
                in_progress: 'bg-blue-100 text-blue-800',
                submitted: 'bg-purple-100 text-purple-800',
                accepted: 'bg-green-100 text-green-800',
                needs_review: 'bg-red-100 text-red-800'
            };
            const statusColor = statusColors[status] || 'bg-gray-100';
            let actionButtons = '';
            if (ass.assignee_id === currentUser.id) {
                if (status === 'pending_ack') {
                    actionButtons = `<button data-task-id="${task.id}" data-assignee-id="${ass.assignee_id}" data-action="ack" class="task-assignee-action bg-green-500 text-white text-xs px-2 py-1 rounded mt-1">Acknowledge</button>`;
                } else if (status === 'in_progress' || status === 'needs_review') {
                    actionButtons = `<button data-task-id="${task.id}" data-assignee-id="${ass.assignee_id}" data-action="submit" class="task-assignee-action bg-blue-500 text-white text-xs px-2 py-1 rounded mt-1">Submit for Review</button>`;
                }
            } else if (isCreator && status === 'submitted') {
                actionButtons = `
                    <button data-task-id="${task.id}" data-assignee-id="${ass.assignee_id}" data-action="accept" class="task-assignee-action bg-green-500 text-white text-xs px-2 py-1 rounded mt-1">Accept</button>
                    <button data-task-id="${task.id}" data-assignee-id="${ass.assignee_id}" data-action="review_again" class="task-assignee-action bg-red-500 text-white text-xs px-2 py-1 rounded mt-1">Review Again</button>
                `;
            }
            return `
                <div class="flex justify-between items-center border-b py-1 text-xs">
                    <span>${escapeHtml(assigneeName)}</span>
                    <span class="px-2 py-0.5 rounded-full ${statusColor}">${status.replace('_', ' ')}</span>
                    ${actionButtons ? `<div>${actionButtons}</div>` : ''}
                </div>
            `;
        }).join('');
        let updateFormHtml = '';
        const myAssignee = assignees.find(a => a.assignee_id === currentUser.id);
        if (myAssignee && (myAssignee.status === 'in_progress' || myAssignee.status === 'needs_review')) {
            updateFormHtml = `
                <div class="mt-3 border-t pt-2">
                    <textarea id="comment-${task.id}" placeholder="Add progress update..." class="w-full text-xs border rounded p-1" rows="2"></textarea>
                    <div class="flex gap-2 mt-1">
                        <input type="file" id="file-${task.id}" class="text-xs">
                        <button data-task-id="${task.id}" class="task-update-btn bg-indigo-500 text-white text-xs px-2 py-1 rounded">Add Update</button>
                    </div>
                </div>
            `;
        }
        return `
            <div class="rounded-lg p-3 bg-white shadow-sm ${borderClass}" data-task-id="${task.id}">
                <div class="font-semibold text-sm">${escapeHtml(task.title)}</div>
                <div class="text-xs text-gray-500 mt-1">Creator: ${task.creator?.full_name || task.creator?.email || 'Unknown'}</div>
                ${task.deadline ? `<div class="text-xs text-gray-500">Deadline: ${new Date(task.deadline).toLocaleDateString()}</div>` : ''}
                <div class="mt-2 text-xs font-semibold">Assignees:</div>
                <div class="space-y-1">${assigneeHtml || '<div class="text-xs text-gray-400">No assignees</div>'}</div>
                ${updateFormHtml}
                <div id="trail-${task.id}" class="mt-2 text-xs text-gray-500 max-h-24 overflow-y-auto border-t pt-1 hidden"></div>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.task-assignee-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = btn.dataset.taskId;
            const assigneeId = btn.dataset.assigneeId;
            const action = btn.dataset.action;
            await performAssigneeAction(taskId, assigneeId, action);
        });
    });
    document.querySelectorAll('.task-update-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const taskId = btn.dataset.taskId;
            const comment = document.getElementById(`comment-${taskId}`)?.value.trim() || '';
            const fileInput = document.getElementById(`file-${taskId}`);
            let fileUrl = null;
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const fileName = `${taskId}_${Date.now()}_${file.name}`;
                const { error } = await sb.storage.from('task-proofs').upload(fileName, file);
                if (error) {
                    alert('File upload failed: ' + error.message);
                    return;
                }
                const { data: { publicUrl } } = sb.storage.from('task-proofs').getPublicUrl(fileName);
                fileUrl = publicUrl;
            }
            if (comment || fileUrl) {
                await addTaskTrail(taskId, 'update', comment, fileUrl);
                if (document.getElementById(`comment-${taskId}`)) document.getElementById(`comment-${taskId}`).value = '';
                if (fileInput) fileInput.value = '';
                loadTasks();
            } else {
                alert('Please enter a comment or select a file');
            }
        });
    });
    tasks.forEach(task => loadTaskTrail(task.id));
}

export function subscribeToTasks() {
    if (taskSubscription) taskSubscription.unsubscribe();
    const sub = sb
        .channel('tasks-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => loadTasks())
        .subscribe();
    setTaskSubscription(sub);
}

export function subscribeToAssignees() {
    if (assigneeSubscription) assigneeSubscription.unsubscribe();
    const sub = sb
        .channel('assignees-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, () => loadTasks())
        .subscribe();
    setAssigneeSubscription(sub);
}

export function subscribeToTrails() {
    if (trailSubscription) trailSubscription.unsubscribe();
    const sub = sb
        .channel('trails-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_trails' }, () => loadTasks())
        .subscribe();
    setTrailSubscription(sub);
}