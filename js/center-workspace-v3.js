/*
 * Noted For Action — centre workspace router v3.
 *
 * Presentation/navigation adapter only. It reuses the existing chat, task,
 * bookmark and schedule owners; it does not query or mutate application data.
 */
(function () {
  'use strict';

  if (window.__NFA_CENTER_WORKSPACE_V3__) return;
  window.__NFA_CENTER_WORKSPACE_V3__ = true;

  const CSS_ID = 'nfa-center-workspace-v3-css';
  const HOST_ID = 'nfaCenterWorkspace';
  const BODY_ID = 'nfaCenterWorkspaceBody';
  const TITLE_ID = 'nfaCenterWorkspaceTitle';
  const SUBTITLE_ID = 'nfaCenterWorkspaceSubtitle';
  const BACK_ID = 'nfaCenterWorkspaceBack';
  const CLOSE_ID = 'nfaCenterWorkspaceClose';

  const state = {
    type: 'chat',
    taskId: null,
    taskMode: 'summary',
    taskRefreshTimer: null,
    taskObserver: null,
    wrapped: new Set(),
    decorating: false
  };

  const isDesktop = () => window.innerWidth > 768 && !window.IS_NATIVE;

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = './css/center-workspace-v3.css?v=214';
    document.head.appendChild(link);
  }

  function chatArea() {
    return document.querySelector('.chat-area');
  }

  function ensureHost() {
    if (!isDesktop()) return null;
    const area = chatArea();
    if (!area) return null;

    let host = document.getElementById(HOST_ID);
    if (host) return host;

    host = document.createElement('section');
    host.id = HOST_ID;
    host.className = 'nfa-center-workspace';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-hidden', 'true');
    host.innerHTML = `
      <header class="nfa-center-workspace-header">
        <button type="button" id="${BACK_ID}" class="nfa-center-workspace-back" aria-label="Back">
          <i class="fa-solid fa-arrow-left"></i><span>Back</span>
        </button>
        <div class="nfa-center-workspace-heading">
          <span class="nfa-center-workspace-eyebrow">Centre workspace</span>
          <strong id="${TITLE_ID}">Workspace</strong>
          <small id="${SUBTITLE_ID}"></small>
        </div>
        <button type="button" id="${CLOSE_ID}" class="nfa-center-workspace-close" aria-label="Return to conversation" title="Return to conversation">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <div id="${BODY_ID}" class="nfa-center-workspace-body"></div>
    `;

    area.appendChild(host);
    document.getElementById(CLOSE_ID)?.addEventListener('click', () => showChat());
    document.getElementById(BACK_ID)?.addEventListener('click', () => {
      if (state.type === 'task' && state.taskMode === 'manage' && state.taskId) {
        openTaskCenter(state.taskId, 'summary');
      } else {
        showChat();
      }
    });
    return host;
  }

  function setHeader(title, subtitle, canGoBack) {
    const titleNode = document.getElementById(TITLE_ID);
    const subtitleNode = document.getElementById(SUBTITLE_ID);
    const back = document.getElementById(BACK_ID);
    if (titleNode) titleNode.textContent = title || 'Workspace';
    if (subtitleNode) subtitleNode.textContent = subtitle || '';
    if (back) back.style.display = canGoBack ? 'inline-flex' : 'none';
  }

  function activateHost(type, title, subtitle, canGoBack) {
    const host = ensureHost();
    const area = chatArea();
    if (!host || !area) return null;

    state.type = type;
    area.classList.add('nfa-center-workspace-open');
    document.body.classList.add('nfa-center-workspace-active');
    document.body.classList.toggle('nfa-center-task-active', type === 'task');
    host.classList.add('nfa-open');
    host.setAttribute('aria-hidden', 'false');
    setHeader(title, subtitle, canGoBack);

    const body = document.getElementById(BODY_ID);
    if (body) body.innerHTML = '';
    return body;
  }

  function closeTaskActionLayerIfOpen() {
    try { window.closeTaskActionLayer?.(); } catch (_) {}
  }

  function showChat() {
    const host = document.getElementById(HOST_ID);
    const area = chatArea();
    closeTaskActionLayerIfOpen();
    state.type = 'chat';
    state.taskId = null;
    state.taskMode = 'summary';
    area?.classList.remove('nfa-center-workspace-open');
    document.body.classList.remove('nfa-center-workspace-active', 'nfa-center-task-active');
    host?.classList.remove('nfa-open');
    host?.setAttribute('aria-hidden', 'true');
    const body = document.getElementById(BODY_ID);
    if (body) body.innerHTML = '';
    markRail('stream');
  }

  window.nfaShowConversationCenter = showChat;

  function markRail(action) {
    const rail = document.getElementById('nfaActionRail');
    if (!rail) return;
    rail.querySelectorAll('.nfa-rail-item').forEach(button => {
      button.classList.toggle('active', button.dataset.nfaAction === action);
    });
  }

  function escapeSelector(value) {
    const text = String(value || '');
    return window.CSS?.escape ? CSS.escape(text) : text.replace(/["\\]/g, '\\$&');
  }

  function taskCard(taskId) {
    return document.querySelector(`#tasksPanel .nt-task-card[data-task-id="${escapeSelector(taskId)}"]`);
  }

  function removeDuplicateIds(root) {
    root.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  }

  function makeButton(label, iconClass, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nt-task-button nt-task-button-primary ${className}`.trim();
    button.innerHTML = `<i class="${iconClass}"></i>${label}`;
    return button;
  }

  function summaryClone(source, taskId) {
    const clone = source.cloneNode(true);
    clone.classList.add('nfa-center-task-card', 'nfa-center-task-summary');
    clone.classList.remove('nt-task-card-completed');
    clone.querySelector('.nt-task-expanded')?.remove();
    removeDuplicateIds(clone);

    const actionRow = clone.querySelector('.nt-task-action-row');
    if (actionRow) {
      actionRow.innerHTML = '';
      const manage = makeButton('Manage Task', 'fa-solid fa-sliders');
      manage.addEventListener('click', () => openTaskCenter(taskId, 'manage'));
      actionRow.appendChild(manage);

      const original = document.createElement('button');
      original.type = 'button';
      original.className = 'nt-task-button nt-task-button-secondary';
      original.innerHTML = '<i class="fa-regular fa-message"></i>Original Message';
      original.addEventListener('click', () => window.openTaskOriginalMessage?.(taskId));
      actionRow.appendChild(original);
    }
    return clone;
  }

  function manageClone(source, taskId) {
    const clone = source.cloneNode(true);
    clone.classList.add('nfa-center-task-card', 'nfa-center-task-manage');
    clone.classList.remove('nt-task-card-completed');
    removeDuplicateIds(clone);

    const details = clone.querySelector('.nt-task-expanded');
    if (details) {
      details.classList.add('nt-open');
      details.style.display = 'block';
    }

    clone.querySelectorAll('[onclick*="toggleTaskDetails"]').forEach(button => button.remove());

    const actionRow = clone.querySelector('.nt-task-action-row');
    if (actionRow) {
      const summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'nt-task-button nt-task-button-secondary nfa-task-summary-button';
      summary.innerHTML = '<i class="fa-solid fa-arrow-left"></i>Summary';
      summary.addEventListener('click', () => openTaskCenter(taskId, 'summary'));
      actionRow.appendChild(summary);
    }
    return clone;
  }

  async function waitForTaskCard(taskId) {
    let card = taskCard(taskId);
    if (card) return card;

    try { await window.loadTasksForPanel?.(); } catch (_) {}
    for (let attempt = 0; attempt < 30; attempt += 1) {
      card = taskCard(taskId);
      if (card) return card;
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    return null;
  }

  async function openTaskCenter(taskId, mode = 'summary') {
    if (!isDesktop() || !taskId) return false;
    const body = activateHost(
      'task',
      mode === 'manage' ? 'Manage Task' : 'Task Overview',
      mode === 'manage' ? 'Controls, assignees, files and complete trail' : 'Mobile-style summary with one clear management entry point',
      mode === 'manage'
    );
    if (!body) return false;

    state.taskId = String(taskId);
    state.taskMode = mode;
    markRail('tasks');
    body.innerHTML = '<div class="nfa-center-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading task…</div>';

    const source = await waitForTaskCard(taskId);
    if (!source || state.type !== 'task' || state.taskId !== String(taskId)) {
      if (!source && body) {
        body.innerHTML = '<div class="nfa-center-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Task unavailable</strong><span>The task may be outside your access or current filters.</span></div>';
      }
      return false;
    }

    body.innerHTML = '';
    body.appendChild(mode === 'manage' ? manageClone(source, taskId) : summaryClone(source, taskId));
    return true;
  }

  window.nfaOpenTaskCenter = openTaskCenter;

  function convertTaskButtons(card) {
    card.querySelectorAll('button[onclick*="toggleTaskDetails"]').forEach(button => {
      if (button.dataset.nfaManageReady === '1') return;
      button.dataset.nfaManageReady = '1';
      button.removeAttribute('onclick');
      button.classList.remove('nt-task-button-icon');
      button.classList.add('nfa-manage-task-trigger');
      button.removeAttribute('title');
      button.innerHTML = '<i class="fa-solid fa-sliders"></i>Manage Task';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openTaskCenter(card.dataset.taskId, 'manage');
      });
    });
  }

  function decorateTaskCards() {
    if (!isDesktop()) return;
    document.querySelectorAll('#tasksPanel .nt-task-card[data-task-id]').forEach(card => {
      convertTaskButtons(card);
      card.querySelector('.nt-task-expanded')?.classList.remove('nt-open');
      if (card.dataset.nfaCenterReady === '1') return;
      card.dataset.nfaCenterReady = '1';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Open task ${(card.querySelector('.nt-task-title')?.textContent || '').trim()}`);
      card.addEventListener('click', event => {
        if (event.target.closest('button,a,input,select,textarea,label')) return;
        openTaskCenter(card.dataset.taskId, 'summary');
      });
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openTaskCenter(card.dataset.taskId, 'summary');
      });
    });
  }

  function attachTaskObserver() {
    const panel = document.getElementById('tasksPanel');
    if (!panel || panel.dataset.nfaCenterObserved === '1') return;
    panel.dataset.nfaCenterObserved = '1';
    state.taskObserver = new MutationObserver(() => {
      decorateTaskCards();
      if (state.type === 'task' && state.taskId) {
        clearTimeout(state.taskRefreshTimer);
        state.taskRefreshTimer = setTimeout(() => openTaskCenter(state.taskId, state.taskMode), 90);
      }
    });
    state.taskObserver.observe(panel, { childList: true, subtree: true });
    decorateTaskCards();
  }

  function titleForPanel(type) {
    return type === 'bookmarks'
      ? ['Bookmarks', 'Saved messages and decisions']
      : ['Scheduled Messages', 'Pending messages arranged by delivery time'];
  }

  function mountTopPanel(type) {
    if (!isDesktop() || !['bookmarks', 'scheduled'].includes(type)) return false;
    const panels = [...document.querySelectorAll('.top-panel-dropdown')];
    const panel = panels[panels.length - 1];
    if (!panel) return false;

    const [title, subtitle] = titleForPanel(type);
    const body = activateHost(type, title, subtitle, false);
    if (!body) return false;
    panel.classList.add('nfa-center-panel-content');
    panel.removeAttribute('style');
    body.appendChild(panel);
    markRail(type === 'bookmarks' ? 'bookmarks' : 'scheduled');
    return true;
  }

  function wrapFunction(name, factory) {
    const current = window[name];
    if (typeof current !== 'function' || current.__nfaCenterWrapped) return;
    const wrapped = factory(current);
    wrapped.__nfaCenterWrapped = true;
    wrapped.__nfaCenterOriginal = current;
    window[name] = wrapped;
    state.wrapped.add(name);
  }

  function installWrappers() {
    wrapFunction('openTopPanel', original => async function(type, ...args) {
      const result = await original.call(this, type, ...args);
      if (isDesktop() && (type === 'bookmarks' || type === 'scheduled')) {
        mountTopPanel(type);
      }
      return result;
    });

    wrapFunction('deleteScheduled', original => async function(...args) {
      const result = await original.apply(this, args);
      if (isDesktop() && state.type === 'scheduled') {
        await window.openTopPanel?.('scheduled');
      }
      return result;
    });

    wrapFunction('goToMessage', original => async function(...args) {
      showChat();
      return original.apply(this, args);
    });

    wrapFunction('openTaskOriginalMessage', original => async function(...args) {
      showChat();
      return original.apply(this, args);
    });

    wrapFunction('goToTask', original => async function(taskId, ...args) {
      const result = await original.call(this, taskId, ...args);
      if (isDesktop()) await openTaskCenter(taskId, 'manage');
      return result;
    });

    wrapFunction('openTaskFromNotification', original => async function(taskId, ...args) {
      const result = await original.call(this, taskId, ...args);
      if (isDesktop()) await openTaskCenter(taskId, 'manage');
      return result;
    });
  }

  function mountTaskActionLayer() {
    if (!isDesktop() || state.type !== 'task') return;
    const layer = document.getElementById('ntTaskActionLayer');
    const host = document.getElementById(HOST_ID);
    if (!layer || !host || layer.parentElement === host) return;
    host.appendChild(layer);
    layer.classList.add('nfa-center-task-action-layer');
  }

  function handleNavigationCapture(event) {
    if (!isDesktop()) return;
    const chatTarget = event.target.closest('#chatsList [data-room], #chatsList [data-uid], #chatsList .channel-item');
    if (chatTarget) {
      showChat();
      return;
    }
    const railAction = event.target.closest('[data-nfa-action]')?.dataset.nfaAction;
    if (railAction === 'stream') showChat();
  }

  function decorate() {
    if (state.decorating) return;
    state.decorating = true;
    try {
      ensureCss();
      ensureHost();
      installWrappers();
      attachTaskObserver();
      decorateTaskCards();
      mountTaskActionLayer();
    } finally {
      state.decorating = false;
    }
  }

  ensureCss();
  document.addEventListener('click', handleNavigationCapture, true);
  new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => {
    if (!isDesktop()) showChat();
    decorate();
  }, { passive: true });
  window.addEventListener('pageshow', decorate, { passive: true });
  document.addEventListener('DOMContentLoaded', decorate, { once: true });
  setInterval(decorate, 1200);
  decorate();
})();
