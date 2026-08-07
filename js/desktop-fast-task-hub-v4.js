/*
 * Stable desktop compatibility entry.
 *
 * The old Task Hub / v6 / hotfix chain is retired. This loader now starts the
 * single authoritative Desktop Workspace v8 controller: Task Messages, central
 * Task Lens, sender identity hydration and universal single-scroll navigation.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_LOADER_V8__) return;
  window.__NFA_DESKTOP_WORKSPACE_LOADER_V8__ = true;

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

  import('./desktop-workspace-v8.js?v=1').catch(error => {
    console.error('[desktop-workspace-v8] load failed', error);
  });
})();
