/*
 * Stable desktop compatibility entry.
 *
 * Workspace v8 remains the canonical Task Message / Task Lens / sender / navigation owner.
 * Composer v10 is the sole desktop task-input, dialog-quarantine, reply-file,
 * reminder-dedupe and two-theme presentation owner. Mobile/native/coarse stay out.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_LOADER_V10__) return;
  window.__NFA_DESKTOP_WORKSPACE_LOADER_V10__ = true;

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

  if (!document.getElementById('nfa-desktop-task-composer-v10-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-task-composer-v10-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-task-composer-v10.css?v=1';
    document.head.appendChild(link);
  }

  import('./desktop-workspace-v8.js?v=1')
    .then(() => import('./desktop-task-composer-v10.js?v=1'))
    .catch(error => {
      console.error('[desktop-workspace] load failed', error);
    });
})();