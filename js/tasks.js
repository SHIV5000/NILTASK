// js/tasks.js
import { sb } from './shared.js';

/* ========================================================================================= */
/* 🔒 LOCKED BLOCK START: TASK UI RENDERING & LOGIC 🔒                                       */
/* AI & USER INSTRUCTION: DO NOT TOUCH, MODIFY, OR TRUNCATE THIS BLOCK UNDER ANY CIRCUMSTANCES */
/* UNLESS EXPLICITLY INSTRUCTED BY THE USER TO DO SO.                                          */
/* ========================================================================================= */

window.saveTaskMultiAssignee = async function() { 
    const title = document.getElementById('taskTitle').value; 
    const aids = Array.from(document.querySelectorAll('.assignee-cb:checked')).map(cb => cb.value);
    if(!title || !aids.length) return window.showCenterToast('Need Title and Assignee', 'fa-solid fa-times', 'text-red-500'); 
    
    const {data: task, error: tErr} = await sb.from('tasks').insert({ 
        original_message_id: window.currentMessageId, 
        title, 
        assigned_by: window.currentUser.id, 
        deadline: document.getElementById('taskDeadline').value || null, 
        priority: document.getElementById('taskPriority').value,
        require_proof: document.getElementById('taskRequireProof').checked,
        status: 'pending' 
    }).select().single(); 
    
    if(tErr || !task) {
        console.error(tErr); return window.showCenterToast('Failed to create task.', 'fa-solid fa-times', 'text-red-500');
    }
    
    await sb.from('task_assignees').insert(aids.map(aid => ({ task_id: task.id, assignee_id: aid, status: 'pending_ack', state: 'pending' }))); 
    await sb.from('task_trails').insert({ task_id: task.id, user_id: window.currentUser.id, action: 'UPDATE', comment: 'Task Created' });
    
    for(let aid of aids) {
        await sb.from('notifications').insert({ user_id: aid, message: `New Task Allotted: ${title}`, created_at: new Date().toISOString() });
    }

    window.showCenterToast('Ticket Created Successfully'); 
    window.closeTaskModal(); 
    window.loadTasksForPanel(); 
}

