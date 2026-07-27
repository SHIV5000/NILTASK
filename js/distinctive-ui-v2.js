/*
 * Noted For Action — distinctive presentation adapter v2.
 *
 * This file does not own application data or replace any runtime owner. It only
 * decorates the existing authenticated desktop/mobile DOM and routes new visual
 * navigation controls to the already-existing public window actions.
 */
(function () {
  'use strict';

  if (window.__NFA_DISTINCTIVE_V2__) return;
  window.__NFA_DISTINCTIVE_V2__ = true;

  const CSS_ID = 'nfa-distinctive-v2-css';
  const COMPACT_CSS_ID = 'nfa-distinctive-compact-css';
  const RAIL_ID = 'nfaActionRail';
  const LEFT_KEY = 'nfa_v2_left_width';
  const RIGHT_KEY = 'nfa_v2_right_width';
  let scheduled = false;
  let activeDrag = null;

  function ensureStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureCss() {
    ensureStylesheet(CSS_ID, './css/distinctive-ui-v2.css?v=212');
    ensureStylesheet(COMPACT_CSS_ID, './css/distinctive-ui-compact.css?v=213');
  }

  function call(name, ...args) {
    const fn = window[name];
    if (typeof fn === 'function') return fn(...args);
  }

  function icon(name) {
    const icons = {
      stream: '<path d="M5 4h14v5H5zM5 12h8v8H5zM16 12h3v8h-3z"/>',
      tasks: '<path d="M5 6h14M5 12h14M5 18h9"/><path d="m17 17 2 2 3-4"/>',
      pulse: '<path d="M4 13h4l2-7 4 13 2-6h4"/>',
      later: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      saved: '<path d="M6 4h12v17l-6-4-6 4z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1A7 7 0 0 0 15 6l-.3-2.7h-4L10.4 6A7 7 0 0 0 9 7.1l-2.5-1-2 3.4L6.5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1A7 7 0 0 0 10.4 18l.3 2.7h4L15 18a7 7 0 0 0 1.4-1.1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.stream}</svg>`;
  }

  function railButton(name, label, action, active) {
    return `<button type="button" class="nfa-rail-item${active ? ' active' : ''}" data-nfa-action="${action}" title="${label}">${icon(name)}<span>${label}</span></button>`;
  }

  function createRail(leftSidebar) {
    if (document.getElementById(RAIL_ID)) return;
    const shell = leftSidebar.parentElement;
    if (!shell) return;

    const rail = document.createElement('aside');
    rail.id = RAIL_ID;
    rail.className = 'nfa-action-rail';
    rail.setAttribute('aria-label', 'Noted For Action navigation');
    rail.innerHTML = `
      <div class="nfa-rail-brand" title="Noted For Action">N</div>
      <nav class="nfa-rail-nav">
        ${railButton('stream', 'Stream', 'stream', true)}
        ${railButton('tasks', 'Tasks', 'tasks')}
        ${railButton('pulse', 'Pulse', 'activity')}
        ${railButton('later', 'Later', 'scheduled')}
        ${railButton('saved', 'Saved', 'bookmarks')}
      </nav>
      <div class="nfa-rail-bottom">
        ${railButton('settings', 'Settings', 'settings')}
        <button type="button" class="nfa-rail-avatar" data-nfa-action="settings" title="Profile">${((window.currentUser?.user_metadata?.full_name || window.currentUser?.email || 'N').trim().charAt(0) || 'N').toUpperCase()}</button>
      </div>`;

    rail.addEventListener('click', (event) => {
      const button = event.target.closest('[data-nfa-action]');
      if (!button) return;
      const action = button.dataset.nfaAction;
      rail.querySelectorAll('.nfa-rail-item').forEach(el => el.classList.toggle('active', el === button));
      if (action === 'stream') {
        if (leftSidebar.style.display === 'none') call('toggleLeftSidebar');
        document.getElementById('chatsList')?.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'tasks') {
        const right = document.getElementById('rightSidebar');
        if (right?.style.display === 'none') call('toggleRightSidebar');
        else right?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else if (action === 'activity') call('openActivityFeed');
      else if (action === 'scheduled') call('openTopPanel', 'scheduled');
      else if (action === 'bookmarks') call('openTopPanel', 'bookmarks');
      else if (action === 'settings') call('openSettings');
    });

    shell.insertBefore(rail, leftSidebar);
  }

  function adaptiveDefaults() {
    const compact = window.innerWidth <= 1550 || window.innerHeight <= 900;
    if (window.innerWidth <= 1100) return { left: 220, right: 255 };
    if (compact) return { left: 250, right: 285 };
    return { left: 290, right: 320 };
  }

  function safeNumber(value) {
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : null;
  }

  function savedWidth(key) {
    try { return safeNumber(localStorage.getItem(key)); }
    catch (e) { return null; }
  }

  function storeWidth(key, value) {
    try { localStorage.setItem(key, String(Math.round(value))); }
    catch (e) {}
  }

  function setPanelWidth(side, value, persist) {
    const body = document.body;
    if (!body) return;
    const minimum = side === 'left' ? 220 : 250;
    const absoluteMaximum = side === 'left' ? 420 : 520;
    const width = Math.max(minimum, Math.min(absoluteMaximum, Math.round(value)));
    body.style.setProperty(side === 'left' ? '--nfa-left-panel-width' : '--nfa-right-panel-width', `${width}px`);
    if (persist) storeWidth(side === 'left' ? LEFT_KEY : RIGHT_KEY, width);
  }

  function currentPanelWidth(side) {
    const element = document.getElementById(side === 'left' ? 'leftSidebar' : 'rightSidebar');
    return element?.getBoundingClientRect().width || adaptiveDefaults()[side];
  }

  function maximumPanelWidth(side) {
    const shell = document.querySelector('.nfa-desktop-shell');
    if (!shell) return side === 'left' ? 420 : 520;
    const railWidth = document.getElementById(RAIL_ID)?.getBoundingClientRect().width || 0;
    const opposite = side === 'left' ? document.getElementById('rightSidebar') : document.getElementById('leftSidebar');
    const oppositeVisible = opposite && getComputedStyle(opposite).display !== 'none';
    const oppositeWidth = oppositeVisible ? opposite.getBoundingClientRect().width : 0;
    const centerMinimum = window.innerWidth <= 1250 ? 430 : 520;
    const available = shell.clientWidth - railWidth - oppositeWidth - centerMinimum - 24;
    const hardMaximum = side === 'left' ? 420 : 520;
    const minimum = side === 'left' ? 220 : 250;
    return Math.max(minimum, Math.min(hardMaximum, available));
  }

  function applyInitialPanelWidths(forceAdaptive) {
    const defaults = adaptiveDefaults();
    const left = forceAdaptive ? defaults.left : (savedWidth(LEFT_KEY) ?? defaults.left);
    const right = forceAdaptive ? defaults.right : (savedWidth(RIGHT_KEY) ?? defaults.right);
    setPanelWidth('left', Math.min(left, maximumPanelWidth('left')), forceAdaptive);
    setPanelWidth('right', Math.min(right, maximumPanelWidth('right')), forceAdaptive);
    document.body?.classList.add('nfa-user-resizable');
  }

  function stopLegacyMouseResize(event) {
    event.stopImmediatePropagation();
  }

  function beginPanelDrag(side, event) {
    if (event.button !== undefined && event.button !== 0) return;
    const panel = document.getElementById(side === 'left' ? 'leftSidebar' : 'rightSidebar');
    const handle = document.getElementById(side === 'left' ? 'leftResizer' : 'rightResizer');
    if (!panel || !handle) return;
    event.preventDefault();
    activeDrag = { side, panel, handle, pointerId: event.pointerId };
    try { handle.setPointerCapture(event.pointerId); } catch (e) {}
    document.body.classList.add('nfa-panel-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function movePanelDrag(event) {
    if (!activeDrag) return;
    const { side, panel } = activeDrag;
    const rect = panel.getBoundingClientRect();
    const rawWidth = side === 'left' ? event.clientX - rect.left : rect.right - event.clientX;
    const minimum = side === 'left' ? 220 : 250;
    const width = Math.max(minimum, Math.min(maximumPanelWidth(side), rawWidth));
    setPanelWidth(side, width, false);
  }

  function endPanelDrag() {
    if (!activeDrag) return;
    const side = activeDrag.side;
    storeWidth(side === 'left' ? LEFT_KEY : RIGHT_KEY, currentPanelWidth(side));
    activeDrag = null;
    document.body.classList.remove('nfa-panel-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function attachPanelHandle(side) {
    const id = side === 'left' ? 'leftResizer' : 'rightResizer';
    const handle = document.getElementById(id);
    if (!handle || handle.dataset.nfaResizeReady === '1') return;
    handle.dataset.nfaResizeReady = '1';
    handle.title = `Drag to resize ${side} panel · Double-click to reset`;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.addEventListener('mousedown', stopLegacyMouseResize, true);
    handle.addEventListener('pointerdown', event => beginPanelDrag(side, event));
    handle.addEventListener('dblclick', event => {
      event.preventDefault();
      const defaults = adaptiveDefaults();
      setPanelWidth(side, defaults[side], true);
    });
  }

  function ensurePanelResizing() {
    if (!document.getElementById('leftSidebar')) return;
    if (!document.body.dataset.nfaPanelSizingReady) {
      document.body.dataset.nfaPanelSizingReady = '1';
      applyInitialPanelWidths(false);
      window.addEventListener('pointermove', movePanelDrag, { passive: true });
      window.addEventListener('pointerup', endPanelDrag, { passive: true });
      window.addEventListener('pointercancel', endPanelDrag, { passive: true });
    }
    attachPanelHandle('left');
    attachPanelHandle('right');
  }

  function decorateDesktop() {
    const left = document.getElementById('leftSidebar');
    const root = document.getElementById('root');
    if (!left || !root || getComputedStyle(root).display === 'none') return;

    document.body.classList.add('nfa-distinctive', 'nfa-desktop-active');
    const shell = left.parentElement;
    shell?.classList.add('nfa-desktop-shell');
    left.classList.add('nfa-stream-panel');
    createRail(left);

    const chat = shell?.querySelector('.chat-area');
    chat?.classList.add('nfa-conversation');
    chat?.children?.[0]?.classList.add('nfa-conversation-head');

    document.getElementById('messagesContainer')?.classList.add('nfa-timeline');
    document.getElementById('chatShellContainer')?.classList.add('nfa-timeline-shell');
    document.getElementById('rightSidebar')?.classList.add('nfa-context-panel');

    const send = document.getElementById('sendBtn');
    const composer = send?.closest('.border-t');
    composer?.classList.add('nfa-composer');

    const chats = document.getElementById('chatsList');
    if (chats && !document.getElementById('nfaWorkstreamHeading')) {
      const heading = document.createElement('div');
      heading.id = 'nfaWorkstreamHeading';
      heading.className = 'nfa-workstream-heading';
      heading.innerHTML = '<div><span>School workspace</span><strong>Workstreams</strong></div><button type="button" title="Create workstream">+</button>';
      heading.querySelector('button').addEventListener('click', () => call('openNewGroupModal'));
      chats.parentElement?.insertBefore(heading, chats);
    }

    const right = document.getElementById('rightSidebar');
    const filters = document.getElementById('rightSidebarFilters');
    if (right && filters && !document.getElementById('nfaContextHeading')) {
      const head = document.createElement('div');
      head.id = 'nfaContextHeading';
      head.className = 'nfa-context-heading';
      head.innerHTML = '<span>Context panel</span><strong>Action pulse</strong><small>Tasks, ownership and progress</small>';
      right.querySelector(':scope > div')?.insertBefore(head, filters);
    }

    normalizeLabels(chats);
    ensurePanelResizing();
  }

  function normalizeLabels(scope) {
    if (!scope) return;
    scope.querySelectorAll('div,span,p').forEach((el) => {
      if (el.children.length) return;
      const text = (el.textContent || '').trim().toUpperCase();
      if (text === 'DEPARTMENTS') el.textContent = 'WORKSTREAMS';
      if (text === 'STAFF MEMBERS') el.textContent = 'DIRECT';
    });
  }

  function decorateMobile() {
    const app = document.getElementById('mobileApp');
    if (!app) return;
    document.body.classList.add('nfa-distinctive', 'nfa-mobile-active');
    app.classList.add('nfa-mobile-shell');
    document.getElementById('mStage')?.classList.add('nfa-mobile-stage');
    document.getElementById('mNav')?.classList.add('nfa-mobile-dock');

    const top = document.getElementById('mSB');
    if (top && !top.querySelector('.nfa-mobile-brand-mark')) {
      const mark = document.createElement('div');
      mark.className = 'nfa-mobile-brand-mark';
      mark.innerHTML = '<b>N</b><span><strong>Noted For Action</strong><small>Action workspace</small></span>';
      top.insertBefore(mark, top.firstChild);
    }

    const nav = document.getElementById('mNav');
    if (nav) {
      const buttons = [...nav.querySelectorAll('.mn-btn')];
      if (buttons.length >= 3) buttons[Math.floor(buttons.length / 2)]?.classList.add('nfa-dock-primary');
    }
  }

  function decorate() {
    scheduled = false;
    ensureCss();
    decorateDesktop();
    decorateMobile();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  ensureCss();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => {
    if (document.body?.dataset.nfaPanelSizingReady && !activeDrag) {
      const left = Math.min(currentPanelWidth('left'), maximumPanelWidth('left'));
      const right = Math.min(currentPanelWidth('right'), maximumPanelWidth('right'));
      setPanelWidth('left', left, false);
      setPanelWidth('right', right, false);
    }
    schedule();
  }, { passive: true });
  window.addEventListener('pageshow', schedule, { passive: true });
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  setInterval(schedule, 1600);
  schedule();
})();
