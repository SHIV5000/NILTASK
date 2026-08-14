/*
 * Stable desktop compatibility entry.
 *
 * Workspace v8 remains the canonical Task Message / Task Lens / sender / navigation owner.
 * Composer v11 binds Task Reply to the existing chat composer. Role parity v12.1
 * restores the full role/state control set without redraw loops. WEB v14 owns the
 * no-flicker single-composer task-action bridge and read-only no-role presentation.
 * WEB v15 owns reminder single-delivery, private-path-safe attachment rendering,
 * top-bar Chat/Tasks placement, Activity mark-read, and unified target highlighting.
 * Professional PDF v11 owns Task Trail export.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_LOADER_V11__) return;
  window.__NFA_DESKTOP_WORKSPACE_LOADER_V11__ = true;

  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (
    window.IS_NATIVE ||
    window.innerWidth < 769 ||
    window.isMobileView?.() ||
    coarse
  ) return;

  if (!document.getElementById('nfa-desktop-workspace-v8-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-workspace-v8-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-workspace-v8.css?v=1';
    document.head.appendChild(link);
  }

  if (!document.getElementById('nfa-desktop-task-composer-v11-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-task-composer-v11-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-task-composer-v11.css?v=1';
    document.head.appendChild(link);
  }

  import('./desktop-workspace-v8.js?v=1')
    .then(() => import('./desktop-task-composer-v11.js?v=1'))
    .then(() => import('./desktop-role-parity-v12.js?v=2'))
    .then(() => import('./desktop-web-v14.js?v=1'))
    .then(() => import('./desktop-web-v15.js?v=1'))
    .then(() => import('./desktop-task-pdf-v11.js?v=1'))
    .then(() => import('./desktop-task-pdf-click-v11.js?v=1'))
    .catch(error => {
      console.error('[desktop-workspace] load failed', error);
    });
})();