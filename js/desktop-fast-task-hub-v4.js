/*
 * Noted For Action — desktop fast Task Hub v4.
 *
 * Approved interaction:
 * - chat composer remains chat-only;
 * - selecting a task opens only that task in the full Task Hub;
 * - closing the task restores every task card;
 * - existing task action owners are mounted inline instead of blocking the app;
 * - cached message identities hydrate without leaving "Unknown" senders.
 *
 * This layer does not duplicate task database logic, render a second task list,
 * create a realtime subscription, poll, or use a MutationObserver.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_FAST_TASK_HUB_V4__) return;
  window.__NFA_DESKTOP_FAST_TASK_HUB_V4__ = true;

  const state = {
    focusedTaskId: '',
    returnExpanded: false,
    createMode: false,
    createReturnExpanded: false,
    taskLoadOwner: null,
    toggleOwner: null,
    closeActionOwner: null,
    openTaskModalOwner: null,
    closeTaskModalOwner: null,
    taskModalCard: null,
    renderMessagesOwner: null,
    loadMessagesOwner: null,
    hydrationPromise: null,
    installFrames: 0
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

  function shellElements() {
    const right = document.getElementById('rightSidebar');
    const shell = right?.closest('.nfa-speed-shell') ||
      document.querySelector('#root > .nfa-speed-shell');
    const panel = document.getElementById('tasksPanel');
    const filters = document.getElementById('rightSidebarFilters');
    const range = document.getElementById('dateRangeFilter');
    const heading = document.getElementById('nfaTaskHubHeading');
    return { right, shell, panel, filters, range, heading };
  }

  function shellIsExpanded() {
    return Boolean(shellElements().shell?.classList.contains('nfa-task-hub-expanded'));
  }

  function setExpanded(value) {
    if (typeof window.nfaSetTaskHubExpanded === 'function') {
      window.nfaSetTaskHubExpanded(Boolean(value));
      return;
    }
    const { shell, right } = shellElements();
    shell?.classList.toggle('nfa-task-hub-expanded', Boolean(value));
    right?.classList.toggle('nfa-task-hub-expanded', Boolean(value));
  }

  function taskCard(taskId) {
    const id = cleanId(taskId);
    if (!id) return null;
    return document.querySelector(
      `.nt-task-card[data-task-id="${CSS.escape(id)}"]`
    );
  }

  function taskTitle(card) {
    return String(card?.querySelector('.nt-task-title')?.textContent || 'Task').trim();
  }

  function ensureFocusBar() {
    const { right, heading } = shellElements();
    if (!right) return null;

    let bar = document.getElementById('nfaFocusedTaskBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'nfaFocusedTaskBar';
      bar.innerHTML = `
        <div class="nfa-focused-task-copy">
          <span id="nfaFocusedTaskEyebrow">Focused task</span>
          <strong id="nfaFocusedTaskTitle">Task</strong>
        </div>
        <button type="button" id="nfaFocusedTaskClose" aria-label="Close task and show all task cards">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          <span>Close Task</span>
        </button>`;
      if (heading?.nextSibling) right.insertBefore(bar, heading.nextSibling);
      else if (heading) right.appendChild(bar);
      else right.insertBefore(bar, right.firstChild);
    }

    const close = document.getElementById('nfaFocusedTaskClose');
    if (close && close.dataset.nfaOwner !== '1') {
      close.dataset.nfaOwner = '1';
      close.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (state.createMode) window.closeTaskModal?.();
        else closeFocusedTask();
      });
    }
    return bar;
  }

  function setFocusBar(mode, title) {
    const bar = ensureFocusBar();
    if (!bar) return;
    bar.classList.add('nfa-open');
    document.getElementById('nfaFocusedTaskEyebrow').textContent =
      mode === 'create' ? 'New task' : 'Focused task';
    document.getElementById('nfaFocusedTaskTitle').textContent =
      title || (mode === 'create' ? 'Create Task' : 'Task');
    const closeText = bar.querySelector('#nfaFocusedTaskClose span');
    if (closeText) closeText.textContent = mode === 'create' ? 'Cancel' : 'Close Task';
  }

  function hideFocusBar() {
    document.getElementById('nfaFocusedTaskBar')?.classList.remove('nfa-open');
  }

  function ensureInlineHost() {
    const panel = document.getElementById('tasksPanel');
    const parent = panel?.parentElement;
    if (!parent) return null;

    let host = document.getElementById('nfaTaskInlineHost');
    if (!host) {
      host = document.createElement('section');
      host.id = 'nfaTaskInlineHost';
      host.setAttribute('aria-live', 'polite');
      parent.appendChild(host);
    }
    return host;
  }

  function decorateTaskCards() {
    const panel = document.getElementById('tasksPanel');
    if (!panel) return;
    panel.querySelectorAll('.nt-task-card[data-task-id]').forEach(card => {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute(
        'aria-label',
        `Open ${taskTitle(card)} in the full Task Hub`
      );
    });

    if (panel.dataset.nfaFastHubOwner === '1') return;
    panel.dataset.nfaFastHubOwner = '1';

    panel.addEventListener('click', event => {
      const card = event.target.closest('.nt-task-card[data-task-id]');
      if (!card || !panel.contains(card)) return;
      const taskId = cleanId(card.dataset.taskId);
      if (!taskId) return;

      const interactive = event.target.closest(
        'button,a,input,textarea,select,label,[contenteditable="true"]'
      );
      if (interactive) {
        const handler = String(interactive.getAttribute('onclick') || '');
        if (handler.includes('toggleTaskDetails')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          focusTask(taskId);
          return;
        }
        if (state.focusedTaskId !== taskId) focusTask(taskId);
        return;
      }

      event.preventDefault();
      focusTask(taskId);
    }, true);

    panel.addEventListener('keydown', event => {
      const card = event.target.closest('.nt-task-card[data-task-id]');
      if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      focusTask(card.dataset.taskId);
    });
  }

  function clearFocusedDom() {
    const { right, panel } = shellElements();
    right?.classList.remove('nfa-task-focused');
    panel?.querySelectorAll('.nt-task-card').forEach(card => {
      card.classList.remove('nfa-task-focus-hidden', 'nfa-task-focus-card');
      const details = card.querySelector('.nt-task-expanded');
      details?.classList.remove('nt-open');
      const icon = card.querySelector('[id^="nt-task-details-icon-"]');
      if (icon) icon.className = 'fa-solid fa-chevron-down';
    });
    hideFocusBar();
  }

  function applyFocusedDom() {
    const taskId = cleanId(state.focusedTaskId);
    const { right, panel } = shellElements();
    if (!taskId || !right || !panel) return false;

    const selected = taskCard(taskId);
    if (!selected) return false;

    right.classList.add('nfa-task-focused');
    panel.querySelectorAll('.nt-task-card[data-task-id]').forEach(card => {
      const match = card.dataset.taskId === taskId;
      card.classList.toggle('nfa-task-focus-hidden', !match);
      card.classList.toggle('nfa-task-focus-card', match);
    });

    const details = document.getElementById(`nt-task-details-${taskId}`);
    details?.classList.add('nt-open');
    const icon = document.getElementById(`nt-task-details-icon-${taskId}`);
    if (icon) icon.className = 'fa-solid fa-chevron-up';

    setFocusBar('task', taskTitle(selected));
    decorateTaskCards();
    requestAnimationFrame(() => panel.scrollTo({ top: 0, behavior: 'smooth' }));
    return true;
  }

  function focusTask(taskId) {
    const id = cleanId(taskId);
    if (!id || state.createMode) return false;

    if (!state.focusedTaskId) state.returnExpanded = shellIsExpanded();
    state.focusedTaskId = id;
    setExpanded(true);

    if (!applyFocusedDom()) {
      requestAnimationFrame(() => applyFocusedDom());
    }
    return true;
  }

  function closeFocusedTask(options = {}) {
    if (!state.focusedTaskId) return false;
    if (document.getElementById('ntTaskActionLayer')?.classList.contains('nt-open')) {
      window.closeTaskActionLayer?.();
    } else {
      restoreInlineActionPanel();
    }
    state.focusedTaskId = '';
    clearFocusedDom();
    if (options.restoreExpansion !== false) setExpanded(state.returnExpanded);
    state.returnExpanded = false;
    requestAnimationFrame(decorateTaskCards);
    return true;
  }

  function ensureTaskHubVisible() {
    const { right } = shellElements();
    if (!right) return false;
    if (window.getComputedStyle(right).display === 'none') {
      right.style.setProperty('display', 'flex', 'important');
      try { localStorage.setItem('mpgs_right_sidebar_state', 'flex'); } catch (_) {}
    }
    return true;
  }

  function mountInlineActionPanel(attempt = 0) {
    if (!state.focusedTaskId || state.createMode) return;
    const layer = document.getElementById('ntTaskActionLayer');
    const panel = layer?.querySelector('.nt-action-panel') ||
      document.querySelector('#nfaTaskInlineHost .nt-action-panel');
    const host = ensureInlineHost();

    if (!layer || !panel || !host || !layer.classList.contains('nt-open')) {
      if (attempt < 14) requestAnimationFrame(() => mountInlineActionPanel(attempt + 1));
      return;
    }

    const title = String(document.getElementById('ntTaskActionTitle')?.textContent || '');
    if (
      title === 'Progress Update' &&
      !document.getElementById('nfaTaskRichEditor') &&
      attempt < 8
    ) {
      requestAnimationFrame(() => mountInlineActionPanel(attempt + 1));
      return;
    }

    layer.classList.add('nfa-inline-action-layer');
    panel.classList.add('nfa-inline-action-panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-modal', 'false');
    host.classList.add('nfa-open');
    host.appendChild(panel);
    document.body.style.overflow = '';
    requestAnimationFrame(() => {
      panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({
        preventScroll: true
      });
    });
  }

  function restoreInlineActionPanel() {
    const host = document.getElementById('nfaTaskInlineHost');
    const layer = document.getElementById('ntTaskActionLayer');
    const panel = host?.querySelector('.nt-action-panel');
    if (panel && layer) {
      panel.classList.remove('nfa-inline-action-panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      layer.appendChild(panel);
    }
    host?.classList.remove('nfa-open', 'nfa-create-open');
    layer?.classList.remove('nfa-inline-action-layer');
    document.body.style.overflow = '';
  }

  function wrapCloseActionOwner() {
    const owner = window.closeTaskActionLayer;
    if (typeof owner !== 'function' || owner.__nfaFastHubV4Wrapped) return Boolean(owner);
    state.closeActionOwner = owner;
    const wrapped = function () {
      const result = owner.apply(this, arguments);
      restoreInlineActionPanel();
      return result;
    };
    wrapped.__nfaFastHubV4Wrapped = true;
    wrapped.__nfaFastHubV4Owner = owner;
    window.closeTaskActionLayer = wrapped;
    return true;
  }

  function wrapTaskActionOwner(name) {
    const owner = window[name];
    if (typeof owner !== 'function' || owner.__nfaFastHubV4Wrapped) return Boolean(owner);
    const wrapped = function () {
      const taskId = cleanId(arguments[0]);
      if (taskId) focusTask(taskId);
      const result = owner.apply(this, arguments);
      requestAnimationFrame(() => mountInlineActionPanel());
      Promise.resolve(result).finally(() => {
        requestAnimationFrame(() => mountInlineActionPanel());
      });
      return result;
    };
    wrapped.__nfaFastHubV4Wrapped = true;
    wrapped.__nfaFastHubV4Owner = owner;
    window[name] = wrapped;
    return true;
  }

  function wrapTaskActionOwners() {
    const names = [
      'openTaskUpdateAction',
      'openTaskUploadAction',
      'openTaskDelegateAction',
      'openTaskReturnAction',
      'openTaskTransferAction',
      'openTaskExtensionRequest',
      'openTaskDeadlineAction',
      'openTaskCancelAction'
    ];
    return names.map(wrapTaskActionOwner).every(Boolean);
  }

  function wrapToggleOwner() {
    const owner = window.toggleTaskDetails;
    if (typeof owner !== 'function' || owner.__nfaFastHubV4Wrapped) return Boolean(owner);
    state.toggleOwner = owner;
    const wrapped = function (taskId) {
      const id = cleanId(taskId);
      if (!id) return false;
      return focusTask(id);
    };
    wrapped.__nfaFastHubV4Wrapped = true;
    wrapped.__nfaFastHubV4Owner = owner;
    window.toggleTaskDetails = wrapped;
    return true;
  }

  function wrapTaskLoadOwner() {
    const owner = window.loadTasksForPanel;
    if (typeof owner !== 'function' || owner.__nfaFastHubV4Wrapped) return Boolean(owner);
    state.taskLoadOwner = owner;
    const wrapped = async function () {
      const result = await owner.apply(this, arguments);
      decorateTaskCards();

      if (state.focusedTaskId) {
        if (!applyFocusedDom()) closeFocusedTask();
      } else if (!state.createMode) {
        clearFocusedDom();
      }
      return result;
    };
    wrapped.__nfaFastHubV4Wrapped = true;
    wrapped.__nfaFastHubV4Owner = owner;
    window.loadTasksForPanel = wrapped;
    return true;
  }

  function enterCreateMode() {
    const { right, panel } = shellElements();
    const modal = document.getElementById('taskModal');
    const host = ensureInlineHost();
    const card = modal?.firstElementChild;
    if (!right || !panel || !modal || !host || !card) return false;

    state.createReturnExpanded = state.focusedTaskId
      ? state.returnExpanded
      : shellIsExpanded();

    if (document.getElementById('ntTaskActionLayer')?.classList.contains('nt-open')) {
      window.closeTaskActionLayer?.();
    }

    if (state.focusedTaskId) {
      state.focusedTaskId = '';
      clearFocusedDom();
    }

    state.createMode = true;
    ensureTaskHubVisible();
    setExpanded(true);
    right.classList.add('nfa-task-create-mode');
    setFocusBar('create', 'Create Task');

    state.taskModalCard = card;
    card.classList.add('nfa-inline-task-create-card');
    host.classList.add('nfa-open', 'nfa-create-open');
    host.appendChild(card);

    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    requestAnimationFrame(() => document.getElementById('taskTitle')?.focus({
      preventScroll: true
    }));
    return true;
  }

  function exitCreateMode(options = {}) {
    if (!state.createMode) return false;
    const modal = document.getElementById('taskModal');
    const host = document.getElementById('nfaTaskInlineHost');
    const card = state.taskModalCard || host?.querySelector('.nfa-inline-task-create-card');
    if (card && modal) {
      card.classList.remove('nfa-inline-task-create-card');
      modal.appendChild(card);
    }

    shellElements().right?.classList.remove('nfa-task-create-mode');
    host?.classList.remove('nfa-open', 'nfa-create-open');
    hideFocusBar();
    state.createMode = false;
    state.taskModalCard = null;

    if (options.restoreExpansion !== false) {
      setExpanded(state.createReturnExpanded);
    }
    state.createReturnExpanded = false;
    requestAnimationFrame(decorateTaskCards);
    return true;
  }

  function wrapTaskModalOwners() {
    const openOwner = window.openTaskModal;
    if (typeof openOwner === 'function' && !openOwner.__nfaFastHubV4Wrapped) {
      state.openTaskModalOwner = openOwner;
      const wrappedOpen = async function () {
        ensureTaskHubVisible();
        const result = await openOwner.apply(this, arguments);
        enterCreateMode();
        return result;
      };
      wrappedOpen.__nfaFastHubV4Wrapped = true;
      wrappedOpen.__nfaFastHubV4Owner = openOwner;
      window.openTaskModal = wrappedOpen;
    }

    const closeOwner = window.closeTaskModal;
    if (typeof closeOwner === 'function' && !closeOwner.__nfaFastHubV4Wrapped) {
      state.closeTaskModalOwner = closeOwner;
      const wrappedClose = function () {
        const result = closeOwner.apply(this, arguments);
        exitCreateMode();
        return result;
      };
      wrappedClose.__nfaFastHubV4Wrapped = true;
      wrappedClose.__nfaFastHubV4Owner = closeOwner;
      window.closeTaskModal = wrappedClose;
    }

    return Boolean(window.openTaskModal?.__nfaFastHubV4Wrapped) &&
      Boolean(window.closeTaskModal?.__nfaFastHubV4Wrapped);
  }

  function validProfile(profile) {
    const name = String(profile?.full_name || '').trim();
    const email = String(profile?.email || '').trim();
    return Boolean(
      (name && name.toLowerCase() !== 'unknown') ||
      (email && email.toLowerCase() !== 'unknown')
    );
  }

  function userMap() {
    return new Map((window.globalUsersCache || []).map(user => [user.id, user]));
  }

  function enrichMessageIdentities(messages) {
    const users = userMap();
    let missing = false;
    const enriched = (Array.isArray(messages) ? messages : []).map(message => {
      if (message?.sender_id === window.currentUser?.id) return message;
      if (validProfile(message?.profiles)) return message;

      const cached = users.get(message?.sender_id);
      if (validProfile(cached)) {
        return { ...message, profiles: cached };
      }

      missing = true;
      return {
        ...message,
        profiles: {
          ...(message?.profiles || {}),
          full_name: 'Loading sender…'
        }
      };
    });
    return { enriched, missing };
  }

  async function hydrateCurrentRoom(force = false) {
    const room = window.currentRoom;
    if (!room || !Array.isArray(window._roomMsgs) || !window._roomMsgs.length) return;
    try {
      await window.ensureUsersLoaded?.(force);
    } catch (_) {}

    if (window.currentRoom !== room) return;
    let users = userMap();
    let unresolved = window._roomMsgs.some(message =>
      message.sender_id !== window.currentUser?.id &&
      !validProfile(message.profiles) &&
      !validProfile(users.get(message.sender_id))
    );

    if (unresolved && !force) {
      try { await window.ensureUsersLoaded?.(true); } catch (_) {}
      if (window.currentRoom !== room) return;
      users = userMap();
    }

    const hydrated = window._roomMsgs.map(message => {
      if (message.sender_id === window.currentUser?.id || validProfile(message.profiles)) {
        return message;
      }
      const cached = users.get(message.sender_id);
      return validProfile(cached) ? { ...message, profiles: cached } : message;
    });

    window._roomMsgs = hydrated;
    window.renderMessages?.(hydrated);
  }

  function scheduleIdentityHydration() {
    if (state.hydrationPromise) return state.hydrationPromise;
    state.hydrationPromise = hydrateCurrentRoom(false)
      .finally(() => { state.hydrationPromise = null; });
    return state.hydrationPromise;
  }

  function wrapMessageOwners() {
    const renderOwner = window.renderMessages;
    if (typeof renderOwner === 'function' && !renderOwner.__nfaFastHubV4Wrapped) {
      state.renderMessagesOwner = renderOwner;
      const wrappedRender = function (messages) {
        const { enriched, missing } = enrichMessageIdentities(messages);
        const result = renderOwner.apply(
          this,
          [enriched, ...Array.prototype.slice.call(arguments, 1)]
        );
        if (missing) scheduleIdentityHydration();
        return result;
      };
      wrappedRender.__nfaFastHubV4Wrapped = true;
      wrappedRender.__nfaFastHubV4Owner = renderOwner;
      window.renderMessages = wrappedRender;
    }

    const loadOwner = window.loadMessages;
    if (typeof loadOwner === 'function' && !loadOwner.__nfaFastHubV4Wrapped) {
      state.loadMessagesOwner = loadOwner;
      const wrappedLoad = async function () {
        const usersReady = window.ensureUsersLoaded?.();
        const result = await loadOwner.apply(this, arguments);
        try { await usersReady; } catch (_) {}
        await hydrateCurrentRoom(false);
        return result;
      };
      wrappedLoad.__nfaFastHubV4Wrapped = true;
      wrappedLoad.__nfaFastHubV4Owner = loadOwner;
      window.loadMessages = wrappedLoad;
    }

    return Boolean(window.renderMessages?.__nfaFastHubV4Wrapped) &&
      Boolean(window.loadMessages?.__nfaFastHubV4Wrapped);
  }

  function installShellEvents() {
    const rail = document.getElementById('nfaDesktopRail');
    if (rail && rail.dataset.nfaFastHubV4Owner !== '1') {
      rail.dataset.nfaFastHubV4Owner = '1';
      rail.addEventListener('click', event => {
        const action = event.target.closest('[data-nfa-action]')?.dataset?.nfaAction;
        if (!action || action === 'tasks') return;
        if (state.createMode) window.closeTaskModal?.();
        else if (state.focusedTaskId) closeFocusedTask();
      }, true);
    }

    if (document.documentElement.dataset.nfaFastHubV4KeyOwner !== '1') {
      document.documentElement.dataset.nfaFastHubV4KeyOwner = '1';
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (state.createMode) {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.closeTaskModal?.();
          return;
        }
        if (state.focusedTaskId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeFocusedTask();
        }
      }, true);
    }
  }

  function installWhenReady() {
    if (!isDesktop()) return;
    const ready = [
      wrapTaskLoadOwner(),
      wrapToggleOwner(),
      wrapCloseActionOwner(),
      wrapTaskActionOwners(),
      wrapTaskModalOwners(),
      wrapMessageOwners()
    ].every(Boolean);

    ensureFocusBar();
    ensureInlineHost();
    decorateTaskCards();
    installShellEvents();

    if (ready) {
      if (Array.isArray(window._roomMsgs) && window._roomMsgs.length) {
        scheduleIdentityHydration();
      }
      return;
    }

    state.installFrames += 1;
    if (state.installFrames < 240) requestAnimationFrame(installWhenReady);
  }

  window.nfaFocusTaskInFullHub = focusTask;
  window.nfaCloseFocusedTask = closeFocusedTask;
  window.nfaHydrateMessageSenders = hydrateCurrentRoom;

  requestAnimationFrame(installWhenReady);
})();
