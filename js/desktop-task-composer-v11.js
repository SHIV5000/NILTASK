/* Noted For Action — Desktop Task Composer v11
 * One composer, same as chat: formatting + emoji + paperclip + Send.
 * Task Reply binds the existing chat composer. Send determines UPDATE vs UPLOAD.
 * Only special task actions remain explicit: Delegate, Transfer, Extension, Submit.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_COMPOSER_V11__) return;
  window.__NFA_DESKTOP_TASK_COMPOSER_V11__ = true;

  const RICH_PREFIX = '[NFA_RICH]';
  const NOTE_PREFIX = '[NFA_NOTE]';
  const state = {
    taskId: '', messageId: '', task: null, assignees: [], targetAssigneeId: '',
    composerRoot: null, context: null, specialPanel: null, legacyPanel: null,
    chatDraftHtml: null, pendingFile: null, pendingPreviewUrl: '',
    busy: false, pendingCommit: false, closeOwner: null, installFrames: 0,
    reminderInflight: new Set(), reminderLast: new Map(),
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
  function toast(message, icon='fa-solid fa-circle-info', colour='text-blue-500') {
    window.showCenterToast?.(message, icon, colour);
  }
  function userName(userId, profileMap) {
    const p = profileMap?.get?.(userId) || (window.globalUsersCache || []).find(user => user.id === userId);
    return p?.full_name || p?.email?.split('@')[0] || (userId === window.currentUser?.id ? 'You' : 'Staff member');
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
  function taskState() {
    const statuses = state.assignees.map(effectiveStatus).filter(s => !['cancelled','transferred'].includes(s));
    if (!statuses.length) return 'empty';
    if (statuses.every(s => s === 'accepted')) return 'accepted';
    if (statuses.every(s => s === 'submitted')) return 'submitted';
    if (statuses.every(s => s === 'pending_ack')) return 'pending_ack';
    if (statuses.some(s => s === 'needs_review')) return 'needs_review';
    if (statuses.some(s => s === 'submitted')) return 'mixed';
    if (statuses.some(s => s === 'in_progress')) return 'in_progress';
    if (statuses.some(s => s === 'acknowledged')) return 'acknowledged';
    return statuses[0] || 'in_progress';
  }
  function taskStatusLabel() {
    return ({
      pending_ack:'Awaiting', acknowledged:'Acknowledged', in_progress:'In Progress',
      submitted:'Review Required', needs_review:'Changes Required', accepted:'Completed',
      transferred:'Transferred', cancelled:'Cancelled', mixed:'Mixed Progress', empty:'No Active Assignees'
    })[taskState()] || 'In Progress';
  }

  function icon(name, size=17) {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    const paths = {
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      chat:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
      tasks:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2m-3 7 1 1 2-2m-3 7 1 1 2-2"/>',
      activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
      schedule:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
      dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      pdf:'<path d="M6 2h9l5 5v15H6Z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 18h5"/>',
      reply:'<path d="m9 17-5-5 5-5"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',
      delegate:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
      transfer:'<path d="m7 7-4 4 4 4"/><path d="M3 11h13a4 4 0 0 1 4 4v1"/><path d="m17 17 4-4-4-4"/>',
      extension:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      submit:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
      external:'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
      file:'<path d="M6 2h9l5 5v15H6Z"/><path d="M14 2v6h6"/>'
    };
    return `<svg class="nfa-v11-icon" ${common}>${paths[name] || paths.file}</svg>`;
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
      if (!key || button.querySelector('.nfa-v11-icon')) return;
      const old = button.querySelector('i,.nfa-v9-icon,.nfa-v10-icon');
      if (old) old.outerHTML = icon(key,19);
    });
    document.querySelectorAll('[data-v8-task-reminder]').forEach(button => {
      if (!button.querySelector('.nfa-v11-icon')) button.innerHTML = icon('bell',16);
    });
    document.querySelectorAll('[data-v8-task-pdf]').forEach(button => {
      if (!button.querySelector('.nfa-v11-icon')) button.innerHTML = icon('pdf',16);
    });
    document.querySelectorAll('#messagesContainer .nfa-has-task-v8 .act-btn').forEach(button => {
      const label = (button.textContent || '').replace(/\s+/g,' ').trim();
      if (/^Reply\b/i.test(label) && !button.querySelector('.nfa-v11-icon')) {
        const old = button.querySelector('i,.nfa-v9-icon,.nfa-v10-icon');
        if (old) old.outerHTML = icon('reply',15);
      }
    });
  }

  function legacyLayer() { return document.getElementById('ntTaskActionLayer'); }
  function quarantineLegacyLayer() {
    const layer = legacyLayer();
    if (!layer) return;
    layer.classList.remove('nt-open','nfa-v8-inline-layer','nfa-v9-composer-layer','nfa-v10-composer-layer');
    layer.classList.add('nfa-v11-quarantined');
    layer.setAttribute('aria-hidden','true');
    try { layer.inert = true; } catch (_) {}
    layer.style.setProperty('display','none','important');
    layer.style.setProperty('visibility','hidden','important');
    layer.style.setProperty('pointer-events','none','important');
    document.body.style.overflow = '';
  }
  function parkLegacyPanel() {
    const layer = legacyLayer();
    const panel = state.legacyPanel || state.specialPanel?.querySelector('.nt-action-panel');
    if (layer && panel && panel.parentElement !== layer) {
      panel.classList.remove('nfa-v11-inline-panel');
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      layer.appendChild(panel);
    }
    state.legacyPanel = null;
    quarantineLegacyLayer();
  }

  function findComposerRoot() {
    const send = document.getElementById('sendBtn');
    if (!send) return null;
    let node = send.parentElement;
    while (node && node !== document.body) {
      if (node.querySelector?.('.ql-container') && node.querySelector?.('#toolbar-container') && node.querySelector?.('#sendBtn')) return node;
      node = node.parentElement;
    }
    return send.parentElement?.parentElement || send.parentElement;
  }

  function allowedColour(value) {
    const v = String(value || '').replace(/\s+/g,'').toLowerCase();
    const map = {
      '#800000':'#800000','rgb(128,0,0)':'#800000',
      '#006400':'#006400','rgb(0,100,0)':'#006400',
      '#00008b':'#00008b','rgb(0,0,139)':'#00008b'
    };
    return map[v] || '';
  }
  function sanitizeRichHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','STRIKE','UL','OL','LI','SPAN']);
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        const colour = child.tagName === 'SPAN' ? allowedColour(child.style?.color) : '';
        [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
        if (colour) child.setAttribute('style',`color:${colour}`);
        walk(child);
      });
    };
    walk(template.content);
    return template.innerHTML.trim();
  }
  function richPlainText(html) {
    const node = document.createElement('div');
    node.innerHTML = sanitizeRichHtml(html);
    return String(node.innerText || node.textContent || '').replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }
  function clearQuill() {
    if (window.quillEditor?.setText) window.quillEditor.setText('');
    else if (window.quillEditor?.root) window.quillEditor.root.innerHTML = '';
  }
  function quillHtml() {
    const html = window.quillEditor?.root?.innerHTML || '';
    return sanitizeRichHtml(html.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g,''));
  }

  function availableSpecialActions() {
    const actions = [], mine = currentAssignment(), status = effectiveStatus(mine);
    if (mine && (status === 'in_progress' || status === 'needs_review')) actions.push('delegate','extension','submit');
    if (isCreator() && state.assignees.some(a => !closed(effectiveStatus(a)) && effectiveStatus(a) !== 'accepted')) actions.push('transfer');
    return actions;
  }
  function activeTransferTargets() {
    return state.assignees.filter(a => !closed(effectiveStatus(a)) && effectiveStatus(a) !== 'accepted');
  }

  function revokePendingPreview() {
    if (!state.pendingPreviewUrl) return;
    try { URL.revokeObjectURL(state.pendingPreviewUrl); } catch (_) {}
    state.pendingPreviewUrl = '';
  }
  function clearPendingFile() {
    revokePendingPreview();
    state.pendingFile = null;
    const input = document.getElementById('fileAttachment');
    if (input) input.value = '';
  }
  function fileKind(nameOrPath) {
    const ext = String(nameOrPath || '').split('?')[0].split('.').pop().toLowerCase();
    if (ext === 'pdf') return {label:'PDF',icon:'fa-file-pdf',colour:'#dc2626'};
    if (['doc','docx'].includes(ext)) return {label:'Word',icon:'fa-file-word',colour:'#2563eb'};
    if (['xls','xlsx','csv'].includes(ext)) return {label:'Excel',icon:'fa-file-excel',colour:'#16a34a'};
    if (['ppt','pptx'].includes(ext)) return {label:'PowerPoint',icon:'fa-file-powerpoint',colour:'#ea580c'};
    if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return {label:'Image',icon:'fa-file-image',colour:'#7c3aed',image:true};
    if (['zip','rar','7z'].includes(ext)) return {label:'Archive',icon:'fa-file-zipper',colour:'#64748b'};
    return {label:'File',icon:'fa-file',colour:'#64748b'};
  }
  function renderPendingFile() {
    const slot = state.context?.querySelector('[data-v11-file-slot]');
    if (!slot) return;
    if (!state.pendingFile) {
      slot.replaceChildren();
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    const file = state.pendingFile;
    const kind = fileKind(file.name);
    const image = String(file.type || '').startsWith('image/');
    const size = file.size >= 1024*1024 ? `${(file.size/1024/1024).toFixed(1)} MB` : `${(file.size/1024).toFixed(1)} KB`;
    slot.innerHTML = `<div class="nfa-v11-pending-file"><span class="nfa-v11-pending-thumb">${image ? '<img data-v11-pending-img alt="">' : `<i class="fa-solid ${kind.icon}"></i>`}</span><span class="nfa-v11-pending-copy"><strong>${esc(file.name)}</strong><small>${esc(kind.label)} · ${size} · Send will upload to this task</small></span><button type="button" data-v11-remove-file aria-label="Remove attachment">×</button></div>`;
    if (image) {
      revokePendingPreview();
      state.pendingPreviewUrl = URL.createObjectURL(file);
      const img = slot.querySelector('[data-v11-pending-img]');
      if (img) img.src = state.pendingPreviewUrl;
    }
    slot.querySelector('[data-v11-remove-file]')?.addEventListener('click', () => {
      clearPendingFile();
      renderPendingFile();
    });
  }

  function renderContext() {
    const root = findComposerRoot();
    if (!root || !state.task) return false;
    state.composerRoot = root;
    let context = document.getElementById('nfaTaskComposerV11');
    if (!context) {
      context = document.createElement('section');
      context.id = 'nfaTaskComposerV11';
      root.insertBefore(context, root.firstChild);
    }
    state.context = context;
    root.classList.add('nfa-v11-task-mode');
    quarantineLegacyLayer();

    const actions = availableSpecialActions();
    const targets = activeTransferTargets();
    if (targets.length && !targets.some(a => a.assignee_id === state.targetAssigneeId)) state.targetAssigneeId = targets[0].assignee_id;
    const meta = {delegate:['Delegate','delegate'],transfer:['Transfer','transfer'],extension:['Extension','extension'],submit:['Submit','submit']};
    context.innerHTML = `<div class="nfa-v11-context-line"><div class="nfa-v11-context-copy"><span class="nfa-v11-task-pill">TASK</span><div><strong>${esc(state.task.title || 'Task')}</strong><span>${esc(taskStatusLabel())} · Type + Send = Update · 📎 + Send = Upload</span></div></div><button type="button" class="nfa-v11-exit" data-v11-exit>${icon('close',15)}<span>Exit Task</span></button></div><div class="nfa-v11-special-row">${actions.map(action => `<button type="button" data-v11-special="${action}">${icon(meta[action][1],15)}<span>${meta[action][0]}</span></button>`).join('')}${actions.includes('transfer') && targets.length > 1 ? `<label class="nfa-v11-target"><span>For</span><select data-v11-target>${targets.map(a => `<option value="${esc(a.assignee_id)}" ${a.assignee_id === state.targetAssigneeId ? 'selected' : ''}>${esc(userName(a.assignee_id))}</option>`).join('')}</select></label>` : ''}</div><div class="nfa-v11-file-slot" data-v11-file-slot hidden></div><div class="nfa-v11-special-panel" data-v11-special-panel hidden></div>`;
    state.specialPanel = context.querySelector('[data-v11-special-panel]');
    context.querySelector('[data-v11-exit]')?.addEventListener('click', exitTaskMode);
    context.querySelector('[data-v11-target]')?.addEventListener('change', event => { state.targetAssigneeId = event.target.value; });
    context.querySelectorAll('[data-v11-special]').forEach(button => button.addEventListener('click', () => selectSpecialAction(button.dataset.v11Special)));
    renderPendingFile();

    const schedule = document.getElementById('composerScheduleBtn');
    if (schedule) {
      if (schedule.dataset.nfaV11PrevDisplay == null) schedule.dataset.nfaV11PrevDisplay = schedule.style.display || '__EMPTY__';
      schedule.style.display = 'none';
    }
    if (window.quillEditor?.root) window.quillEditor.root.dataset.placeholder = 'Write a task update…';
    return true;
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
    if (state.taskId) quarantineLegacyLayer();
    const id = cleanId(messageId);
    if (!id) return;
    window.toggleReplies?.(`rw-${id}`);
    requestAnimationFrame(() => { decorateTaskReplies(); decorateCompletedTasks(); });
  }

  async function activateTaskMode(taskId, messageId) {
    const id = cleanId(taskId), mid = cleanId(messageId);
    if (!id || !mid || state.busy) return;
    parkLegacyPanel();
    quarantineLegacyLayer();

    if (!state.taskId) state.chatDraftHtml = window.quillEditor?.root?.innerHTML || '';
    else if (state.taskId !== id) {
      clearPendingFile();
      clearQuill();
    }

    state.taskId = id;
    state.messageId = mid;
    state.targetAssigneeId = '';
    const task = await loadTask(id);
    if (!task) {
      state.taskId = '';
      return toast('Task could not be loaded.','fa-solid fa-circle-exclamation','text-yellow-500');
    }
    if (taskState() === 'accepted') {
      state.taskId = '';
      state.messageId = '';
      toast('Completed tasks are read-only.','fa-solid fa-lock','text-slate-500');
      decorateCompletedTasks();
      return;
    }

    clearQuill();
    ensureRepliesOpen(mid);
    renderContext();
    window.cancelReply?.();
    window.quillEditor?.focus?.();
    state.composerRoot?.scrollIntoView?.({block:'nearest'});
  }

  function exitTaskMode() {
    parkLegacyPanel();
    quarantineLegacyLayer();
    clearPendingFile();
    state.context?.remove();
    state.context = null;
    state.specialPanel = null;
    state.composerRoot?.classList.remove('nfa-v11-task-mode');
    const schedule = document.getElementById('composerScheduleBtn');
    if (schedule?.dataset.nfaV11PrevDisplay != null) {
      const previous = schedule.dataset.nfaV11PrevDisplay;
      if (previous === '__EMPTY__') schedule.style.removeProperty('display'); else schedule.style.display = previous;
      delete schedule.dataset.nfaV11PrevDisplay;
    }
    if (window.quillEditor?.root) {
      window.quillEditor.root.dataset.placeholder = 'Type a message...';
      window.quillEditor.root.innerHTML = state.chatDraftHtml || '';
    }
    state.chatDraftHtml = null;
    state.taskId = '';
    state.messageId = '';
    state.task = null;
    state.assignees = [];
    state.targetAssigneeId = '';
    state.pendingCommit = false;
    window.cancelReply?.();
    window.quillEditor?.focus?.();
  }

  function canPostTaskContent() {
    const assignment = currentAssignment();
    const status = effectiveStatus(assignment);
    return Boolean(assignment && (status === 'in_progress' || status === 'needs_review'));
  }

  async function submitTaskUpdate(html) {
    if (!canPostTaskContent()) {
      toast('Only an active in-progress assignee can post a task update.','fa-solid fa-lock','text-orange-500');
      return false;
    }
    const rich = sanitizeRichHtml(html);
    const plain = richPlainText(rich);
    if (!plain) {
      toast('Write a task update before sending.','fa-solid fa-pen','text-orange-500');
      return false;
    }
    const { error } = await window.sb.from('task_trails').insert({
      task_id: state.taskId,
      user_id: window.currentUser.id,
      tenant_id: window.currentTenantId,
      action: 'UPDATE',
      comment: RICH_PREFIX + rich,
    });
    if (error) throw error;
    return true;
  }

  async function submitTaskUpload(file, html) {
    if (!canPostTaskContent()) {
      toast('Only an active in-progress assignee can upload to this task.','fa-solid fa-lock','text-orange-500');
      return false;
    }
    if (!file) return false;
    const safeName = String(file.name || 'attachment').replace(/[^a-zA-Z0-9.\-_]/g,'_');
    const filePath = `tasks/${window.currentTenantId}/${state.taskId}/${Date.now()}_${safeName}`;
    const upload = await window.sb.storage.from('task-proofs').upload(filePath,file);
    if (upload.error) throw upload.error;

    const rich = sanitizeRichHtml(html);
    const note = richPlainText(rich);
    const comment = `${file.name}|${filePath}${note ? `|${NOTE_PREFIX}${rich}` : ''}`;
    const { error } = await window.sb.from('task_trails').insert({
      task_id: state.taskId,
      user_id: window.currentUser.id,
      tenant_id: window.currentTenantId,
      action: 'FILE',
      comment,
    });
    if (error) throw error;
    return true;
  }

  async function sendTaskComposer() {
    if (state.busy || !state.taskId || !state.task) return;
    if (taskState() === 'accepted') {
      toast('Completed tasks are read-only.','fa-solid fa-lock','text-slate-500');
      return;
    }
    const html = quillHtml();
    const plain = richPlainText(html);
    const file = state.pendingFile;
    if (!file && !plain) {
      toast('Type an update or attach a file.','fa-solid fa-pen','text-orange-500');
      return;
    }

    state.busy = true;
    const sendBtn = document.getElementById('sendBtn');
    const previous = sendBtn?.innerHTML || '';
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="ti ti-loader fa-spin text-lg"></i>'; }
    try {
      const ok = file ? await submitTaskUpload(file,html) : await submitTaskUpdate(html);
      if (!ok) return;
      clearQuill();
      clearPendingFile();
      renderPendingFile();
      toast(file ? 'Task file uploaded.' : 'Task update posted.','fa-solid fa-check','text-green-500');
      await afterSuccessfulAction();
    } catch (error) {
      console.error('[desktop-task-composer-v11] send failed',error);
      toast(error?.message || 'Task update could not be sent.','fa-solid fa-circle-xmark','text-red-500');
    } finally {
      state.busy = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = previous || '<i class="ti ti-send text-lg"></i>'; }
    }
  }

  function selectedTransferTarget() {
    const targets = activeTransferTargets();
    if (!targets.length) return '';
    if (targets.some(a => a.assignee_id === state.targetAssigneeId)) return state.targetAssigneeId;
    state.targetAssigneeId = targets[0].assignee_id;
    return state.targetAssigneeId;
  }

  function showSubmitConfirm() {
    const panel = state.specialPanel;
    if (!panel) return;
    parkLegacyPanel();
    panel.hidden = false;
    panel.innerHTML = `<div class="nfa-v11-confirm"><span>${icon('submit',18)}</span><div><strong>${effectiveStatus(currentAssignment()) === 'needs_review' ? 'Resubmit task?' : 'Submit task for review?'}</strong><small>This changes the task status and notifies the task owner.</small></div><button type="button" data-v11-confirm-submit>Confirm</button><button type="button" data-v11-cancel-special>Cancel</button></div>`;
    panel.querySelector('[data-v11-cancel-special]')?.addEventListener('click', () => { panel.hidden = true; panel.replaceChildren(); });
    panel.querySelector('[data-v11-confirm-submit]')?.addEventListener('click', async () => {
      if (state.busy) return;
      const mine = currentAssignment();
      if (!mine) return;
      state.busy = true;
      try {
        const result = await window.taskAction?.(state.taskId,mine.assignee_id,'submit',Boolean(state.task.require_proof));
        if (result !== false) await afterSuccessfulAction();
      } finally { state.busy = false; }
    });
  }

  function mountLegacyPanel(action, attempt=0) {
    const layer = legacyLayer();
    const panel = layer?.querySelector('.nt-action-panel') || state.legacyPanel;
    const host = state.specialPanel;
    quarantineLegacyLayer();
    if (!panel || !host) {
      if (attempt < 12) requestAnimationFrame(() => mountLegacyPanel(action,attempt+1));
      return false;
    }
    state.legacyPanel = panel;
    panel.classList.remove('nfa-v8-inline-panel','nfa-v9-composer-panel','nfa-v10-composer-panel');
    panel.classList.add('nfa-v11-inline-panel');
    panel.setAttribute('role','region');
    panel.setAttribute('aria-modal','false');
    host.hidden = false;
    host.replaceChildren(panel);
    panel.querySelectorAll('i').forEach(i => { i.style.display='none'; });
    requestAnimationFrame(() => panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({preventScroll:true}));
    return true;
  }

  function invokeInlineSpecial(action) {
    parkLegacyPanel();
    const mine = currentAssignment();
    let owner = null, args = [];
    if (action === 'delegate') { owner = window.openTaskDelegateAction; args = [state.taskId,mine?.assignee_id || window.currentUser?.id]; }
    if (action === 'extension') { owner = window.openTaskExtensionRequest; args = [state.taskId,mine?.assignee_id || window.currentUser?.id]; }
    if (action === 'transfer') {
      const target = selectedTransferTarget();
      if (!target) return toast('No active assignee is available to transfer.','fa-solid fa-circle-info','text-yellow-500');
      owner = window.openTaskTransferAction; args = [state.taskId,target];
    }
    if (typeof owner !== 'function') return toast('This task action is unavailable.','fa-solid fa-circle-exclamation','text-yellow-500');
    quarantineLegacyLayer();
    owner.apply(window,args);
    quarantineLegacyLayer();
    mountLegacyPanel(action);
    requestAnimationFrame(() => mountLegacyPanel(action));
  }

  function selectSpecialAction(action) {
    if (!availableSpecialActions().includes(action)) return;
    state.pendingCommit = false;
    if (action === 'submit') return showSubmitConfirm();
    invokeInlineSpecial(action);
  }

  async function afterSuccessfulAction() {
    const taskId = state.taskId, messageId = state.messageId;
    if (!taskId || !messageId) return;
    state.pendingCommit = false;
    parkLegacyPanel();
    quarantineLegacyLayer();
    try {
      await window.nfaRefreshTaskMessages?.();
      await window.loadMessages?.();
      await loadTask(taskId);
      if (taskState() === 'accepted') {
        exitTaskMode();
        requestAnimationFrame(decorateCompletedTasks);
        return;
      }
      ensureRepliesOpen(messageId);
      renderContext();
      await window.nfaNavigateToMessage?.(messageId,{taskId});
      ensureRepliesOpen(messageId);
      decorateTaskReplies();
      decorateCompletedTasks();
      upgradeWorkspaceIcons();
    } catch (error) {
      console.warn('[desktop-task-composer-v11] refresh/return failed',error);
    }
  }

  async function signedTaskFileUrl(path) {
    try {
      const { data, error } = await window.sb.storage.from('task-proofs').createSignedUrl(path,120);
      if (error) return '';
      return data?.signedUrl || '';
    } catch (_) { return ''; }
  }
  function makeReplyFileCard(path, name, noteHtml='') {
    const kind = fileKind(name || path);
    const wrap = document.createElement('div');
    wrap.className = 'nfa-v11-file-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nfa-v11-reply-file';
    button.style.setProperty('--nfa-file-colour',kind.colour);
    button.innerHTML = `<span class="nfa-v11-file-icon">${kind.image ? '<img data-v11-file-thumb alt="">' : `<i class="fa-solid ${kind.icon}"></i>`}</span><span class="nfa-v11-file-copy"><strong>${esc(name || 'Attached File')}</strong><small>${esc(kind.label)} · Click to open</small></span><span class="nfa-v11-file-open">${icon('external',15)}</span>`;
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); window.openSecureFile?.(path); });
    wrap.appendChild(button);
    if (kind.image) signedTaskFileUrl(path).then(url => { const img=button.querySelector('[data-v11-file-thumb]'); if(img&&url) img.src=url; });
    if (noteHtml) {
      const note = document.createElement('div');
      note.className = 'nfa-v11-file-note';
      note.innerHTML = sanitizeRichHtml(noteHtml);
      wrap.appendChild(note);
    }
    return wrap;
  }

  function parseFilePayload(raw) {
    const text = String(raw || '');
    const marker = text.indexOf(' — ');
    const payload = marker >= 0 ? text.slice(marker + 3).trim() : text.trim();
    const pathIndex = payload.indexOf('|tasks/');
    if (pathIndex < 1) return null;
    const name = payload.slice(0,pathIndex).trim().replace(/^📁\s*/,'').replace(/^Attached File:\s*/i,'');
    const rest = payload.slice(pathIndex + 1);
    const noteSep = rest.indexOf(`|${NOTE_PREFIX}`);
    const path = (noteSep >= 0 ? rest.slice(0,noteSep) : rest).trim();
    const noteHtml = noteSep >= 0 ? rest.slice(noteSep + NOTE_PREFIX.length + 1).trim() : '';
    return {name:name || path.split('/').pop() || 'Attached File',path,noteHtml};
  }
  function decorateReplyRichText(reply) {
    const text = reply.querySelector('.reply-text');
    if (!text || text.dataset.nfaV11RichDone === '1') return;
    const raw = text.textContent || '';
    const richIndex = raw.indexOf(RICH_PREFIX);
    if (richIndex < 0) return;
    const prefix = raw.slice(0,richIndex).replace(/\s*[—-]\s*$/,'').trim();
    const html = raw.slice(richIndex + RICH_PREFIX.length);
    text.replaceChildren();
    const label = document.createElement('div');
    label.className = 'nfa-v11-event-label';
    label.textContent = /progress update/i.test(prefix) ? 'Progress update' : prefix.replace(/^📋\s*/,'');
    text.appendChild(label);
    const rich = document.createElement('div');
    rich.className = 'nfa-v11-rich-reply';
    rich.innerHTML = sanitizeRichHtml(html);
    text.appendChild(rich);
    text.dataset.nfaV11RichDone = '1';
  }
  function decorateReplyFiles(reply) {
    const text = reply.querySelector('.reply-text');
    if (!text || text.dataset.nfaV11FileDone === '1') return;
    const payload = parseFilePayload(text.textContent || '');
    if (!payload) return;
    text.replaceChildren();
    const label = document.createElement('div');
    label.className = 'nfa-v11-event-label';
    label.textContent = 'File uploaded';
    text.appendChild(label);
    text.appendChild(makeReplyFileCard(payload.path,payload.name,payload.noteHtml));
    text.dataset.nfaV11FileDone = '1';
  }
  function compactReplyTools(reply) {
    if (reply.querySelector('.nfa-v11-reply-tools')) return;
    const tools = [...reply.querySelectorAll('.e-add,.reply-reaction,.reaction-btn,button[title*="reaction" i],button[title*="emoji" i]')]
      .filter(node => !node.closest('.nfa-v11-reply-file'));
    if (!tools.length) return;
    const slot = document.createElement('div');
    slot.className = 'nfa-v11-reply-tools';
    tools.forEach(tool => slot.appendChild(tool));
    reply.appendChild(slot);
  }
  function decorateTaskReplies() {
    document.querySelectorAll('#messagesContainer .nfa-has-task-v8 .reply-item').forEach(reply => {
      decorateReplyFiles(reply);
      decorateReplyRichText(reply);
      compactReplyTools(reply);
    });
  }

  function decorateCompletedTasks() {
    document.querySelectorAll('#messagesContainer .nfa-has-task-v8').forEach(row => {
      const bubble = row.querySelector('.nfa-task-message-v8');
      const completed = bubble?.classList.contains('nfa-completed');
      row.classList.toggle('nfa-v11-completed-task',Boolean(completed));
      if (!completed) return;
      bubble.setAttribute('aria-disabled','true');
      bubble.querySelectorAll('[data-v8-task-reminder],.nfa-v8-person-actions button,.nfa-v8-action-strip button').forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-disabled','true');
      });
      row.querySelectorAll('.act-btn').forEach(button => {
        const label=(button.textContent||'').replace(/\s+/g,' ').trim();
        if (/^Reply\b/i.test(label) && !/^Replies\b/i.test(label)) {
          button.disabled = true;
          button.setAttribute('aria-disabled','true');
          button.title = 'Completed task — read only';
        }
      });
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
    if (owner.__nfaV11Time) return true;
    const wrapped = async function(...args) {
      const result = await owner.apply(this,args);
      if (Array.isArray(result?.items)) {
        result.items.forEach(item => { if (item?.n?.created_at) item.n.created_at = normalizeUtcTimestamp(item.n.created_at); });
        result.items.sort((a,b) => new Date(b?.n?.created_at || 0) - new Date(a?.n?.created_at || 0));
      }
      return result;
    };
    wrapped.__nfaV11Time = true;
    wrapped.__nfaOriginal = owner;
    window.NFA_buildActivity = wrapped;
    return true;
  }

  function installReminderDedupe() {
    const owner = window.sendTaskReminder;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV11Dedupe) return true;
    const wrapped = async function(taskId,assigneeId,...rest) {
      const key = `${cleanId(taskId)}:${cleanId(assigneeId)}`;
      const now = Date.now();
      if (!key || key === ':') return false;
      if (state.reminderInflight.has(key)) return false;
      if (now - (state.reminderLast.get(key) || 0) < 2500) return false;
      state.reminderInflight.add(key);
      try {
        const result = await owner.call(this,taskId,assigneeId,...rest);
        if (result !== false) state.reminderLast.set(key,Date.now());
        return result;
      } finally { state.reminderInflight.delete(key); }
    };
    wrapped.__nfaV11Dedupe = true;
    wrapped.__nfaOriginal = owner;
    window.sendTaskReminder = wrapped;
    return true;
  }

  function installCloseOwner() {
    const owner = window.closeTaskActionLayer;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaV11) return true;
    state.closeOwner = owner;
    const wrapped = function(...args) {
      if (!state.taskId) return state.closeOwner.apply(this,args);
      const commit = state.pendingCommit;
      state.pendingCommit = false;
      parkLegacyPanel();
      const result = state.closeOwner.apply(this,args);
      quarantineLegacyLayer();
      if (commit) Promise.resolve(result).finally(afterSuccessfulAction);
      else if (state.specialPanel) { state.specialPanel.hidden = true; state.specialPanel.replaceChildren(); }
      return result;
    };
    wrapped.__nfaV11 = true;
    wrapped.__nfaOriginal = owner;
    window.closeTaskActionLayer = wrapped;
    return true;
  }

  function installCapture() {
    if (document.documentElement.dataset.nfaTaskComposerV11Capture === '1') return;
    document.documentElement.dataset.nfaTaskComposerV11Capture = '1';

    document.addEventListener('click', event => {
      if (!isDesktop()) return;
      const taskAction = event.target.closest('#messagesContainer .nfa-has-task-v8 .act-btn');
      if (taskAction) {
        const label = (taskAction.textContent || '').replace(/\s+/g,' ').trim();
        const row = taskAction.closest('.row-sent,.row-rcvd');
        const taskNode = row?.querySelector('[data-v8-task-message]');
        const taskId = cleanId(taskNode?.dataset.v8TaskMessage);
        const messageId = cleanId(row?.id?.replace(/^row-/,''));
        const completed = row?.querySelector('.nfa-task-message-v8')?.classList.contains('nfa-completed');
        if (/^Replies\b/i.test(label) && messageId) {
          event.preventDefault(); event.stopImmediatePropagation(); toggleTaskRepliesOnly(messageId); return;
        }
        if (/^Reply\b/i.test(label) && taskId && messageId) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (completed) { toast('Completed tasks are read-only.','fa-solid fa-lock','text-slate-500'); return; }
          activateTaskMode(taskId,messageId); return;
        }
      }
      if (state.taskId && event.target.closest('#sendBtn')) {
        event.preventDefault(); event.stopImmediatePropagation(); sendTaskComposer(); return;
      }
      if (state.taskId && event.target.closest('#nfaTaskComposerV11 #ntTaskActionPrimary')) state.pendingCommit = true;
      if (state.taskId && event.target.closest('#nfaTaskComposerV11 .nt-task-button-secondary')) state.pendingCommit = false;
    },true);

    document.addEventListener('change', event => {
      if (!state.taskId || !isDesktop()) return;
      const input = event.target.closest?.('#fileAttachment');
      if (!input) return;
      const file = input.files?.[0] || null;
      if (!file) return;
      event.stopImmediatePropagation();
      clearPendingFile();
      state.pendingFile = file;
      renderPendingFile();
      window.quillEditor?.focus?.();
    },true);
  }

  function installThemeOwner() {
    enforceTwoThemes();
    const owner=window.setTheme;
    if (typeof owner==='function' && !owner.__nfaV11) {
      const wrapped=function(themeId){ const result=owner.call(this,themeId==='dark'?'dark':'light'); requestAnimationFrame(()=>{enforceTwoThemes();upgradeWorkspaceIcons();}); return result; };
      wrapped.__nfaV11=true; wrapped.__nfaOriginal=owner; window.setTheme=wrapped;
    }
    return true;
  }
  function installRefreshHook() {
    const owner=window.nfaRefreshTaskMessages;
    if (typeof owner!=='function') return false;
    if (owner.__nfaV11) return true;
    const wrapped=async function(){ const result=await owner.apply(this,arguments); requestAnimationFrame(()=>{decorateTaskReplies();decorateCompletedTasks();upgradeWorkspaceIcons();}); return result; };
    wrapped.__nfaV11=true; wrapped.__nfaOriginal=owner; window.nfaRefreshTaskMessages=wrapped; return true;
  }
  function installMessageRenderHook() {
    const owner=window.renderMessages;
    if (typeof owner!=='function') return false;
    if (owner.__nfaV11) return true;
    const wrapped=function(){ const result=owner.apply(this,arguments); requestAnimationFrame(()=>{decorateTaskReplies();decorateCompletedTasks();upgradeWorkspaceIcons();}); return result; };
    wrapped.__nfaV11=true; wrapped.__nfaOriginal=owner; window.renderMessages=wrapped; return true;
  }
  function installRenderHook() {
    const owner=window.renderMainApp;
    if (typeof owner!=='function') return false;
    if (owner.__nfaV11) return true;
    const wrapped=async function(){ const result=await owner.apply(this,arguments); requestAnimationFrame(()=>{enforceTwoThemes();decorateTaskReplies();decorateCompletedTasks();upgradeWorkspaceIcons();if(state.taskId)renderContext();}); return result; };
    wrapped.__nfaV11=true; wrapped.__nfaOriginal=owner; window.renderMainApp=wrapped; return true;
  }

  function mount() {
    if (!isDesktop()) return;
    enforceTwoThemes();
    if (state.taskId) quarantineLegacyLayer();
    decorateTaskReplies();
    decorateCompletedTasks();
    upgradeWorkspaceIcons();
    if (state.taskId) renderContext();
  }
  function installWhenReady() {
    if (!isDesktop()) return;
    const ready=Boolean(window.nfaRefreshTaskMessages&&window.nfaNavigateToMessage&&window.closeTaskActionLayer&&window.taskAction&&document.getElementById('sendBtn')&&window.quillEditor);
    if (ready) {
      installCloseOwner(); installCapture(); installThemeOwner(); installRefreshHook(); installMessageRenderHook(); installRenderHook();
      installReminderDedupe(); installActivityTimeOwner(); mount(); return;
    }
    state.installFrames+=1;
    if (state.installFrames<480) requestAnimationFrame(installWhenReady);
  }

  window.nfaExitTaskComposer=exitTaskMode;
  window.nfaActivateTaskComposer=activateTaskMode;
  window.nfaTaskComposerV11State=state;
  window.nfaTaskComposerV11Helpers={cleanId,userName,effectiveStatus,normalizeUtcTimestamp,sanitizeRichHtml,richPlainText,fileKind};
  requestAnimationFrame(installWhenReady);
})();