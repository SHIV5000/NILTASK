/*
 * Noted For Action — desktop Task Messages + Task Lens v6.
 *
 * Approved model:
 * - the original chat message is the canonical task surface;
 * - Convert to Task opens the existing create form inline inside that bubble;
 * - task actions reuse existing task owners and mount their panels inline;
 * - Tasks in the left rail opens a central Task Lens, not the right Task Hub;
 * - Activity stays a separate right-side "what changed" feed on wide screens.
 *
 * Desktop fine-pointer only. Existing task mutation owners remain authoritative.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_MESSAGES_V6__) return;
  window.__NFA_DESKTOP_TASK_MESSAGES_V6__ = true;

  const RICH_PREFIX = '[NFA_RICH]';
  const state = {
    tasks: [],
    byMessage: new Map(),
    byId: new Map(),
    openTaskId: '',
    roomMode: 'chat',
    lensFilter: 'needs',
    loading: null,
    loadedAt: 0,
    createMessageId: '',
    createCard: null,
    actionTaskId: '',
    actionPanel: null,
    installFrames: 0,
    renderOwner: null,
    loadOwner: null,
    loadTasksOwner: null,
    openTaskModalOwner: null,
    closeTaskModalOwner: null,
    saveTaskOwner: null,
    closeActionOwner: null,
    goToTaskOwner: null,
    goToTaskNotifOwner: null
  };

  function isDesktop() {
    return window.innerWidth >= 769 &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  if (!isDesktop()) return;

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim();
    return id && id !== 'null' && id !== 'undefined' ? id : '';
  }

  function esc(value) {
    if (window.escapeHtml) return window.escapeHtml(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toast(message, icon, className) {
    if (typeof window.showCenterToast === 'function') {
      window.showCenterToast(
        message,
        icon || 'fa-solid fa-circle-info',
        className || 'text-blue-500'
      );
    }
  }

  function userName(userId) {
    if (userId === window.currentUser?.id) {
      return window.currentUser?.user_metadata?.full_name ||
        window.currentUser?.email?.split('@')[0] ||
        'You';
    }
    const profile = (window.globalUsersCache || []).find(user => user.id === userId);
    return profile?.full_name || profile?.email?.split('@')[0] || 'Staff member';
  }

  function roleLabel(userId) {
    if (typeof window.nfaResolveActualRoleLabel === 'function') {
      return window.nfaResolveActualRoleLabel(userId, null) || '';
    }
    const profile = (window.globalUsersCache || []).find(user => user.id === userId);
    return String(profile?.role_display_name || profile?.role_name || profile?.role || profile?.designation || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function unwrapV4(owner) {
    let fn = owner;
    const seen = new Set();
    while (typeof fn === 'function' && fn.__nfaFastHubV4Owner && !seen.has(fn)) {
      seen.add(fn);
      fn = fn.__nfaFastHubV4Owner;
    }
    return fn;
  }

  function sb() {
    return window.sb || null;
  }

  function effectiveStatus(assignment) {
    if (!assignment) return 'pending_ack';
    if (
      assignment.status === 'pending_ack' &&
      (assignment.state === 'acknowledged' || assignment.acked === true)
    ) return 'acknowledged';
    return String(assignment.status || 'pending_ack').toLowerCase();
  }

  function isClosedStatus(status) {
    return status === 'transferred' || status === 'cancelled';
  }

  function statusLabel(status) {
    return ({
      pending_ack: 'Awaiting',
      acknowledged: 'Acknowledged',
      in_progress: 'In Progress',
      submitted: 'Review Required',
      needs_review: 'Changes Required',
      accepted: 'Completed',
      transferred: 'Transferred',
      cancelled: 'Cancelled',
      mixed: 'Mixed Progress',
      empty: 'No Active Assignees'
    })[status] || 'In Progress';
  }

  function taskState(task) {
    const active = (task.assignees || []).filter(a => !isClosedStatus(effectiveStatus(a)));
    const statuses = active.map(effectiveStatus);
    if (!statuses.length) return 'empty';
    if (statuses.every(s => s === 'accepted')) return 'accepted';
    if (statuses.every(s => s === 'submitted')) return 'submitted';
    if (statuses.every(s => s === 'pending_ack')) return 'pending_ack';
    if (statuses.some(s => s === 'needs_review')) return 'needs_review';
    if (statuses.some(s => s === 'submitted')) return 'mixed';
    if (statuses.some(s => s === 'in_progress')) return 'in_progress';
    if (statuses.some(s => s === 'acknowledged')) return 'acknowledged';
    return statuses.length === 1 ? statuses[0] : 'mixed';
  }

  function taskStats(task) {
    const out = { awaiting: 0, working: 0, review: 0, done: 0 };
    (task.assignees || []).forEach(assignment => {
      const status = effectiveStatus(assignment);
      if (isClosedStatus(status)) return;
      if (status === 'pending_ack') out.awaiting += 1;
      else if (status === 'submitted') out.review += 1;
      else if (status === 'accepted') out.done += 1;
      else out.working += 1;
    });
    return out;
  }

  function deadlineText(task) {
    if (!task?.deadline) return 'No deadline';
    try {
      return window.getISTDate ? window.getISTDate(task.deadline) :
        new Date(task.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch (_) {
      return String(task.deadline);
    }
  }

  function isOverdue(task) {
    if (!task?.deadline || taskState(task) === 'accepted') return false;
    const due = new Date(task.deadline);
    if (Number.isNaN(due.getTime())) return false;
    due.setHours(23, 59, 59, 999);
    return due < new Date();
  }

  function decodeTrailComment(comment) {
    const value = String(comment || '');
    if (!value.startsWith(RICH_PREFIX)) return esc(value);
    const template = document.createElement('template');
    template.innerHTML = value.slice(RICH_PREFIX.length);
    const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI']);
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));
        walk(child);
      });
    };
    walk(template.content);
    return template.innerHTML;
  }

  async function loadTaskData(force = false) {
    const client = sb();
    const tid = window.currentTenantId;
    const uid = window.currentUser?.id;
    if (!client || !tid || !uid) return [];
    if (!force && state.tasks.length && Date.now() - state.loadedAt < 5000) return state.tasks;
    if (state.loading) return state.loading;

    state.loading = (async () => {
      const { data: rawTasks, error: taskError } = await client
        .from('tasks')
        .select('*')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })
        .limit(300);
      if (taskError) throw taskError;

      const taskIds = (rawTasks || []).map(task => task.id).filter(Boolean);
      let assignments = [];
      let trails = [];
      if (taskIds.length) {
        const [{ data: aData, error: aError }, { data: tData, error: trError }] = await Promise.all([
          client.from('task_assignees').select('*').eq('tenant_id', tid).in('task_id', taskIds),
          client.from('task_trails').select('*').eq('tenant_id', tid).in('task_id', taskIds).order('created_at', { ascending: false }).limit(1200)
        ]);
        if (aError) throw aError;
        if (trError) throw trError;
        assignments = aData || [];
        trails = tData || [];
      }

      const byTaskAssignments = new Map();
      assignments.forEach(row => {
        if (!byTaskAssignments.has(row.task_id)) byTaskAssignments.set(row.task_id, []);
        byTaskAssignments.get(row.task_id).push(row);
      });
      const byTaskTrails = new Map();
      trails.forEach(row => {
        if (!byTaskTrails.has(row.task_id)) byTaskTrails.set(row.task_id, []);
        byTaskTrails.get(row.task_id).push(row);
      });

      const tasks = (rawTasks || []).map(task => ({
        ...task,
        assignees: byTaskAssignments.get(task.id) || [],
        trails: byTaskTrails.get(task.id) || []
      })).filter(task =>
        task.assigned_by === uid ||
        task.assignees.some(assignment => assignment.assignee_id === uid)
      );

      state.tasks = tasks;
      state.byId = new Map(tasks.map(task => [String(task.id), task]));
      state.byMessage = new Map(
        tasks.filter(task => task.original_message_id)
          .map(task => [String(task.original_message_id), task])
      );
      state.loadedAt = Date.now();
      return tasks;
    })().catch(error => {
      console.error('[task-messages-v6] task load failed', error);
      return state.tasks;
    }).finally(() => {
      state.loading = null;
    });
    return state.loading;
  }

  function currentAssignment(task) {
    const uid = window.currentUser?.id;
    return (task.assignees || []).find(a => a.assignee_id === uid && !isClosedStatus(effectiveStatus(a))) || null;
  }

  function isCreator(task) {
    return task.assigned_by === window.currentUser?.id;
  }

  function statusStyle(status) {
    const styles = {
      pending_ack: ['#fff7ed','#c2410c','#fb923c'],
      acknowledged: ['#eff6ff','#1d4ed8','#60a5fa'],
      in_progress: ['#eef2ff','#4338ca','#818cf8'],
      submitted: ['#fdf4ff','#a21caf','#d946ef'],
      needs_review: ['#fef2f2','#b91c1c','#ef4444'],
      accepted: ['#f0fdf4','#166534','#22c55e'],
      mixed: ['#faf5ff','#7e22ce','#a855f7'],
      empty: ['#f8fafc','#64748b','#cbd5e1']
    };
    return styles[status] || styles.mixed;
  }

  function actionButtons(task) {
    const buttons = [];
    const mine = currentAssignment(task);
    const status = effectiveStatus(mine);
    if (mine) {
      if (status === 'pending_ack') buttons.push(['ack','Acknowledge']);
      if (status === 'acknowledged') buttons.push(['start','Start Work']);
      if (status === 'in_progress' || status === 'needs_review') {
        buttons.push(['update','Update'],['upload','Upload'],['delegate','Delegate'],['extension','Extension'],['submit', status === 'needs_review' ? 'Resubmit' : 'Submit']);
      }
    }
    if (isCreator(task)) {
      if (task.assignees.some(a => effectiveStatus(a) === 'pending_ack')) buttons.push(['remind','Remind']);
      buttons.push(['deadline','Deadline']);
      if (task.assignees.some(a => !isClosedStatus(effectiveStatus(a)) && effectiveStatus(a) !== 'accepted')) buttons.push(['transfer','Transfer']);
      if (taskState(task) !== 'accepted') buttons.push(['cancel','Cancel']);
    }
    buttons.push(['timeline','Timeline']);
    return buttons;
  }

  function peopleHtml(task) {
    const creator = isCreator(task);
    return (task.assignees || []).filter(a => !isClosedStatus(effectiveStatus(a))).map(assignment => {
      const status = effectiveStatus(assignment);
      const name = userName(assignment.assignee_id);
      const controls = [];
      if (creator && status === 'submitted') {
        controls.push(`<button type="button" data-v6-direct="accept" data-task-id="${esc(task.id)}" data-assignee-id="${esc(assignment.assignee_id)}">Approve</button>`);
        controls.push(`<button type="button" data-v6-action="return" data-task-id="${esc(task.id)}" data-assignee-id="${esc(assignment.assignee_id)}">Return</button>`);
      }
      if (creator && status === 'pending_ack') {
        controls.push(`<button type="button" data-v6-direct="remind-one" data-task-id="${esc(task.id)}" data-assignee-id="${esc(assignment.assignee_id)}">Remind</button>`);
      }
      if (creator && !['accepted','cancelled','transferred'].includes(status)) {
        controls.push(`<button type="button" data-v6-action="transfer" data-task-id="${esc(task.id)}" data-assignee-id="${esc(assignment.assignee_id)}">Transfer</button>`);
      }
      return `
        <div class="nfa-v6-person">
          <span class="nfa-v6-avatar">${esc(name.charAt(0).toUpperCase())}</span>
          <span class="nfa-v6-person-name">${esc(name)}${roleLabel(assignment.assignee_id) ? ` · ${esc(roleLabel(assignment.assignee_id))}` : ''}</span>
          <span class="nfa-v6-person-state">${esc(statusLabel(status))}</span>
        </div>
        ${controls.length ? `<div class="nfa-v6-person-actions">${controls.join('')}</div>` : ''}`;
    }).join('') || '<div class="nfa-v6-person-name">No active assignees.</div>';
  }

  function trailHtml(task) {
    return (task.trails || []).slice(0, 25).map(event => {
      const who = userName(event.user_id);
      let when = '';
      try {
        when = event.created_at ? new Date(event.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      } catch (_) {}
      const action = String(event.action || 'UPDATE').replaceAll('_',' ');
      const comment = decodeTrailComment(event.comment || '');
      return `<div class="nfa-v6-event"><div class="nfa-v6-event-head">${esc(who)} · ${esc(action)} <span>${esc(when)}</span></div>${comment ? `<div class="nfa-v6-event-body">${comment}</div>` : ''}</div>`;
    }).join('') || '<div class="nfa-v6-event-body">No task activity yet.</div>';
  }

  function taskMessageHtml(task) {
    const status = taskState(task);
    const stats = taskStats(task);
    const style = statusStyle(status);
    const open = state.openTaskId === String(task.id);
    const completed = status === 'accepted';
    return `
      <section class="nfa-task-message-v6 ${open ? 'nfa-open' : ''} ${completed ? 'nfa-completed' : ''}" data-v6-task-message="${esc(task.id)}">
        <button type="button" class="nfa-v6-task-summary" data-v6-toggle-task="${esc(task.id)}" aria-expanded="${open}">
          <div class="nfa-v6-task-summary-top">
            <div>
              <div class="nfa-v6-task-kicker">Task Message</div>
              <div class="nfa-v6-task-title">${esc(task.title || 'Task')}</div>
              <div class="nfa-v6-task-meta">Due ${esc(deadlineText(task))} · ${esc(String(task.priority || 'Normal'))} priority · ${task.assignees.length} assignee(s)</div>
            </div>
            <span class="nfa-v6-status" style="background:${style[0]};color:${style[1]};border-color:${style[2]};">${esc(statusLabel(status))}</span>
          </div>
          <div class="nfa-v6-stats">
            <div class="nfa-v6-stat"><b>${stats.awaiting}</b><span>Awaiting</span></div>
            <div class="nfa-v6-stat"><b>${stats.working}</b><span>Working</span></div>
            <div class="nfa-v6-stat"><b>${stats.review}</b><span>Review</span></div>
            <div class="nfa-v6-stat"><b>${stats.done}</b><span>Done</span></div>
          </div>
        </button>
        <div class="nfa-v6-task-expanded">
          <div class="nfa-v6-action-strip">
            ${actionButtons(task).map(([key,label]) => `<button type="button" class="nfa-v6-action-btn ${key === 'cancel' ? 'nfa-danger' : ''}" data-v6-action="${key}" data-task-id="${esc(task.id)}">${esc(label)}</button>`).join('')}
          </div>
          <div class="nfa-v6-task-section"><div class="nfa-v6-section-title">Assignees</div>${peopleHtml(task)}</div>
          <div class="nfa-v6-task-section"><div class="nfa-v6-section-title">Task timeline</div><div class="nfa-v6-trail">${trailHtml(task)}</div></div>
          <div class="nfa-v6-inline-action-host" data-v6-action-host="${esc(task.id)}"></div>
        </div>
      </section>`;
  }

  function rowForMessage(messageId) {
    const id = cleanId(messageId);
    if (!id) return null;
    return document.getElementById(`row-${id}`) ||
      document.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  }

  function bubbleForMessage(messageId) {
    const row = rowForMessage(messageId);
    return row?.querySelector('.bubble') || row;
  }

  function ensureConversationMode() {
    const messages = document.getElementById('messagesContainer');
    const shell = document.getElementById('chatShellContainer');
    if (!messages || !shell) return false;
    let switcher = document.getElementById('nfaConversationModeV6');
    if (!switcher) {
      switcher = document.createElement('div');
      switcher.id = 'nfaConversationModeV6';
      switcher.setAttribute('role', 'tablist');
      switcher.innerHTML = '<button type="button" data-v6-room-mode="chat">Chat</button><button type="button" data-v6-room-mode="tasks">Tasks</button>';
      messages.insertBefore(switcher, shell);
      switcher.addEventListener('click', event => {
        const button = event.target.closest('[data-v6-room-mode]');
        if (!button) return;
        state.roomMode = button.dataset.v6RoomMode === 'tasks' ? 'tasks' : 'chat';
        applyRoomMode();
      });
    }
    let empty = document.getElementById('nfaConversationTaskEmptyV6');
    if (!empty) {
      empty = document.createElement('div');
      empty.id = 'nfaConversationTaskEmptyV6';
      empty.textContent = 'No task messages in this conversation.';
      shell.appendChild(empty);
    }
    return true;
  }

  function applyRoomMode() {
    const messages = document.getElementById('messagesContainer');
    const switcher = document.getElementById('nfaConversationModeV6');
    if (!messages || !switcher) return;
    switcher.querySelectorAll('[data-v6-room-mode]').forEach(button => {
      button.classList.toggle('nfa-active', button.dataset.v6RoomMode === state.roomMode);
    });
    messages.classList.toggle('nfa-v6-conversation-tasks', state.roomMode === 'tasks');
    const count = messages.querySelectorAll('.row-sent.nfa-has-task-v6,.row-rcvd.nfa-has-task-v6').length;
    messages.classList.toggle('nfa-v6-no-room-tasks', state.roomMode === 'tasks' && count === 0);
  }

  function decorateCurrentConversation() {
    if (!isDesktop()) return;
    ensureConversationMode();
    document.querySelectorAll('#messagesContainer .row-sent,#messagesContainer .row-rcvd').forEach(row => row.classList.remove('nfa-has-task-v6'));
    document.querySelectorAll('.nfa-task-message-v6').forEach(node => node.remove());

    state.byMessage.forEach((task, messageId) => {
      const row = rowForMessage(messageId);
      const bubble = bubbleForMessage(messageId);
      if (!row || !bubble) return;
      row.classList.add('nfa-has-task-v6');
      bubble.insertAdjacentHTML('beforeend', taskMessageHtml(task));
    });
    bindTaskMessageEvents();
    applyRoomMode();
  }

  function bindTaskMessageEvents() {
    document.querySelectorAll('[data-v6-toggle-task]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const id = cleanId(button.dataset.v6ToggleTask);
        state.openTaskId = state.openTaskId === id ? '' : id;
        decorateCurrentConversation();
        if (state.openTaskId) requestAnimationFrame(() => document.querySelector(`[data-v6-task-message="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior:'smooth', block:'center' }));
      };
    });
    document.querySelectorAll('[data-v6-action]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        runAction(button.dataset.v6Action, button.dataset.taskId, button.dataset.assigneeId || '');
      };
    });
    document.querySelectorAll('[data-v6-direct]').forEach(button => {
      button.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        runDirect(button.dataset.v6Direct, button.dataset.taskId, button.dataset.assigneeId || '');
      };
    });
  }

  async function refresh(force = true) {
    await loadTaskData(force);
    decorateCurrentConversation();
    if (document.getElementById('nfaTaskLensV6')?.classList.contains('nfa-open')) renderLens();
  }

  function restoreActionPanel() {
    const layer = document.getElementById('ntTaskActionLayer');
    const panel = state.actionPanel || document.querySelector('.nfa-v6-inline-panel');
    if (panel && layer && panel.parentElement !== layer) {
      panel.classList.remove('nfa-v6-inline-panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      layer.appendChild(panel);
    }
    layer?.classList.remove('nfa-v6-inline-layer');
    state.actionPanel = null;
    state.actionTaskId = '';
    document.body.style.overflow = '';
  }

  function mountActionPanel(taskId, attempt = 0) {
    const id = cleanId(taskId);
    const layer = document.getElementById('ntTaskActionLayer');
    const panel = layer?.querySelector('.nt-action-panel') || state.actionPanel;
    const host = document.querySelector(`[data-v6-action-host="${CSS.escape(id)}"]`);
    if (!id || !layer || !panel || !host || !layer.classList.contains('nt-open')) {
      if (attempt < 18) requestAnimationFrame(() => mountActionPanel(id, attempt + 1));
      return false;
    }
    restoreActionPanel();
    state.actionTaskId = id;
    state.actionPanel = panel;
    layer.classList.add('nfa-v6-inline-layer');
    panel.classList.add('nfa-v6-inline-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-modal', 'false');
    host.replaceChildren(panel);
    document.body.style.overflow = '';
    requestAnimationFrame(() => panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({ preventScroll:true }));
    return true;
  }

  function actionOwner(name) {
    return unwrapV4(window[name]);
  }

  function invokePanelAction(name, taskId, assigneeId) {
    const owner = actionOwner(name);
    if (typeof owner !== 'function') return false;
    const args = assigneeId ? [taskId, assigneeId] : [taskId];
    const result = owner.apply(window, args);
    requestAnimationFrame(() => mountActionPanel(taskId));
    Promise.resolve(result).finally(() => requestAnimationFrame(() => mountActionPanel(taskId)));
    return result;
  }

  async function runDirect(kind, taskId, assigneeId) {
    const task = state.byId.get(String(taskId));
    if (!task) return;
    try {
      if (kind === 'accept') await window.taskAction?.(taskId, assigneeId, 'accept');
      if (kind === 'remind-one') await window.sendTaskReminder?.(taskId, assigneeId);
      await refresh(true);
    } catch (error) {
      console.error('[task-messages-v6] direct action failed', error);
    }
  }

  function runAction(action, taskId, assigneeId) {
    const task = state.byId.get(String(taskId));
    if (!task) return;
    const mine = currentAssignment(task);
    const mineId = mine?.assignee_id || window.currentUser?.id || '';
    if (action === 'timeline') return;
    if (action === 'ack') return runDirectTaskAction(taskId, mineId, 'ack');
    if (action === 'start') return runDirectTaskAction(taskId, mineId, 'start');
    if (action === 'submit') return runDirectTaskAction(taskId, mineId, 'submit', Boolean(task.require_proof));
    if (action === 'update') return invokePanelAction('openTaskUpdateAction', taskId, mineId);
    if (action === 'upload') return invokePanelAction('openTaskUploadAction', taskId, mineId);
    if (action === 'delegate') return invokePanelAction('openTaskDelegateAction', taskId, mineId);
    if (action === 'extension') return invokePanelAction('openTaskExtensionRequest', taskId, mineId);
    if (action === 'return') return invokePanelAction('openTaskReturnAction', taskId, assigneeId);
    if (action === 'transfer') return invokePanelAction('openTaskTransferAction', taskId, assigneeId || mineId);
    if (action === 'deadline') return invokePanelAction('openTaskDeadlineAction', taskId, '');
    if (action === 'cancel') return invokePanelAction('openTaskCancelAction', taskId, '');
    if (action === 'remind') return remindPending(task);
  }

  async function runDirectTaskAction(taskId, assigneeId, action, requireProof = false) {
    try {
      await window.taskAction?.(taskId, assigneeId, action, requireProof);
      await refresh(true);
    } catch (error) {
      console.error('[task-messages-v6] task action failed', error);
    }
  }

  async function remindPending(task) {
    const pending = (task.assignees || []).filter(a => effectiveStatus(a) === 'pending_ack');
    if (!pending.length) return toast('No pending assignees to remind.');
    for (const assignment of pending) {
      await window.sendTaskReminder?.(task.id, assignment.assignee_id);
    }
    await refresh(true);
  }

  function createHost(messageId) {
    const bubble = bubbleForMessage(messageId);
    if (!bubble) return null;
    let host = bubble.querySelector(`[data-v6-create-host="${CSS.escape(String(messageId))}"]`);
    if (!host) {
      host = document.createElement('div');
      host.className = 'nfa-v6-create-host';
      host.dataset.v6CreateHost = String(messageId);
      bubble.appendChild(host);
    }
    return host;
  }

  function restoreCreateCard() {
    const modal = document.getElementById('taskModal');
    const card = state.createCard || document.querySelector('.nfa-v6-inline-create-card');
    if (card && modal && card.parentElement !== modal) {
      card.classList.remove('nfa-v6-inline-create-card');
      modal.appendChild(card);
    }
    modal?.classList.remove('nfa-v6-modal-shell');
    document.querySelectorAll('.nfa-v6-create-host').forEach(host => host.remove());
    state.createCard = null;
    state.createMessageId = '';
    document.body.style.overflow = '';
  }

  function mountCreateCard(messageId) {
    const modal = document.getElementById('taskModal');
    const card = modal?.firstElementChild;
    const host = createHost(messageId);
    if (!modal || !card || !host) return false;
    restoreCreateCard();
    state.createMessageId = String(messageId);
    state.createCard = card;
    card.classList.add('nfa-v6-inline-create-card');
    host.appendChild(card);
    modal.classList.add('nfa-v6-modal-shell');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
    requestAnimationFrame(() => document.getElementById('taskTitle')?.focus?.({ preventScroll:true }));
    return true;
  }

  function wrapCreateOwners() {
    const currentOpen = window.openTaskModal;
    const currentClose = window.closeTaskModal;
    if (typeof currentOpen !== 'function' || typeof currentClose !== 'function') return false;
    if (!state.openTaskModalOwner) state.openTaskModalOwner = unwrapV4(currentOpen);
    if (!state.closeTaskModalOwner) state.closeTaskModalOwner = unwrapV4(currentClose);

    if (!window.openTaskModal.__nfaTaskMessagesV6) {
      const wrappedOpen = async function(messageId, messageText) {
        const id = cleanId(messageId);
        if (!id || state.byMessage.has(id)) {
          if (state.byMessage.has(id)) {
            state.openTaskId = String(state.byMessage.get(id).id);
            decorateCurrentConversation();
          }
          return false;
        }
        restoreActionPanel();
        restoreCreateCard();
        const result = await state.openTaskModalOwner.apply(this, arguments);
        mountCreateCard(id);
        return result;
      };
      wrappedOpen.__nfaTaskMessagesV6 = true;
      wrappedOpen.__nfaTaskMessagesV6Owner = state.openTaskModalOwner;
      window.openTaskModal = wrappedOpen;
    }

    if (!window.closeTaskModal.__nfaTaskMessagesV6) {
      const wrappedClose = function() {
        restoreCreateCard();
        const result = state.closeTaskModalOwner.apply(this, arguments);
        requestAnimationFrame(() => refresh(true));
        return result;
      };
      wrappedClose.__nfaTaskMessagesV6 = true;
      wrappedClose.__nfaTaskMessagesV6Owner = state.closeTaskModalOwner;
      window.closeTaskModal = wrappedClose;
    }

    const save = window.saveTaskMultiAssignee;
    if (typeof save === 'function' && !save.__nfaTaskMessagesV6) {
      state.saveTaskOwner = save;
      const wrappedSave = async function() {
        const result = await save.apply(this, arguments);
        state.loadedAt = 0;
        await refresh(true);
        return result;
      };
      wrappedSave.__nfaTaskMessagesV6 = true;
      wrappedSave.__nfaTaskMessagesV6Owner = save;
      window.saveTaskMultiAssignee = wrappedSave;
    }
    return true;
  }

  function wrapCloseActionOwner() {
    const current = window.closeTaskActionLayer;
    if (typeof current !== 'function') return false;
    if (current.__nfaTaskMessagesV6) return true;
    state.closeActionOwner = unwrapV4(current);
    const wrapped = function() {
      restoreActionPanel();
      const result = state.closeActionOwner.apply(this, arguments);
      requestAnimationFrame(() => refresh(true));
      return result;
    };
    wrapped.__nfaTaskMessagesV6 = true;
    wrapped.__nfaTaskMessagesV6Owner = state.closeActionOwner;
    window.closeTaskActionLayer = wrapped;
    return true;
  }

  function ensureLens() {
    const chatArea = document.querySelector('.chat-area');
    if (!chatArea) return null;
    chatArea.classList.add('nfa-v6-lens-host');
    let lens = document.getElementById('nfaTaskLensV6');
    if (!lens) {
      lens = document.createElement('section');
      lens.id = 'nfaTaskLensV6';
      lens.setAttribute('aria-label', 'Task Lens');
      lens.innerHTML = `
        <header class="nfa-v6-lens-head">
          <div><h2>Task Lens</h2><p>What needs attention across conversations</p></div>
          <button type="button" class="nfa-v6-lens-close" data-v6-close-lens>Back to Chat</button>
        </header>
        <div class="nfa-v6-lens-filters"></div>
        <div class="nfa-v6-lens-list"></div>`;
      chatArea.appendChild(lens);
      lens.addEventListener('click', event => {
        if (event.target.closest('[data-v6-close-lens]')) {
          closeLens();
          return;
        }
        const filter = event.target.closest('[data-v6-lens-filter]');
        if (filter) {
          state.lensFilter = filter.dataset.v6LensFilter;
          renderLens();
          return;
        }
        const card = event.target.closest('[data-v6-lens-task]');
        if (card) openTaskFromLens(card.dataset.v6LensTask);
      });
    }
    return lens;
  }

  function needsMyAction(task) {
    const mine = currentAssignment(task);
    if (mine && ['pending_ack','acknowledged','in_progress','needs_review'].includes(effectiveStatus(mine))) return true;
    if (isCreator(task) && task.assignees.some(a => effectiveStatus(a) === 'submitted')) return true;
    return false;
  }

  function lensTasks() {
    const uid = window.currentUser?.id;
    return state.tasks.filter(task => {
      if (state.lensFilter === 'needs') return needsMyAction(task);
      if (state.lensFilter === 'to-me') return task.assignees.some(a => a.assignee_id === uid && !isClosedStatus(effectiveStatus(a)));
      if (state.lensFilter === 'by-me') return isCreator(task);
      if (state.lensFilter === 'due') return isOverdue(task);
      if (state.lensFilter === 'completed') return taskState(task) === 'accepted';
      return true;
    });
  }

  function renderLens() {
    const lens = ensureLens();
    if (!lens) return;
    const filters = [
      ['needs','Needs My Action'],
      ['to-me','Assigned to Me'],
      ['by-me','Assigned by Me'],
      ['due','Due / Overdue'],
      ['completed','Completed']
    ];
    lens.querySelector('.nfa-v6-lens-filters').innerHTML = filters.map(([key,label]) => `<button type="button" class="${state.lensFilter === key ? 'nfa-active' : ''}" data-v6-lens-filter="${key}">${label}</button>`).join('');
    const tasks = lensTasks();
    lens.querySelector('.nfa-v6-lens-list').innerHTML = tasks.length ? tasks.map(task => {
      const status = taskState(task);
      const style = statusStyle(status);
      const source = task.original_message_id ? 'Original conversation' : 'Task';
      return `<article class="nfa-v6-lens-card" data-v6-lens-task="${esc(task.id)}"><div class="nfa-v6-lens-card-top"><div><div class="nfa-v6-lens-source">${esc(source)}</div><div class="nfa-v6-lens-title">${esc(task.title || 'Task')}</div><div class="nfa-v6-lens-meta">Created by ${esc(userName(task.assigned_by))} · Due ${esc(deadlineText(task))} · ${task.assignees.length} assignee(s)</div></div><span class="nfa-v6-status" style="background:${style[0]};color:${style[1]};border-color:${style[2]};">${esc(statusLabel(status))}</span></div></article>`;
    }).join('') : '<div class="nfa-v6-lens-empty">No tasks in this filter.</div>';
  }

  async function openLens(filter) {
    if (filter) state.lensFilter = filter;
    await loadTaskData(false);
    const lens = ensureLens();
    renderLens();
    lens?.classList.add('nfa-open');
    setRailActive('tasks');
  }

  function closeLens() {
    document.getElementById('nfaTaskLensV6')?.classList.remove('nfa-open');
    setRailActive('chat');
    document.getElementById('messagesContainer')?.focus?.({ preventScroll:true });
  }

  async function openTaskFromLens(taskId, notificationId) {
    const task = state.byId.get(String(taskId));
    if (!task) return;
    if (notificationId && sb() && window.currentUser?.id) {
      try {
        await sb().from('notifications').update({ is_read:true })
          .eq('id', notificationId)
          .eq('user_id', window.currentUser.id)
          .eq('tenant_id', window.currentTenantId);
      } catch (_) {}
    }
    closeLens();
    if (!task.original_message_id) {
      toast('This task has no linked original message.', 'fa-solid fa-message', 'text-orange-500');
      return;
    }
    await window.openTaskOriginalMessage?.(task.id);
    await loadTaskData(true);
    state.openTaskId = String(task.id);
    state.roomMode = 'chat';
    decorateCurrentConversation();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const node = document.querySelector(`[data-v6-task-message="${CSS.escape(String(task.id))}"]`);
      if (node) {
        node.scrollIntoView({ behavior:'smooth', block:'center' });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 80));
      decorateCurrentConversation();
    }
  }

  function setRailActive(action) {
    const rail = document.getElementById('nfaDesktopRail');
    rail?.querySelectorAll('.nfa-rail-button[data-nfa-action]').forEach(button => {
      if (button.dataset.nfaAction === 'activity' && document.getElementById('activityFeedPanel')) return;
      button.classList.toggle('nfa-active', button.dataset.nfaAction === action);
    });
  }

  function installRailRouting() {
    const rail = document.getElementById('nfaDesktopRail');
    if (!rail || rail.dataset.nfaTaskMessagesV6 === '1') return Boolean(rail);
    rail.dataset.nfaTaskMessagesV6 = '1';
    rail.addEventListener('click', event => {
      const button = event.target.closest('[data-nfa-action]');
      if (!button || !rail.contains(button)) return;
      const action = button.dataset.nfaAction;
      if (action === 'tasks') {
        event.preventDefault();
        event.stopImmediatePropagation();
        openLens('needs');
        return;
      }
      if (action === 'chat') {
        closeLens();
        return;
      }
      if (action !== 'activity') closeLens();
    }, true);
    return true;
  }

  function retireTaskHub() {
    const right = document.getElementById('rightSidebar');
    right?.classList.add('nfa-v6-no-task-hub', 'nfa-v6-task-hub-retired');
    const shell = right?.closest('.nfa-speed-shell');
    shell?.classList.remove('nfa-task-hub-expanded');
    right?.classList.remove('nfa-task-hub-expanded','nfa-task-focused','nfa-task-create-mode');
    return Boolean(right);
  }

  function wrapMessageOwners() {
    const render = window.renderMessages;
    if (typeof render === 'function' && !render.__nfaTaskMessagesV6) {
      state.renderOwner = render;
      const wrappedRender = function(messages) {
        const result = render.apply(this, arguments);
        requestAnimationFrame(() => {
          loadTaskData(false).then(decorateCurrentConversation);
        });
        return result;
      };
      wrappedRender.__nfaTaskMessagesV6 = true;
      wrappedRender.__nfaTaskMessagesV6Owner = render;
      window.renderMessages = wrappedRender;
    }

    const load = window.loadMessages;
    if (typeof load === 'function' && !load.__nfaTaskMessagesV6) {
      state.loadOwner = load;
      const wrappedLoad = async function() {
        const result = await load.apply(this, arguments);
        await loadTaskData(false);
        decorateCurrentConversation();
        return result;
      };
      wrappedLoad.__nfaTaskMessagesV6 = true;
      wrappedLoad.__nfaTaskMessagesV6Owner = load;
      window.loadMessages = wrappedLoad;
    }
    return Boolean(window.renderMessages?.__nfaTaskMessagesV6) && Boolean(window.loadMessages?.__nfaTaskMessagesV6);
  }

  function wrapTaskPanelRefresh() {
    const owner = window.loadTasksForPanel;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaTaskMessagesV6) return true;
    state.loadTasksOwner = owner;
    const wrapped = async function() {
      const result = await owner.apply(this, arguments);
      state.loadedAt = 0;
      await refresh(true);
      return result;
    };
    wrapped.__nfaTaskMessagesV6 = true;
    wrapped.__nfaTaskMessagesV6Owner = owner;
    window.loadTasksForPanel = wrapped;
    return true;
  }

  function wrapTaskNavigation() {
    if (typeof window.goToTask === 'function' && !window.goToTask.__nfaTaskMessagesV6) {
      state.goToTaskOwner = window.goToTask;
      const wrapped = function(taskId, notificationId) {
        return openTaskFromLens(taskId, notificationId || null);
      };
      wrapped.__nfaTaskMessagesV6 = true;
      window.goToTask = wrapped;
    }
    if (typeof window.goToTaskNotif === 'function' && !window.goToTaskNotif.__nfaTaskMessagesV6) {
      state.goToTaskNotifOwner = window.goToTaskNotif;
      const wrappedNotif = function(taskId, notificationId) {
        return openTaskFromLens(taskId, notificationId || null);
      };
      wrappedNotif.__nfaTaskMessagesV6 = true;
      window.goToTaskNotif = wrappedNotif;
      window._goToTaskNotif = wrappedNotif;
    }
    return true;
  }

  function installWhenReady() {
    if (!isDesktop()) return;
    const ready = [
      retireTaskHub(),
      installRailRouting(),
      wrapMessageOwners(),
      wrapCreateOwners(),
      wrapCloseActionOwner(),
      wrapTaskPanelRefresh(),
      wrapTaskNavigation()
    ].every(Boolean);
    ensureConversationMode();
    ensureLens();
    loadTaskData(false).then(decorateCurrentConversation);
    if (ready) return;
    state.installFrames += 1;
    if (state.installFrames < 300) requestAnimationFrame(installWhenReady);
  }

  window.nfaOpenTaskLens = openLens;
  window.nfaCloseTaskLens = closeLens;
  window.nfaOpenTaskMessage = openTaskFromLens;
  window.nfaRefreshTaskMessages = refresh;

  requestAnimationFrame(installWhenReady);
})();
