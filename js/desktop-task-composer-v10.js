/* Noted For Action — Desktop Task Composer v10
 * Single desktop task-input owner layered after Workspace v8.
 * Task Reply binds the main composer; legacy task dialogs are quarantined.
 * Existing mutation owners remain authoritative. No duplicate task/message writes.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_COMPOSER_V10__) return;
  window.__NFA_DESKTOP_TASK_COMPOSER_V10__ = true;

  const state = {
    taskId: '', messageId: '', task: null, assignees: [], action: '', targetAssigneeId: '',
    composerRoot: null, host: null, panel: null, closeOwner: null,
    pendingCommit: false, busy: false, installFrames: 0,
    reminderInflight: new Set(), reminderLast: new Map(),
  };

  const ACTION_META = {
    ack:{label:'Acknowledge',icon:'check'}, start:{label:'Start Work',icon:'play'},
    update:{label:'Update',icon:'edit'}, upload:{label:'Upload',icon:'paperclip'},
    delegate:{label:'Delegate',icon:'userPlus'}, extension:{label:'Extension',icon:'clock'},
    submit:{label:'Submit',icon:'send'}, approve:{label:'Approve',icon:'checkCircle'},
    return:{label:'Return',icon:'undo'}, remind:{label:'Remind',icon:'bell'},
    deadline:{label:'Deadline',icon:'calendar'}, transfer:{label:'Transfer',icon:'swap'},
    cancel:{label:'Cancel',icon:'xCircle'},
  };

  function isDesktop() {
    return window.innerWidth >= 769 && !window.IS_NATIVE &&
      !window.isMobileView?.() && !window.matchMedia?.('(pointer: coarse)').matches;
  }
  if (!isDesktop()) return;

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim();
    return id && id !== 'null' && id !== 'undefined' ? id : '';
  }
  function esc(value) {
    if (window.escapeHtml) return window.escapeHtml(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  function toast(message, iconName='fa-solid fa-circle-info', colour='text-blue-500') {
    window.showCenterToast?.(message, iconName, colour);
  }
  function userName(userId) {
    const p = (window.globalUsersCache || []).find(user => user.id === userId);
    return p?.full_name || p?.email?.split('@')[0] || 'Staff member';
  }
  function effectiveStatus(a) {
    if (!a) return 'pending_ack';
    if (a.status === 'pending_ack' && (a.state === 'acknowledged' || a.acked === true)) return 'acknowledged';
    return String(a.status || 'pending_ack').toLowerCase();
  }
  function closed(status) {
    return ['accepted','cancelled','transferred'].includes(String(status || '').toLowerCase());
  }
  function currentAssignment() {
    return state.assignees.find(a => a.assignee_id === window.currentUser?.id && !closed(effectiveStatus(a))) || null;
  }
  function isCreator() { return state.task?.assigned_by === window.currentUser?.id; }

  function icon(name, size=17) {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    const paths = {
      check:'<path d="m5 12 4 4L19 6"/>',
      checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
      play:'<path d="m8 5 11 7-11 7Z"/>',
      edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
      paperclip:'<path d="m21.4 11.6-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5"/>',
      userPlus:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
      undo:'<path d="m9 14-4-4 4-4"/><path d="M5 10h8a6 6 0 0 1 6 6v2"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      swap:'<path d="m7 7-4 4 4 4"/><path d="M3 11h13a4 4 0 0 1 4 4v1"/><path d="m17 17 4-4-4-4"/>',
      xCircle:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      chat:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
      tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/>',
      activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
      bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
      schedule:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
      dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      pdf:'<path d="M6 2h9l5 5v15H6Z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 18h5"/>',
      reply:'<path d="m9 17-5-5 5-5"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
      file:'<path d="M6 2h9l5 5v15H6Z"/><path d="M14 2v6h6"/>',
      external:'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>'
    };
    return `<svg class="nfa-v10-icon" ${common}>${paths[name] || paths.tasks}</svg>`;
  }

  function enforceTwoThemes() {
    try {
      const saved = localStorage.getItem('theme');
      if (saved && !['light','dark'].includes(saved)) {
        localStorage.setItem('theme','light');
        window.currentTheme = 'light';
      }
    } catch (_) {}
    window.THEME_LIST = [
      { id:'light', label:'Indigo Light', swatch:'#4f46e5' },
      { id:'dark', label:'Dark', swatch:'#2f81f7' },
    ];
    window.applyTheme?.();
  }

  function upgradeWorkspaceIcons() {
    const map = {chat:'chat',tasks:'tasks',activity:'activity',reminders:'bell',bookmarks:'bookmark',scheduled:'schedule',dashboard:'dashboard'};
    document.querySelectorAll('#nfaDesktopRail .nfa-rail-button[data-nfa-action]').forEach(button => {
      const key = map[button.dataset.nfaAction];
      if (!key || button.querySelector('.nfa-v10-icon')) return;
      const old = button.querySelector('i,.nfa-v9-icon');
      if (old) old.outerHTML = icon(key,19);
    });
    document.querySelectorAll('[data-v8-task-reminder]').forEach(button => button.innerHTML = icon('bell',16));
    document.querySelectorAll('[data-v8-task-pdf]').forEach(button => button.innerHTML = icon('pdf',16));
    document.querySelectorAll('#messagesContainer .nfa-has-task-v8 .act-btn').forEach(button => {
      const label = (button.textContent || '').replace(/\s+/g,' ').trim();
      if (/^Reply\b/i.test(label)) {
        const old = button.querySelector('i,.nfa-v9-icon');
        if (old) old.outerHTML = icon('reply',15);
      }
    });
  }

  function legacyLayer() { return document.getElementById('ntTaskActionLayer'); }
  function quarantineLegacyLayer() {
    const layer = legacyLayer();
    if (!layer) return;
    layer.classList.remove('nt-open','nfa-v8-inline-layer','nfa-v9-composer-layer');
    layer.classList.add('nfa-v10-quarantined');
    layer.setAttribute('aria-hidden','true');
    try { layer.inert = true; } catch (_) {}
    layer.style.setProperty('display','none','important');
    layer.style.setProperty('pointer-events','none','important');
    document.body.style.overflow = '';
  }
  function parkComposerPanel() {
    const layer = legacyLayer();
    const panel = state.panel || document.querySelector('#nfaTaskComposerV10 .nt-action-panel');
    if (layer && panel && panel.parentElement !== layer) {
      panel.classList.remove('nfa-v10-composer-panel');
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      layer.appendChild(panel);
    }
    state.panel = null;
    quarantineLegacyLayer();
  }

  function findComposerRoot() {
    const send = document.getElementById('sendBtn');
    if (!send) return null;
    let node = send.parentElement;
    while (node && node !== document.body) {
      if (node.querySelector?.('.ql-container') && node.querySelector?.('#sendBtn')) return node;
      node = node.parentElement;
    }
    return send.parentElement?.parentElement || send.parentElement;
  }
  function hideNormalComposer(root) {
    if (!root) return;
    const selectors = ['.ql-toolbar','.ql-container','#sendBtn','#replyBanner','[onclick*="toggleInputEmojiPicker"]','label[for="fileAttachment"]','[onclick*="fileAttachment"]'];
    root.querySelectorAll(selectors.join(',')).forEach(el => {
      if (el.closest('#nfaTaskComposerV10')) return;
      if (!el.dataset.nfaV10PrevDisplay) el.dataset.nfaV10PrevDisplay = el.style.display || '__EMPTY__';
      el.style.display = 'none';
    });
    root.classList.add('nfa-v10-task-mode');
  }
  function restoreNormalComposer(root) {
    if (!root) return;
    root.querySelectorAll('[data-nfa-v10-prev-display]').forEach(el => {
      const previous = el.dataset.nfaV10PrevDisplay;
      if (previous === '__EMPTY__') el.style.removeProperty('display');
      else el.style.display = previous;
      delete el.dataset.nfaV10PrevDisplay;
    });
    root.classList.remove('nfa-v10-task-mode');
  }
  function ensureHost() {
    const root = findComposerRoot();
    if (!root) return null;
    state.composerRoot = root;
    let host = document.getElementById('nfaTaskComposerV10');
    if (!host) {
      host = document.createElement('section');
      host.id = 'nfaTaskComposerV10';
      host.setAttribute('aria-live','polite');
      root.appendChild(host);
    }
    state.host = host;
    return host;
  }

  function targetCandidates(action) {
    const active = state.assignees.filter(a => !['accepted','cancelled','transferred'].includes(effectiveStatus(a)));
    if (action === 'approve' || action === 'return') return active.filter(a => effectiveStatus(a) === 'submitted');
    if (action === 'remind') return active.filter(a => effectiveStatus(a) === 'pending_ack');
    if (action === 'transfer') return active;
    return [];
  }
  function availableActions() {
    const out = [], mine = currentAssignment(), status = effectiveStatus(mine);
    if (mine) {
      if (status === 'pending_ack') out.push('ack');
      if (status === 'acknowledged') out.push('start');
      if (status === 'in_progress' || status === 'needs_review') out.push('update','upload','delegate','extension','submit');
    }
    if (isCreator()) {
      if (state.assignees.some(a => effectiveStatus(a) === 'submitted')) out.push('approve','return');
      if (state.assignees.some(a => effectiveStatus(a) === 'pending_ack')) out.push('remind');
      out.push('deadline');
      if (state.assignees.some(a => !['accepted','cancelled','transferred'].includes(effectiveStatus(a)))) out.push('transfer');
      const active = state.assignees.filter(a => !['cancelled','transferred'].includes(effectiveStatus(a)));
      if (active.length && !active.every(a => effectiveStatus(a) === 'accepted')) out.push('cancel');
    }
    return [...new Set(out)];
  }
  function taskStatusLabel() {
    const statuses = state.assignees.map(effectiveStatus).filter(s => !['cancelled','transferred'].includes(s));
    if (!statuses.length) return 'No active assignees';
    if (statuses.every(s => s === 'accepted')) return 'Completed';
    if (statuses.every(s => s === 'submitted')) return 'Review Required';
    if (statuses.every(s => s === 'pending_ack')) return 'Awaiting';
    if (statuses.some(s => s === 'needs_review')) return 'Changes Required';
    if (statuses.some(s => s === 'submitted')) return 'Mixed Progress';
    if (statuses.some(s => s === 'in_progress')) return 'In Progress';
    if (statuses.some(s => s === 'acknowledged')) return 'Acknowledged';
    return 'In Progress';
  }

  function renderComposer() {
    const host = ensureHost();
    if (!host || !state.task) return;
    quarantineLegacyLayer();
    hideNormalComposer(state.composerRoot);
    const actions = availableActions();
    if (state.action && !actions.includes(state.action)) state.action = '';
    const candidates = targetCandidates(state.action);
    if (candidates.length && !candidates.some(a => a.assignee_id === state.targetAssigneeId)) {
      state.targetAssigneeId = candidates[0].assignee_id;
    }
    host.innerHTML = `<div class="nfa-v10-context"><div class="nfa-v10-context-copy"><span class="nfa-v10-task-pill">TASK</span><div><strong>${esc(state.task.title || 'Task')}</strong><span>${esc(taskStatusLabel())}${state.task.deadline ? ` · Due ${esc(window.getISTDate?.(state.task.deadline) || state.task.deadline)}` : ''}</span></div></div><button type="button" class="nfa-v10-exit" data-v10-exit-task>${icon('close',16)}<span>Exit Task</span></button></div><div class="nfa-v10-task-note">Reply is task-update mode. Use the permitted actions below.</div><div class="nfa-v10-actions" role="toolbar" aria-label="Task actions">${actions.map(key => `<button type="button" class="${state.action === key ? 'nfa-active' : ''} ${key === 'cancel' ? 'nfa-danger' : ''}" data-v10-action="${key}">${icon(ACTION_META[key].icon,16)}<span>${esc(key === 'submit' && effectiveStatus(currentAssignment()) === 'needs_review' ? 'Resubmit' : ACTION_META[key].label)}</span></button>`).join('')}</div>${candidates.length ? `<label class="nfa-v10-target"><span>Assignee</span><select data-v10-target>${candidates.map(a => `<option value="${esc(a.assignee_id)}" ${a.assignee_id === state.targetAssigneeId ? 'selected' : ''}>${esc(userName(a.assignee_id))}</option>`).join('')}</select></label>` : ''}<div class="nfa-v10-action-body" data-v10-action-body>${state.action ? '' : '<div class="nfa-v10-empty">Choose an available task action.</div>'}</div>`;
    host.querySelector('[data-v10-exit-task]')?.addEventListener('click', exitTaskMode);
    host.querySelector('[data-v10-target]')?.addEventListener('change', event => { state.targetAssigneeId = event.target.value; });
    host.querySelectorAll('[data-v10-action]').forEach(button => button.addEventListener('click', () => selectAction(button.dataset.v10Action)));
  }

  function mountLegacyPanel(action, attempt=0) {
    const layer = legacyLayer();
    const panel = layer?.querySelector('.nt-action-panel') || state.panel;
    const body = state.host?.querySelector('[data-v10-action-body]');
    quarantineLegacyLayer();
    if (!panel || !body) {
      if (attempt < 10) requestAnimationFrame(() => mountLegacyPanel(action, attempt + 1));
      return false;
    }
    state.panel = panel;
    panel.classList.remove('nfa-v8-inline-panel','nfa-v9-composer-panel');
    panel.classList.add('nfa-v10-composer-panel');
    panel.setAttribute('role','region');
    panel.setAttribute('aria-modal','false');
    body.replaceChildren(panel);
    document.body.style.overflow = '';
    panel.querySelectorAll('i').forEach(i => { i.style.display = 'none'; });
    const primary = panel.querySelector('#ntTaskActionPrimary');
    if (primary && !primary.querySelector('.nfa-v10-icon')) {
      primary.insertAdjacentHTML('afterbegin', icon((ACTION_META[action] || ACTION_META.update).icon,16));
    }
    requestAnimationFrame(() => panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({preventScroll:true}));
    return true;
  }
  function selectedTarget(action) {
    const candidates = targetCandidates(action);
    if (!candidates.length) return '';
    if (candidates.some(a => a.assignee_id === state.targetAssigneeId)) return state.targetAssigneeId;
    state.targetAssigneeId = candidates[0].assignee_id;
    return state.targetAssigneeId;
  }

  async function runDirect(action) {
    if (state.busy || !state.task) return;
    state.busy = true;
    try {
      const mine = currentAssignment(), mineId = mine?.assignee_id || window.currentUser?.id || '';
      let result = true;
      if (action === 'ack') result = await window.taskAction?.(state.taskId,mineId,'ack');
      else if (action === 'start') result = await window.taskAction?.(state.taskId,mineId,'start');
      else if (action === 'submit') result = await window.taskAction?.(state.taskId,mineId,'submit',Boolean(state.task.require_proof));
      else if (action === 'approve') {
        const target = selectedTarget(action);
        if (!target) return toast('No submitted assignee is available.','fa-solid fa-circle-info','text-yellow-500');
        result = await window.taskAction?.(state.taskId,target,'accept');
      } else if (action === 'remind') {
        const target = selectedTarget(action);
        if (!target) return toast('No awaiting assignee is available.','fa-solid fa-circle-info','text-yellow-500');
        result = await window.sendTaskReminder?.(state.taskId,target);
        if (result === false) return;
      }
      if (result !== false) await afterSuccessfulAction();
    } finally { state.busy = false; }
  }

  function invokePanel(action) {
    if (!state.task) return;
    parkComposerPanel();
    let owner = null, args = [];
    const mine = currentAssignment(), mineId = mine?.assignee_id || window.currentUser?.id || '';
    if (action === 'update') { owner = window.openTaskUpdateAction; args = [state.taskId,mineId]; }
    if (action === 'upload') { owner = window.openTaskUploadAction; args = [state.taskId,mineId]; }
    if (action === 'delegate') { owner = window.openTaskDelegateAction; args = [state.taskId,mineId]; }
    if (action === 'extension') { owner = window.openTaskExtensionRequest; args = [state.taskId,mineId]; }
    if (action === 'return') {
      const target = selectedTarget(action);
      if (!target) return toast('No submitted assignee is available.','fa-solid fa-circle-info','text-yellow-500');
      owner = window.openTaskReturnAction; args = [state.taskId,target];
    }
    if (action === 'transfer') {
      const target = selectedTarget(action);
      if (!target) return toast('Select an active assignee first.','fa-solid fa-circle-info','text-yellow-500');
      owner = window.openTaskTransferAction; args = [state.taskId,target];
    }
    if (action === 'deadline') { owner = window.openTaskDeadlineAction; args = [state.taskId]; }
    if (action === 'cancel') { owner = window.openTaskCancelAction; args = [state.taskId]; }
    if (typeof owner !== 'function') return toast('This task action is not available.','fa-solid fa-circle-exclamation','text-yellow-500');
    quarantineLegacyLayer();
    owner.apply(window,args);
    quarantineLegacyLayer();
    mountLegacyPanel(action);
    requestAnimationFrame(() => mountLegacyPanel(action));
  }

  function selectAction(action) {
    if (!availableActions().includes(action)) return;
    state.pendingCommit = false;
    state.action = action;
    const candidates = targetCandidates(action);
    if (candidates.length && !candidates.some(a => a.assignee_id === state.targetAssigneeId)) state.targetAssigneeId = candidates[0].assignee_id;
    renderComposer();
    if (['ack','start','submit','approve','remind'].includes(action)) {
      const body = state.host?.querySelector('[data-v10-action-body]');
      if (body) body.innerHTML = `<div class="nfa-v10-direct-confirm"><span>${icon(ACTION_META[action].icon,18)}</span><strong>${esc(action === 'submit' && effectiveStatus(currentAssignment()) === 'needs_review' ? 'Resubmit' : ACTION_META[action].label)}</strong><button type="button" data-v10-direct-confirm>Confirm</button></div>`;
      body?.querySelector('[data-v10-direct-confirm]')?.addEventListener('click', () => runDirect(action));
      return;
    }
    invokePanel(action);
  }

  async function loadTask(taskId) {
    const sb = window.sb, tid = window.currentTenantId;
    if (!sb || !tid || !taskId) return null;
    const [taskRes, assigneeRes] = await Promise.all([
      sb.from('tasks').select('*').eq('tenant_id',tid).eq('id',taskId).maybeSingle(),
      sb.from('task_assignees').select('*').eq('tenant_id',tid).eq('task_id',taskId),
    ]);
    if (taskRes.error || !taskRes.data) return null;
    state.task = taskRes.data;
    state.assignees = assigneeRes.data || [];
    return state.task;
  }
  function ensureRepliesOpen(messageId) {
    const id = cleanId(messageId);
    if (!id) return;
    const wrap = document.getElementById(`rw-${id}`);
    if (wrap && getComputedStyle(wrap).display === 'none') window.toggleReplies?.(`rw-${id}`);
  }
  function toggleTaskRepliesOnly(messageId) {
    quarantineLegacyLayer();
    const id = cleanId(messageId);
    if (!id) return;
    window.toggleReplies?.(`rw-${id}`);
    requestAnimationFrame(decorateTaskReplies);
  }

  async function activateTaskMode(taskId, messageId) {
    const id = cleanId(taskId), mid = cleanId(messageId);
    if (!id || !mid) return;
    parkComposerPanel();
    quarantineLegacyLayer();
    state.taskId = id;
    state.messageId = mid;
    state.action = '';
    state.targetAssigneeId = '';
    const task = await loadTask(id);
    if (!task) return toast('Task could not be loaded.','fa-solid fa-circle-exclamation','text-yellow-500');
    ensureRepliesOpen(mid);
    renderComposer();
    const mine = currentAssignment(), status = effectiveStatus(mine);
    if (mine && (status === 'in_progress' || status === 'needs_review')) selectAction('update');
    else {
      const first = availableActions()[0] || '';
      if (first && ['ack','start'].includes(first)) selectAction(first);
    }
    state.composerRoot?.scrollIntoView?.({block:'nearest'});
  }

  function exitTaskMode() {
    parkComposerPanel();
    quarantineLegacyLayer();
    if (state.host) { state.host.remove(); state.host = null; }
    restoreNormalComposer(state.composerRoot);
    state.taskId = '';
    state.messageId = '';
    state.task = null;
    state.assignees = [];
    state.action = '';
    state.targetAssigneeId = '';
    state.pendingCommit = false;
    window.cancelReply?.();
    window.quillEditor?.focus?.({preventScroll:true});
  }

  async function afterSuccessfulAction() {
    const taskId = state.taskId, messageId = state.messageId;
    if (!taskId || !messageId) return;
    try {
      state.pendingCommit = false;
      state.action = '';
      parkComposerPanel();
      quarantineLegacyLayer();
      await window.nfaRefreshTaskMessages?.();
      await window.loadMessages?.();
      await loadTask(taskId);
      ensureRepliesOpen(messageId);
      renderComposer();
      await window.nfaNavigateToMessage?.(messageId,{taskId});
      ensureRepliesOpen(messageId);
      decorateTaskReplies();
      upgradeWorkspaceIcons();
    } catch (error) {
      console.warn('[desktop-task-composer-v10] refresh/return failed',error);
    }
  }

  function fileKind(nameOrPath) {
    const ext = String(nameOrPath || '').split('?')[0].split('.').pop().toLowerCase();
    if (ext === 'pdf') return {ext,label:'PDF',colour:'#dc2626'};
    if (['doc','docx'].includes(ext)) return {ext,label:'Word',colour:'#2563eb'};
    if (['xls','xlsx','csv'].includes(ext)) return {ext,label:'Excel',colour:'#16a34a'};
    if (['ppt','pptx'].includes(ext)) return {ext,label:'PowerPoint',colour:'#ea580c'};
    if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return {ext,label:'Image',colour:'#7c3aed'};
    if (['zip','rar','7z'].includes(ext)) return {ext,label:'Archive',colour:'#64748b'};
    return {ext,label:'File',colour:'#64748b'};
  }
  function securePathFromAnchor(anchor) {
    const onclick = anchor.getAttribute('onclick') || '';
    const match = onclick.match(/openSecureFile\(['"]([^'"]+)['"]\)/i);
    if (match) return decodeURIComponent(match[1]);
    const href = anchor.getAttribute('href') || '';
    if (/^https:\/\/secure-file\.local\//i.test(href)) return decodeURIComponent(href.replace(/^https:\/\/secure-file\.local\//i,''));
    return '';
  }
  function cleanFileName(text, path) {
    const raw = String(text || '').replace(/^📁\s*/,'').replace(/^Attached File:\s*/i,'').trim();
    const withoutSize = raw.replace(/\s*\([^)]+\)\s*$/,'').trim();
    return withoutSize || String(path || '').split('/').pop() || 'Attached File';
  }
  function makeReplyFileCard(path, name) {
    const kind = fileKind(name || path);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nfa-v10-reply-file';
    button.style.setProperty('--nfa-file-colour',kind.colour);
    button.dataset.nfaSecurePath = path;
    button.innerHTML = `<span class="nfa-v10-file-icon">${icon('file',22)}</span><span class="nfa-v10-file-copy"><strong>${esc(name)}</strong><small>${esc(kind.label)} · Click to open</small></span><span class="nfa-v10-file-open">${icon('external',15)}</span>`;
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); window.openSecureFile?.(path); });
    return button;
  }
  function decorateReplyFiles(reply) {
    const text = reply.querySelector('.reply-text');
    if (!text) return;
    text.querySelectorAll('a').forEach(anchor => {
      if (anchor.dataset.nfaV10FileDone === '1') return;
      const path = securePathFromAnchor(anchor);
      if (!path) return;
      const name = cleanFileName(anchor.textContent,path);
      const card = makeReplyFileCard(path,name);
      anchor.dataset.nfaV10FileDone = '1';
      anchor.replaceWith(card);
    });
    if (!text.querySelector('.nfa-v10-reply-file')) {
      const raw = text.textContent || '';
      const match = raw.match(/([^|\n]+)\|(tasks\/[^\s<]+)/i);
      if (match) text.replaceChildren(makeReplyFileCard(match[2],cleanFileName(match[1],match[2])));
    }
  }
  function compactReplyTools(reply) {
    if (reply.querySelector('.nfa-v10-reply-tools')) return;
    const tools = [...reply.querySelectorAll('.e-add,.reply-reaction,.reaction-btn,button[title*="reaction" i],button[title*="emoji" i]')]
      .filter(node => !node.closest('.nfa-v10-reply-file'));
    if (!tools.length) return;
    const slot = document.createElement('div');
    slot.className = 'nfa-v10-reply-tools';
    tools.forEach(tool => slot.appendChild(tool));
    reply.appendChild(slot);
  }
  function decorateTaskReplies() {
    document.querySelectorAll('#messagesContainer .nfa-has-task-v8 .reply-item').forEach(reply => {
      decorateReplyFiles(reply);
      compactReplyTools(reply);
    });
  }

  function normalizeUtcTimestamp(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (/[zZ]$/.test(trimmed) || /[+-]\d\d:?\d\d$/.test(trimmed)) return trimmed;
    return trimmed.replace(' ','T') + 'Z';
  }
  function installActivityTimeOwner() {
    const owner = window.NFA_buildActivity;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10Time) return true;
    const wrapped = async function(...args) {
      const result = await owner.apply(this,args);
      if (Array.isArray(result?.items)) {
        result.items.forEach(item => {
          if (item?.n?.created_at) item.n.created_at = normalizeUtcTimestamp(item.n.created_at);
        });
        result.items.sort((a,b) => new Date(b?.n?.created_at || 0) - new Date(a?.n?.created_at || 0));
      }
      return result;
    };
    wrapped.__nfaV10Time = true;
    wrapped.__nfaOriginal = owner;
    window.NFA_buildActivity = wrapped;
    if (window._activityFeedOpen) requestAnimationFrame(() => window._loadActivityFeed?.());
    return true;
  }

  function installReminderDedupe() {
    const owner = window.sendTaskReminder;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10Dedupe) return true;
    const wrapped = async function(taskId,assigneeId,...rest) {
      const key = `${cleanId(taskId)}:${cleanId(assigneeId)}`;
      const now = Date.now();
      if (!key || key === ':') return false;
      if (state.reminderInflight.has(key)) return false;
      const last = state.reminderLast.get(key) || 0;
      if (now - last < 2500) return false;
      state.reminderInflight.add(key);
      try {
        const result = await owner.call(this,taskId,assigneeId,...rest);
        if (result !== false) state.reminderLast.set(key,Date.now());
        return result;
      } finally {
        state.reminderInflight.delete(key);
      }
    };
    wrapped.__nfaV10Dedupe = true;
    wrapped.__nfaOriginal = owner;
    window.sendTaskReminder = wrapped;
    return true;
  }

  function installCloseOwner() {
    const owner = window.closeTaskActionLayer;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10) return true;
    state.closeOwner = owner;
    const wrapped = function(...args) {
      if (!state.taskId) return state.closeOwner.apply(this,args);
      const commit = state.pendingCommit;
      state.pendingCommit = false;
      parkComposerPanel();
      quarantineLegacyLayer();
      if (commit) Promise.resolve().then(afterSuccessfulAction);
      else requestAnimationFrame(renderComposer);
      return true;
    };
    wrapped.__nfaV10 = true;
    wrapped.__nfaOriginal = owner;
    window.closeTaskActionLayer = wrapped;
    return true;
  }

  function installCapture() {
    if (document.documentElement.dataset.nfaTaskComposerV10Capture === '1') return;
    document.documentElement.dataset.nfaTaskComposerV10Capture = '1';
    document.addEventListener('click', event => {
      if (!isDesktop()) return;
      const taskAction = event.target.closest('#messagesContainer .nfa-has-task-v8 .act-btn');
      if (taskAction) {
        const label = (taskAction.textContent || '').replace(/\s+/g,' ').trim();
        const row = taskAction.closest('.row-sent,.row-rcvd');
        const taskNode = row?.querySelector('[data-v8-task-message]');
        const taskId = cleanId(taskNode?.dataset.v8TaskMessage);
        const messageId = cleanId(row?.id?.replace(/^row-/,''));
        if (/^Replies\b/i.test(label) && messageId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          toggleTaskRepliesOnly(messageId);
          return;
        }
        if (/^Reply\b/i.test(label) && taskId && messageId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          activateTaskMode(taskId,messageId);
          return;
        }
      }
      const primary = event.target.closest('#nfaTaskComposerV10 #ntTaskActionPrimary');
      if (primary) state.pendingCommit = true;
      const cancel = event.target.closest('#nfaTaskComposerV10 .nt-task-button-secondary,#nfaTaskComposerV10 [data-v10-exit-task]');
      if (cancel) state.pendingCommit = false;
    },true);
  }

  function installThemeOwner() {
    enforceTwoThemes();
    const owner = window.setTheme;
    if (typeof owner === 'function' && !owner.__nfaV10) {
      const wrapped = function(themeId) {
        const safe = themeId === 'dark' ? 'dark' : 'light';
        const result = owner.call(this,safe);
        requestAnimationFrame(() => { enforceTwoThemes(); upgradeWorkspaceIcons(); decorateTaskReplies(); });
        return result;
      };
      wrapped.__nfaV10 = true;
      wrapped.__nfaOriginal = owner;
      window.setTheme = wrapped;
    }
    return true;
  }
  function installRefreshHook() {
    const owner = window.nfaRefreshTaskMessages;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10) return true;
    const wrapped = async function(...args) {
      const result = await owner.apply(this,args);
      requestAnimationFrame(() => { quarantineLegacyLayer(); upgradeWorkspaceIcons(); decorateTaskReplies(); });
      return result;
    };
    wrapped.__nfaV10 = true;
    wrapped.__nfaOriginal = owner;
    window.nfaRefreshTaskMessages = wrapped;
    return true;
  }
  function installMessageRenderHook() {
    const owner = window.renderMessages;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10) return true;
    const wrapped = function(...args) {
      const result = owner.apply(this,args);
      requestAnimationFrame(() => { quarantineLegacyLayer(); upgradeWorkspaceIcons(); decorateTaskReplies(); });
      return result;
    };
    wrapped.__nfaV10 = true;
    wrapped.__nfaOriginal = owner;
    window.renderMessages = wrapped;
    return true;
  }
  function installRenderHook() {
    const owner = window.renderMainApp;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV10) return true;
    const wrapped = async function(...args) {
      const result = await owner.apply(this,args);
      requestAnimationFrame(() => {
        enforceTwoThemes(); quarantineLegacyLayer(); upgradeWorkspaceIcons(); decorateTaskReplies();
        if (state.taskId) renderComposer();
      });
      return result;
    };
    wrapped.__nfaV10 = true;
    wrapped.__nfaOriginal = owner;
    window.renderMainApp = wrapped;
    return true;
  }

  function mount() {
    if (!isDesktop()) return;
    enforceTwoThemes();
    quarantineLegacyLayer();
    upgradeWorkspaceIcons();
    decorateTaskReplies();
    if (state.taskId) renderComposer();
  }

  function installWhenReady() {
    if (!isDesktop()) return;
    const ready = Boolean(
      window.nfaRefreshTaskMessages && window.nfaNavigateToMessage && window.taskAction &&
      window.closeTaskActionLayer && window.sendTaskReminder && window.NFA_buildActivity &&
      document.getElementById('sendBtn')
    );
    if (ready) {
      installCloseOwner();
      installReminderDedupe();
      installActivityTimeOwner();
      installCapture();
      installThemeOwner();
      installRenderHook();
      installRefreshHook();
      installMessageRenderHook();
      mount();
      return;
    }
    state.installFrames += 1;
    if (state.installFrames < 360) requestAnimationFrame(installWhenReady);
  }

  window.nfaExitTaskComposer = exitTaskMode;
  window.nfaActivateTaskComposer = activateTaskMode;
  window.nfaDecorateTaskReplies = decorateTaskReplies;
  requestAnimationFrame(installWhenReady);
})();