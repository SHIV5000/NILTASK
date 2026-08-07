/*
 * Compatibility loader: the old desktop Task Hub workflow is retired.
 * The existing import path remains stable, but now loads the approved
 * Task Message + Task Lens workspace instead.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_MESSAGE_LOADER_V6__) return;
  window.__NFA_DESKTOP_TASK_MESSAGE_LOADER_V6__ = true;

  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (
    window.IS_NATIVE ||
    window.innerWidth < 769 ||
    window.isMobileView?.() ||
    coarse
  ) return;

  if (!document.getElementById('nfa-desktop-task-messages-v6-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-task-messages-v6-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-task-messages-v6.css?v=1';
    document.head.appendChild(link);
  }

  import('./desktop-task-messages-v6.js?v=1').catch(error => {
    console.error('[desktop-task-messages-v6] load failed', error);
  });
})();
