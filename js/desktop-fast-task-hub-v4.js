/*
 * Stable desktop compatibility entry.
 *
 * Workspace v8 remains the canonical Task Message / Task Lens / navigation owner.
 * Composer v9 owns only task-context input and the two-theme desktop presentation:
 * Indigo Light + GitHub-inspired Dark. Mobile/native/coarse-pointer runtimes stay out.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_LOADER_V9__) return;
  window.__NFA_DESKTOP_WORKSPACE_LOADER_V9__ = true;

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

  if (!document.getElementById('nfa-desktop-task-composer-v9-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-task-composer-v9-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-task-composer-v9.css?v=1';
    document.head.appendChild(link);
  }

  import('./desktop-workspace-v8.js?v=1')
    .then(() => import('./desktop-task-composer-v9.js?v=1'))
    .catch(error => {
      console.error('[desktop-workspace] load failed', error);
    });
})();