window.taskAction = async function(taskId, assigneeId, action, requireProof = false) {
    let actionText = ''; let newStatus = ''; let comment = '';
    
    if (action === 'ack') {
        const btn = document.getElementById(`ack-btn-${taskId}-${assigneeId}`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acknowledging...'; }
    }

    const {data: taskData} = await sb.from('tasks').select('*').eq('id', taskId).single();
    const creatorId = taskData.assigned_by;

    const notifyUser = async (userId, message) => { await sb.from('notifications').insert({ user_id: userId, message: message, created_at: new Date().toISOString() }); };

    if (action === 'ack') {
        newStatus = 'in_progress'; actionText = 'UPDATE'; comment = 'Acknowledged the task';
        await notifyUser(creatorId, `Task Acknowledged by an Assignee`);
    } else if (action === 'update') {
        const el = document.getElementById(`update-txt-${taskId}-${assigneeId}`);
        comment = el.value;
        if(!comment) return window.showCenterToast('Comment cannot be empty', 'fa-solid fa-times', 'text-red-500');
        actionText = 'UPDATE';
        await notifyUser(creatorId, `Task Update Added`);
        el.value = '';
        document.getElementById(`comment-box-${taskId}-${assigneeId}`).classList.add('hidden');
    } else if (action === 'upload') {
        const el = document.getElementById(`upload-box-${taskId}-${assigneeId}`);
        if(!el.files.length) return window.showCenterToast('Select a file', 'fa-solid fa-times', 'text-red-500');
        
        const file = el.files[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filePath = `tasks/${taskId}/${Date.now()}_${safeName}`;

        const progressContainer = document.getElementById(`upload-progress-container-${taskId}-${assigneeId}`);
        const progressBar = document.getElementById(`upload-progress-bar-${taskId}-${assigneeId}`);
        
        if (progressContainer && progressBar) {
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '30%';
        }
        
        const { error: uploadErr } = await sb.storage.from('task-proofs').upload(filePath, file);
        
        if (uploadErr) {
            if(progressContainer) progressContainer.classList.add('hidden');
            return window.showCenterToast('Upload Failed: ' + uploadErr.message, 'fa-solid fa-times', 'text-red-500');
        }

        if (progressContainer && progressBar) progressBar.style.width = '100%';
        
        actionText = 'FILE'; 
        comment = `${file.name}|${filePath}`; 
        await notifyUser(creatorId, `File Uploaded on Task`);
        el.value = '';
        if(progressContainer) {
            setTimeout(() => { progressContainer.classList.add('hidden'); progressBar.style.width='0%'; }, 500);
        }
    } else if (action === 'submit') {
        if (requireProof) {
            const {data: trails} = await sb.from('task_trails').select('*').eq('task_id', taskId).eq('user_id', window.currentUser.id).eq('action', 'FILE');
            if(!trails || trails.length === 0) return window.showCenterToast('Proof required - please attach a file.', 'fa-solid fa-exclamation-triangle', 'text-red-500');
        }
        newStatus = 'submitted'; actionText = 'UPDATE'; comment = 'Submitted for Review';
        await notifyUser(creatorId, `Task Submitted for Review`);
    } else if (action === 'accept') {
        newStatus = 'accepted'; actionText = 'UPDATE'; comment = 'Accepted completion';
        await notifyUser(assigneeId, `Your task submission was Accepted`);
    } else if (action === 'review_again') {
        const txtEl = document.getElementById(`review-txt-${taskId}-${assigneeId}`);
        comment = txtEl ? txtEl.value : '';
        if(!comment) return window.showCenterToast('Feedback is mandatory for rework!', 'fa-solid fa-times', 'text-red-500');
        newStatus = 'needs_review'; actionText = 'UPDATE';
        await notifyUser(assigneeId, `Task needs review/rework`);
        document.getElementById(`review-box-${taskId}-${assigneeId}`).classList.add('hidden');
    } else if (action === 'delegate') {
        const newAssignee = document.getElementById(`delegate-sel-${taskId}-${assigneeId}`).value;
        if(!newAssignee) return window.showCenterToast('Select user to delegate', 'fa-solid fa-times', 'text-red-500');
        actionText = 'UPDATE'; comment = 'Delegated task';
        await sb.from('task_assignees').insert({ task_id: taskId, assignee_id: newAssignee, status: 'pending_ack', state: 'pending' });
        await notifyUser(newAssignee, `A task was delegated to you`); await notifyUser(creatorId, `Task was delegated`);
        document.getElementById(`delegate-box-${taskId}-${assigneeId}`).classList.add('hidden');
    } else if (action === 'transfer') {
        const newAssignee = document.getElementById(`transfer-sel-${taskId}-${assigneeId}`).value;
        const txtEl = document.getElementById(`transfer-txt-${taskId}-${assigneeId}`);
        comment = txtEl ? txtEl.value : '';
        if(!newAssignee) return window.showCenterToast('Select user to transfer', 'fa-solid fa-times', 'text-red-500');
        if(!comment) return window.showCenterToast('Reason is mandatory for transfer!', 'fa-solid fa-times', 'text-red-500');
        actionText = 'UPDATE';
        await sb.from('task_assignees').delete().eq('task_id', taskId).eq('assignee_id', assigneeId);
        await sb.from('task_assignees').insert({ task_id: taskId, assignee_id: newAssignee, status: 'pending_ack', state: 'pending' });
        await notifyUser(newAssignee, `A task was transferred to you`); await notifyUser(assigneeId, `Your task was transferred`);
    }

    if (newStatus) { 
        let updatePayload = { status: newStatus, state: newStatus }; 
        if (action === 'ack') updatePayload.acked = true;
        
        const {data: updatedData, error} = await sb.from('task_assignees').update(updatePayload).eq('task_id', taskId).eq('assignee_id', assigneeId).select(); 
        
        if (error || !updatedData || updatedData.length === 0) {
            window.showCenterToast('Database Blocked Status Update! Run RLS SQL Fix.', 'fa-solid fa-lock', 'text-red-500');
            if(action === 'ack') {
                const btn = document.getElementById(`ack-btn-${taskId}-${assigneeId}`);
                if(btn) { btn.disabled = false; btn.innerHTML = 'Acknowledge Task'; }
            }
            return;
        }
    }
    await sb.from('task_trails').insert({ task_id: taskId, user_id: window.currentUser.id, action: actionText, comment: comment }); 
    window.loadTasksForPanel(); 
}

window.toggleTrail = function(taskId) {
    const box = document.getElementById(`trail-${taskId}`);
    if(box) box.classList.toggle('active');
}

window.loadTasksForPanel = async function() {
    const {data: tasks} = await sb.from('tasks').select('*, creator:profiles!assigned_by(full_name, email)').order('created_at', {ascending: false});
    if (!tasks) return;
    
    const ids = tasks.map(t => t.id);
    if(ids.length === 0) { document.getElementById('tasksPanel').innerHTML = '<p class="text-sm opacity-50 text-center mt-6"><i class="fa-solid fa-inbox text-3xl mb-2 block"></i> No tasks active.</p>'; return; }

    const {data: assignees} = await sb.from('task_assignees').select('task_id, assignee_id, status, profiles!assignee_id(full_name, email)').in('task_id', ids);
    const {data: trails} = await sb.from('task_trails').select('*, profiles(full_name, email)').in('task_id', ids).order('created_at', {ascending: true});

    const assigneesMap = {};
    if (assignees) assignees.forEach(a => { if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = []; assigneesMap[a.task_id].push({ assignee_id: a.assignee_id, status: a.status, profiles: a.profiles }); });
    
    const trailsMap = {};
    if (trails) trails.forEach(t => { if (!trailsMap[t.task_id]) trailsMap[t.task_id] = []; trailsMap[t.task_id].push(t); });

    const filterVal = document.getElementById('taskFilter') ? document.getElementById('taskFilter').value : 'all';
    const startDate = document.getElementById('filterStartDate') ? document.getElementById('filterStartDate').value : null;
    const endDate = document.getElementById('filterEndDate') ? document.getElementById('filterEndDate').value : null;

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    let filteredTasks = tasks.filter(t => t.assigned_by === window.currentUser.id || (assigneesMap[t.id] && assigneesMap[t.id].some(a => a.assignee_id === window.currentUser.id)));
    
    if (filterVal !== 'all') {
        filteredTasks = filteredTasks.filter(task => {
            const asgList = assigneesMap[task.id] || [];
            const myAss = asgList.find(a => a.assignee_id === window.currentUser.id);
            const isCreator = task.assigned_by === window.currentUser.id;
            const activeAssignees = asgList.filter(a => a.status !== 'delegated' && a.status !== 'transferred');
            const allAccepted = activeAssignees.length > 0 && activeAssignees.every(a => a.status === 'accepted');
            const taskCreatedDate = new Date(task.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            
            switch(filterVal) {
                case 'today': return taskCreatedDate === todayStr;
                case 'completed': return allAccepted;
                case 'pending': return !allAccepted;
                case 'allotted_by_me': return isCreator;
                case 'allotted_to_me': return !!myAss && !isCreator;
                case 'delegated': return asgList.some(a => a.status === 'delegated' && a.assignee_id === window.currentUser.id);
                case 'transferred': return asgList.some(a => a.status === 'transferred' && a.assignee_id === window.currentUser.id);
                case 'date_range':
                    if(startDate && endDate) return taskCreatedDate >= startDate && taskCreatedDate <= endDate;
                    return true;
                default: return true;
            }
        });
    }

    const container = document.getElementById('tasksPanel');
    if(!container) return;
    if(!filteredTasks.length) { container.innerHTML = '<p class="text-sm opacity-50 text-center mt-6"><i class="fa-solid fa-inbox text-3xl mb-2 block"></i> No tasks active.</p>'; return; }

    container.innerHTML = filteredTasks.map(task => {
        const asgList = assigneesMap[task.id] || [];
        const trlList = trailsMap[task.id] || [];
        
        const activeAssignees = asgList.filter(a => a.status !== 'delegated' && a.status !== 'transferred');
        const allAccepted = activeAssignees.length > 0 && activeAssignees.every(a => a.status === 'accepted');
        
        let globalState = 'pending_ack';
        if (asgList.length > 0) {
            const statuses = asgList.map(a => a.status);
            if (statuses.every(s => s === 'accepted' || s === 'transferred')) globalState = 'accepted';
            else if (statuses.includes('submitted')) globalState = 'submitted';
            else if (statuses.includes('needs_review')) globalState = 'needs_review';
            else if (statuses.includes('in_progress')) globalState = 'in_progress';
        }

        let badgeClass = 'badge-pending'; let badgeText = '⏳ Needs Ack';
        let borderClass = '#ea580c'; 

        if(globalState==='in_progress') { badgeClass = 'badge-progress'; badgeText = '⚙️ In Progress'; }
        if(globalState==='submitted') { badgeClass = 'badge-review'; badgeText = '📬 Pending Review'; }
        if(globalState==='needs_review') { badgeClass = 'badge-changes'; badgeText = '🔄 Changes Needed'; borderClass = '#dc2626'; }
        if(globalState==='accepted') { badgeClass = 'badge-done'; badgeText = '🎉 Done'; borderClass = '#166534'; } 
        if(globalState==='transferred' || asgList.every(a => a.status==='transferred')) { borderClass = '#dc2626'; } 

        let deadlineHtml = task.deadline ? window.getISTDate(task.deadline) : 'None';
        if (task.deadline) {
            let d = new Date(task.deadline);
            d.setHours(23,59,59,999);
            if (d < new Date() && globalState !== 'accepted') {
                deadlineHtml = `<span class="text-red-600 font-bold bg-red-50 px-1 rounded">${deadlineHtml} ⚠️ Overdue</span>`;
                borderClass = '#800000'; 
            }
        }

        const assigneesNames = asgList.map(a => {
            let suffix = '';
            let colorCls = 'text-gray-800';
            if(a.status === 'submitted') suffix = ' (Submitted)';
            else if(a.status === 'accepted') { suffix = ' (Completed)'; colorCls = 'text-[#166534] font-bold'; }
            return `<span class="${colorCls}">${window.escapeHtml(window.toSentenceCase((a.profiles?.full_name || a.profiles?.email || 'Unknown').split('@')[0]))}${suffix}</span>`;
        }).join(', ');
        const reviewerName = window.escapeHtml(window.toSentenceCase((task.creator?.full_name || task.creator?.email || 'Unknown').split('@')[0]));
        const isCreator = task.assigned_by === window.currentUser.id;

        const delegateOptions = window.globalUsersCache.filter(u => u.id !== window.currentUser.id && u.id !== task.assigned_by).map(u => `<option value="${u.id}">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</option>`).join('');
        const transferOptions = window.globalUsersCache.filter(u => u.id !== window.currentUser.id).map(u => `<option value="${u.id}">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</option>`).join('');

        let actionsHtml = '';
        const myAss = asgList.find(a => a.assignee_id === window.currentUser.id);
        
        if (myAss && !allAccepted) {
            const st = myAss.status;
            const uId = window.currentUser.id;
            if (st === 'pending_ack') {
                actionsHtml += `<button id="ack-btn-${task.id}-${uId}" onclick="window.taskAction('${task.id}', '${uId}', 'ack')" class="btn-primary w-full bg-yellow-500 hover:bg-yellow-600 transition-colors">Acknowledge Task</button>`;
            } else if (st === 'in_progress' || st === 'needs_review') {
                actionsHtml += `
                    <div class="flex flex-wrap gap-2 mb-2">
                        <button onclick="document.getElementById('comment-box-${task.id}-${uId}').classList.toggle('hidden')" class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors border border-indigo-100"><i class="fa-solid fa-edit"></i> Update</button>
                        <button onclick="document.getElementById('upload-box-${task.id}-${uId}').click()" class="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors border border-emerald-100"><i class="fa-solid fa-paperclip"></i> Upload</button>
                        <button onclick="document.getElementById('delegate-box-${task.id}-${uId}').classList.toggle('hidden')" class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold transition-colors border border-purple-100"><i class="fa-solid fa-user-plus"></i> Delegate</button>
                        <button onclick="window.taskAction('${task.id}', '${uId}', 'submit', ${task.require_proof})" class="btn-primary ${st==='needs_review'?'bg-orange-600':'bg-blue-600'} text-white ml-auto">${st==='needs_review'?'Resubmit':'Submit for Review'}</button>
                    </div>
                    
                    <div id="comment-box-${task.id}-${uId}" class="hidden flex gap-2 mt-2">
                        <input type="text" id="update-txt-${task.id}-${uId}" placeholder="Type update..." class="ui-input flex-1 text-xs px-2 py-1 rounded">
                        <button onclick="window.taskAction('${task.id}', '${uId}', 'update')" class="btn-primary">Post</button>
                    </div>
                    
                    <input type="file" id="upload-box-${task.id}-${uId}" class="hidden" onchange="window.taskAction('${task.id}', '${uId}', 'upload')">
                    
                    <div id="upload-progress-container-${task.id}-${uId}" class="hidden w-full mt-2 bg-white p-2 rounded border border-gray-200">
                        <div class="w-full bg-gray-200 rounded-full h-1.5"><div id="upload-progress-bar-${task.id}-${uId}" class="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div></div>
                        <p class="text-[9px] text-gray-500 mt-1 text-center font-bold">Uploading Secure File...</p>
                    </div>

                    <div id="delegate-box-${task.id}-${uId}" class="hidden flex gap-2 mt-2">
                        <select id="delegate-sel-${task.id}-${uId}" class="ui-input flex-1 text-xs px-2 py-1 rounded">${delegateOptions}</select>
                        <button onclick="window.taskAction('${task.id}', '${uId}', 'delegate')" class="btn-primary">Confirm</button>
                    </div>
                `;
            }
        }

        if (isCreator && !allAccepted) {
            const submittedAss = asgList.filter(a => a.status === 'submitted');
            submittedAss.forEach(sa => {
                const sName = window.toSentenceCase((sa.profiles?.full_name || sa.profiles?.email || 'Unknown').split('@')[0]);
                actionsHtml += `
                    <div class="bg-orange-50 p-2 rounded border border-orange-100 mt-2">
                        <div class="text-xs font-bold text-orange-800 mb-2">Review required for: ${window.escapeHtml(sName)}</div>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="window.taskAction('${task.id}', '${sa.assignee_id}', 'accept')" class="btn-primary bg-green-600 hover:bg-green-700 text-white">Accept</button>
                            <button onclick="document.getElementById('review-box-${task.id}-${sa.assignee_id}').classList.toggle('hidden')" class="btn-primary bg-red-600 hover:bg-red-700 text-white">Review Again</button>
                            <button onclick="document.getElementById('transfer-box-${task.id}-${sa.assignee_id}').classList.toggle('hidden')" class="btn-outline bg-white border border-gray-300 hover:bg-gray-50">Transfer</button>
                        </div>
                        <div id="review-box-${task.id}-${sa.assignee_id}" class="hidden flex gap-2 mt-2">
                            <input type="text" id="review-txt-${task.id}-${sa.assignee_id}" placeholder="Mandatory feedback..." class="ui-input flex-1 text-xs px-2 py-1 rounded border border-red-300">
                            <button onclick="window.taskAction('${task.id}', '${sa.assignee_id}', 'review_again')" class="btn-primary bg-red-600 hover:bg-red-700">Submit</button>
                        </div>
                        <div id="transfer-box-${task.id}-${sa.assignee_id}" class="hidden flex flex-col gap-2 mt-2">
                            <select id="transfer-sel-${task.id}-${sa.assignee_id}" class="ui-input flex-1 text-xs px-2 py-1.5 rounded">${transferOptions}</select>
                            <div class="flex gap-2">
                                <input type="text" id="transfer-txt-${task.id}-${sa.assignee_id}" placeholder="Mandatory reason..." class="ui-input flex-1 text-xs px-2 py-1 rounded border border-orange-300">
                                <button onclick="window.taskAction('${task.id}', '${sa.assignee_id}', 'transfer')" class="btn-primary bg-orange-600 hover:bg-orange-700 text-white">Confirm</button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        const trailRows = trlList.map(t => {
            const tName = window.toSentenceCase((t.profiles?.full_name || t.profiles?.email || 'System').split('@')[0]);
            const tTime = window.getISTTime(t.created_at);
            
            let content = '';
            if (t.action === 'FILE') {
                let fName = window.escapeHtml(t.comment);
                let fPath = window.escapeHtml(t.comment);
                if (t.comment && t.comment.includes('|')) {
                    const parts = t.comment.split('|');
                    fName = window.escapeHtml(parts[0]);
                    fPath = window.escapeHtml(parts[1]);
                }
                content = `FILE - <a href="javascript:void(0);" onclick="window.openSecureFile('${fPath}'); return false;" class="text-blue-600 underline font-medium hover:text-blue-800">${fName}</a>`;
            } else if (t.action === 'UPDATE') {
                content = `UPDATE - <span class="text-gray-700">${window.escapeHtml(t.comment)}</span>`;
            } else {
                content = `${window.escapeHtml(t.action)} ${t.comment ? `- ${window.escapeHtml(t.comment)}` : ''}`;
            }

            return `<div class="text-[12px] leading-snug border-l-2 border-indigo-200 pl-2 ml-1 mb-2.5">
                <span class="text-gray-400 text-[10px]">[${tTime}]</span> <span class="font-bold text-gray-800">${window.escapeHtml(tName)}</span>: <br/>
                <div class="mt-0.5">${content}</div>
            </div>`;
        }).join('');

        return `
        <div class="jira-card bg-white rounded-2xl shadow-sm border border-gray-200 mb-4 overflow-hidden relative" style="border-left-width: 6px; border-left-style: solid; border-left-color: ${borderClass};">
            <div class="p-4">
                <div class="flex justify-between items-start mb-3">
                    <div class="font-bold text-gray-800 text-[16px] flex items-start gap-2">
                        <i class="fa-solid fa-thumbtack text-gray-400 mt-1"></i> ${window.escapeHtml(task.title)}
                    </div>
                    <i class="fa-solid fa-ellipsis-vertical text-gray-400 cursor-pointer hover:text-gray-600 task-menu-dots px-2" data-task-id="${task.id}"></i>
                </div>
                
                <div class="text-[12px] text-gray-700 space-y-1.5 mb-4">
                    <div>👥 <span class="font-semibold text-gray-900">Assignees:</span> ${assigneesNames || 'None'}</div>
                    <div>👑 <span class="font-semibold text-gray-900">Created by:</span> ${reviewerName}</div>
                    <div>📅 <span class="font-semibold text-gray-900">Deadline:</span> ${deadlineHtml}</div>
                    <div>⚡ <span class="font-semibold text-gray-900">Priority:</span> ${task.priority}</div>
                    <div class="mt-2 flex items-center gap-2">🏷️ <span class="font-semibold text-gray-900">Status:</span> <span class="badge ${badgeClass}">${badgeText}</span></div>
                </div>

                ${actionsHtml ? `<div class="border-t border-gray-100 pt-3 pb-1">${actionsHtml}</div>` : ''}
                
                <div class="mt-2 pt-3 border-t border-gray-100">
                    <button onclick="window.toggleTrail('${task.id}')" class="text-[12px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors w-full text-left">
                        <i class="fa-solid fa-history"></i> Recent Trail (${trlList.length}) <i class="fa-solid fa-chevron-down ml-auto"></i>
                    </button>
                    <div id="trail-${task.id}" class="task-trail-box bg-gray-50 p-3 rounded-lg mt-2 space-y-2">
                        ${trailRows || '<div class="text-xs text-gray-400 italic">No activity yet.</div>'}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.downloadTaskPDF = async function(taskId) {
    window.showCenterToast('Generating PDF Report...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const {data: task} = await sb.from('tasks').select('*, creator:profiles!assigned_by(full_name, email)').eq('id', taskId).single();
    const {data: trlList} = await sb.from('task_trails').select('*, profiles(full_name, email)').eq('task_id', taskId).order('created_at', {ascending: true});
    let ip = '127.0.0.1';
    try { const res = await fetch('https://api.ipify.org?format=json'); const data = await res.json(); ip = data.ip; } catch(e){}
    const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const userNameDisplay = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';

    const wrapper = document.createElement('div');
    wrapper.style.padding = '30px'; wrapper.style.fontFamily = "'Inter', sans-serif"; wrapper.style.color = '#111b21'; wrapper.style.background = '#ffffff'; wrapper.style.position = 'relative'; wrapper.style.overflow = 'hidden';

    wrapper.innerHTML = `
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; display: flex; align-items: center; justify-content: center; opacity: 0.06; transform: rotate(-35deg); font-size: 45px; font-weight: 800; color: #000; text-align: center; white-space: nowrap;">
            DOWNLOADED BY: ${window.escapeHtml(userNameDisplay).toUpperCase()}<br>IP: ${ip}<br>${dateStr}
        </div>
        <div style="position: relative; z-index: 1;">
            <h2 style="color: #800000; border-bottom: 2px solid #800000; padding-bottom: 10px; margin-bottom: 20px;">MPGS TaskFlow - Audit Report</h2>
            <h3 style="margin-bottom: 15px;">Task: ${window.escapeHtml(task.title)}</h3>
            <p style="margin-bottom: 5px;"><b>Created By:</b> ${window.escapeHtml(task.creator?.full_name || task.creator?.email)}</p>
            <p style="margin-bottom: 5px;"><b>Deadline:</b> ${task.deadline ? window.getISTDate(task.deadline) : 'None'}</p>
            <p style="margin-bottom: 20px;"><b>Priority:</b> ${task.priority}</p>
            <h4 style="margin-bottom: 10px; color: #444;">Complete Audit Trail</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <tr style="background-color: #f0f2f5;">
                    <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Timestamp (IST)</th>
                    <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">User</th>
                    <th style="padding: 10px; border: 1px solid #ccc; text-align: left;">Action / Comment</th>
                </tr>
                ${trlList.map(t => {
                    const tName = window.toSentenceCase((t.profiles?.full_name || t.profiles?.email || 'System').split('@')[0]);
                    const tTime = window.getISTTime(t.created_at); const tDate = window.getISTDate(t.created_at);
                    let cmt = t.comment || ''; if(t.action === 'FILE' && cmt.includes('|')) cmt = cmt.split('|')[0];
                    return `<tr><td style="padding: 10px; border: 1px solid #ccc; white-space: nowrap;">${tDate}<br>${tTime}</td><td style="padding: 10px; border: 1px solid #ccc; font-weight: bold;">${window.escapeHtml(tName)}</td><td style="padding: 10px; border: 1px solid #ccc;"><b>${window.escapeHtml(t.action)}</b>${cmt ? `<br><i>${window.escapeHtml(cmt)}</i>` : ''}</td></tr>`;
                }).join('')}
            </table>
        </div>
    `;
    html2pdf().from(wrapper).set({ margin: 10, filename: `Task_Audit_${taskId}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).save().then(() => { window.showCenterToast('PDF Downloaded!', 'fa-solid fa-file-pdf', 'text-green-500'); });
};
/* ========================================================================================= */
/* 🔒 LOCKED BLOCK END 🔒                                                                    */
/* ========================================================================================= */
