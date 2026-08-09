/*
 * Stable desktop compatibility entry.
 *
 * Workspace v8 remains the canonical Task Message / Task Lens / sender / navigation owner.
 * Composer v11 binds Task Reply to the existing chat composer: formatting, emoji,
 * paperclip and Send remain the single input surface. Role parity v12 restores the
 * full role/state control set in that same composer. Professional PDF v11 owns
 * read-only Task Trail export. Mobile/native/coarse-pointer runtimes stay out.
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
    .then(() => import('./desktop-role-parity-v12.js?v=1'))
    .then(() => import('./desktop-task-pdf-v11.js?v=1'))
    .then(() => import('./desktop-task-pdf-click-v11.js?v=1'))
    .catch(error => {
      console.error('[desktop-workspace] load failed', error);
    });
})();